"""
ZOOR UP Direct UPI Payment Routes
Provides direct UPI payments with dynamic UPI deep links per business.
No third-party payment gateway dependencies.

Also includes Razorpay TEST MODE payment routes (delegated to razorpay_service).
"""
import os
import time
import secrets
import urllib.parse
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, status, Depends, Request
from backend.database import db_instance, get_collection
from backend.auth import get_current_user
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER, ROLE_SUPER_ADMIN, ROLE_STAFF
from backend.rate_limit import enforce_rate_limit
from backend.razorpay_service import (
    RAZORPAY_MODE,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    SUBSCRIPTION_PLAN_PRICING,
    create_razorpay_order_for_payment,
    verify_razorpay_payment,
    create_razorpay_order_for_subscription,
    verify_razorpay_subscription_payment,
    get_razorpay_payment_by_order_id,
    record_razorpay_payment_failure,
    verify_razorpay_webhook_signature,
    process_razorpay_webhook_event,
)
from backend.settlement_service import get_business_settlement_summary

router = APIRouter(prefix="/api/payments", tags=["UPI Payments"])

MERCHANT_BRAND = "ZOOR UP"
# ZOOR UP Platform UPI for subscription payments (fixed, not per-business)
PLATFORM_UPI = os.environ.get("PLATFORM_UPI", "8521893325@ybl")

if RAZORPAY_MODE != "test":
    print(f"[RAZORPAY] WARNING: RAZORPAY_MODE is '{RAZORPAY_MODE}'. Only 'test' mode is supported.")

class DirectUpiPaymentRequest(BaseModel):
    business_id: Optional[str] = None
    amount: Optional[float] = None
    order_id: Optional[str] = None
    notes: Optional[str] = "ZOOR UP Payment"
    customer_id: Optional[str] = None

class DirectUpiVerifyRequest(BaseModel):
    payment_id: str
    transaction_reference: Optional[str] = None
    utr: Optional[str] = None

def _generate_upi_uri(vpa: str, biz_name: str, amount: float, note: str, order_ref: str) -> str:
    """Generate UPI intent URI with proper encoding."""
    params = {
        "pa": vpa,
        "pn": biz_name,
        "am": f"{amount:.2f}",
        "cu": "INR",
        "tn": note,
        "tr": order_ref
    }
    encoded_query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote, safe="@")
    return f"upi://pay?{encoded_query}"

@router.post("/upi/create")
@router.post("/create")
def create_direct_upi_payment(req: DirectUpiPaymentRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """
    Creates a direct UPI payment intent with dynamic amount.
    Does NOT mark payment as paid simply because intent was created.
    """
    role = (current_user.get("role") or "").upper()
    enforce_rate_limit("direct-upi-create-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("direct-upi-create-ip", request.client.host if request.client else "unknown", 40, 3600)
    if role not in (ROLE_CUSTOMER, ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Payment initiation is not available for this account.")
    if not req.order_id:
        raise HTTPException(status_code=400, detail="An existing order is required to initiate a payment.")

    business_id = req.business_id
    customer_id = None
    if role == ROLE_BUSINESS_OWNER:
        biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
        if not biz or (business_id and business_id != biz.get("id")):
            raise HTTPException(status_code=403, detail="You can only initiate payments for your own business.")
        business_id = biz["id"]
    elif role == ROLE_CUSTOMER:
        customer = get_collection("customers").find_one({"user_id": current_user["id"]})
        if not customer:
            raise HTTPException(status_code=403, detail="Customer profile could not be verified.")
        customer_id = customer.get("customer_id")
        if business_id and not get_collection("customer_businesses").find_one({"customer_id": customer_id, "business_id": business_id, "status": "active"}):
            raise HTTPException(status_code=403, detail="This business is not connected to your account.")

    order = get_collection("orders").find_one({"id": req.order_id})
    if not order:
        order = get_collection("orders").find_one({"order_id": req.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found for this account.")

    if not business_id:
        business_id = order.get("business_id")
    elif order.get("business_id") != business_id:
        raise HTTPException(status_code=400, detail="Business ID does not match order.")

    if customer_id and order.get("customer_id") != customer_id and order.get("customer_user_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Order access not allowed.")

    # Backend calculates the authoritative amount from the order
    amount = float(order.get("total_amount") or order.get("total") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="The order has no payable balance.")

    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"
    payment_id = f"pay_{int(now.timestamp())}_{secrets.token_hex(4)}"

    # Fetch saved UPI ID of this exact business from backend
    biz = get_collection("businesses").find_one({"id": business_id})
    if not biz:
        raise HTTPException(status_code=404, detail="Store not found.")

    vpa = (biz.get("upi_id") or "").strip()
    if not vpa:
        raise HTTPException(
            status_code=400,
            detail="This store has not configured a UPI payment ID yet. Please contact the store or choose another payment method."
        )

    biz_name = (biz.get("upi_name") or biz.get("name") or "Store").strip()
    order_ref = order.get("order_id") or order.get("id") or req.order_id
    note = req.notes or f"Payment for Order {order_ref}"

    upi_uri = _generate_upi_uri(vpa, biz_name, amount, note, order_ref)

    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": customer_id or order.get("customer_id"),
        "order_id": order.get("id") or req.order_id,
        "amount": amount,
        "currency": "INR",
        "upi_id": vpa,
        "status": "pending",
        "transaction_reference": payment_id,
        "upi_uri": upi_uri,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    db_instance.payments.insert_one(payment_record)

    return {
        "success": True,
        "payment_id": payment_id,
        "amount": amount,
        "currency": "INR",
        "upi_id": vpa,
        "upi_uri": upi_uri,
        "status": "pending"
    }

@router.get("/business")
def get_business_payments(
    status: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("created_at"),
    sort_dir: Optional[str] = Query("desc"),
    current_user: dict = Depends(get_current_user),
):
    """Returns all payments for the authenticated business owner's business."""
    role = (current_user.get("role") or "").upper()
    if role not in (ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN, ROLE_STAFF):
        raise HTTPException(status_code=403, detail="Business owner access required.")

    biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
    if not biz:
        biz = get_collection("businesses").find_one({"id": current_user.get("business_id")})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    biz_id = biz["id"]
    payments_col = db_instance.payments

    query = {"business_id": biz_id}
    if status and status != "ALL":
        query["status"] = status.lower()

    all_payments = payments_col.find(query)

    for p in all_payments:
        # Determine normalized display mode
        is_razorpay = (p.get("payment_method") or "").upper() == "RAZORPAY" or p.get("mode") in ("test", "live")
        if p.get("plan_id"):
            display_mode = "SUBSCRIPTION"
        elif is_razorpay:
            display_mode = "ONLINE"
        else:
            display_mode = (p.get("payment_mode") or p.get("mode") or "UPI").upper()

        if mode and mode != "ALL":
            target_mode = mode.upper()
            if target_mode in ("ONLINE", "CARD") and is_razorpay:
                pass
            elif target_mode != display_mode and target_mode != (p.get("payment_method") or "").upper():
                continue

        if search:
            q = search.lower()
            found = False
            for field in ["payment_id", "id", "order_id", "transaction_reference", "customer_name", "customer_phone", "plan_id", "razorpay_order_id", "razorpay_payment_id"]:
                val = str(p.get(field) or "").lower()
                if q in val:
                    found = True
                    break
            if not found:
                continue
        if date_from:
            if p.get("created_at") and p["created_at"] < date_from:
                continue
        if date_to:
            if p.get("created_at") and p["created_at"] > date_to + "T23:59:59":
                continue

        p_copy = dict(p)
        p_copy["mode"] = display_mode
        p_copy["customer_name"] = p.get("customer_name") or "Walk-in"
        results.append(p_copy)

    sort_key = sort_by if sort_by in ["created_at", "amount", "status", "payment_id"] else "created_at"
    reverse = sort_dir == "desc"
    results.sort(key=lambda x: str(x.get(sort_key) or ""), reverse=reverse)

    return {"payments": results}


@router.get("/upi/{payment_id}")
def get_payment_status(payment_id: str, current_user: dict = Depends(get_current_user)):
    clean_id = payment_id.strip()
    payment = (
        db_instance.payments.find_one({"payment_id": clean_id}) or
        db_instance.payments.find_one({"id": clean_id}) or
        db_instance.payments.find_one({"transaction_reference": clean_id})
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")

    role = (current_user.get("role") or "").upper()
    if role != ROLE_SUPER_ADMIN and payment.get("customer_id") != current_user.get("customer_id") and payment.get("business_id") != current_user.get("business_id"):
        owner_business = get_collection("businesses").find_one({"owner_id": current_user.get("id"), "id": payment.get("business_id")})
        customer = get_collection("customers").find_one({"user_id": current_user.get("id"), "customer_id": payment.get("customer_id")})
        if not owner_business and not customer:
            raise HTTPException(status_code=403, detail="You cannot access this payment.")

    return {
        "payment_id": payment.get("payment_id") or payment.get("id"),
        "status": payment.get("status", "pending"),
        "amount": payment.get("amount", 0),
        "currency": payment.get("currency", "INR"),
        "upi_id": payment.get("upi_id"),
        "business_id": payment.get("business_id"),
        "created_at": payment.get("created_at")
    }

@router.post("/upi/verify")
@router.post("/verify")
def verify_payment(req: DirectUpiVerifyRequest, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only an authorized administrator can verify UPI payments.")
    raise HTTPException(status_code=501, detail="Automated direct UPI verification is unavailable; payment remains pending.")

class SubscriptionPaymentRequest(BaseModel):
    plan_id: str
    billing_interval: Optional[str] = "monthly"
    business_id: Optional[str] = None

PLAN_PRICING = {
    "FREE": {"monthly": 0, "annual": 0},
    "STARTER": {"monthly": 299, "annual": 2990},
    "GROWTH": {"monthly": 799, "annual": 7990},
    "PRO": {"monthly": 1499, "annual": 14990},
    "PREMIUM": {"monthly": 2499, "annual": 24990},
}

@router.post("/subscription/create")
def create_subscription_upi_payment(req: SubscriptionPaymentRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """
    Creates a UPI payment intent for ZOOR UP subscription plan.
    Uses the platform UPI (8521893325@ybl), not the business's UPI.
    """
    role = (current_user.get("role") or "").upper()
    enforce_rate_limit("sub-upi-create-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("sub-upi-create-ip", request.client.host if request.client else "unknown", 40, 3600)
    if role not in (ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Subscription payment initiation requires business owner or admin role.")

    plan_key = req.plan_id.upper().strip()
    if plan_key not in PLAN_PRICING:
        raise HTTPException(status_code=400, detail=f"Invalid plan ID '{req.plan_id}'. Allowed: {list(PLAN_PRICING.keys())}")

    interval = (req.billing_interval or "monthly").lower()
    if interval not in ("monthly", "annual"):
        interval = "monthly"

    amount = PLAN_PRICING[plan_key][interval]
    if amount <= 0:
        # Free plan - no payment needed
        return {
            "success": True,
            "is_free": True,
            "message": "Free plan requires no payment.",
            "plan_id": plan_key.lower(),
            "amount": 0,
            "currency": "INR",
            "status": "paid"
        }

    business_id = req.business_id
    if role == ROLE_BUSINESS_OWNER:
        biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
        if not biz or (business_id and business_id != biz.get("id")):
            raise HTTPException(status_code=403, detail="You can only initiate payments for your own business.")
        business_id = biz["id"]
    elif not business_id:
        raise HTTPException(status_code=400, detail="Business ID is required for subscription payment.")

    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"
    payment_id = f"pay_sub_{int(now.timestamp())}_{secrets.token_hex(4)}"

    # Use platform UPI for subscription payments
    vpa = PLATFORM_UPI
    biz_name = MERCHANT_BRAND
    plan_name = plan_key.capitalize()
    order_ref = f"SUB-{plan_key}-{int(now.timestamp())}"
    note = f"ZOOR UP {plan_name} Subscription"

    upi_uri = _generate_upi_uri(vpa, biz_name, amount, note, order_ref)

    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": current_user.get("customer_id"),
        "plan_id": plan_key.lower(),
        "plan_name": plan_name,
        "amount": amount,
        "currency": "INR",
        "upi_id": vpa,
        "status": "pending",
        "transaction_reference": payment_id,
        "upi_uri": upi_uri,
        "billing_interval": interval,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    db_instance.payments.insert_one(payment_record)

    return {
        "success": True,
        "payment_id": payment_id,
        "amount": amount,
        "currency": "INR",
        "upi_id": vpa,
        "upi_uri": upi_uri,
        "status": "pending",
        "plan_id": plan_key.lower(),
        "plan_name": plan_name,
        "billing_interval": interval
    }


# =============================================================================
# RAZORPAY TEST MODE ROUTES (delegated to razorpay_service)
# =============================================================================

class RazorpayOrderRequest(BaseModel):
    order_id: str
    business_id: Optional[str] = None


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_id: str


class RazorpayFailureRequest(BaseModel):
    razorpay_order_id: str
    error_code: Optional[str] = None
    error_description: Optional[str] = None


@router.post("/razorpay/create")
def create_razorpay_order(req: RazorpayOrderRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """
    Creates a Razorpay order for the given order.
    Returns Razorpay order details for frontend checkout.
    TEST MODE ONLY.
    """
    if RAZORPAY_MODE != "test":
        raise HTTPException(status_code=400, detail="Razorpay is only available in test mode.")
    
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay credentials not configured on server.")
    
    role = (current_user.get("role") or "").upper()
    enforce_rate_limit("razorpay-create-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("razorpay-create-ip", request.client.host if request.client else "unknown", 40, 3600)
    
    if role not in (ROLE_CUSTOMER, ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Payment initiation is not available for this account.")
    if not req.order_id:
        raise HTTPException(status_code=400, detail="An existing order is required to initiate a payment.")
    
    business_id = req.business_id
    customer_id = None
    if role == ROLE_BUSINESS_OWNER:
        biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
        if not biz or (business_id and business_id != biz.get("id")):
            raise HTTPException(status_code=403, detail="You can only initiate payments for your own business.")
        business_id = biz["id"]
    elif role == ROLE_CUSTOMER:
        customer = get_collection("customers").find_one({"user_id": current_user["id"]})
        if not customer:
            raise HTTPException(status_code=403, detail="Customer profile could not be verified.")
        customer_id = customer.get("customer_id")
        if business_id and not get_collection("customer_businesses").find_one({"customer_id": customer_id, "business_id": business_id, "status": "active"}):
            raise HTTPException(status_code=403, detail="This business is not connected to your account.")
    
    order = get_collection("orders").find_one({"id": req.order_id})
    if not order:
        order = get_collection("orders").find_one({"order_id": req.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found for this account.")
    
    if not business_id:
        business_id = order.get("business_id")
    elif order.get("business_id") != business_id:
        raise HTTPException(status_code=400, detail="Business ID does not match order.")
    
    if customer_id and order.get("customer_id") != customer_id and order.get("customer_user_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="Order access not allowed.")
    
    try:
        result = create_razorpay_order_for_payment(
            order_id=order.get("id"),
            business_id=business_id,
            customer_id=customer_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if "razorpay" in str(type(e)).lower():
            raise HTTPException(status_code=500, detail=f"Razorpay error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create Razorpay order: {str(e)}")


@router.post("/razorpay/verify")
def verify_razorpay_payment_route(req: RazorpayVerifyRequest, current_user: dict = Depends(get_current_user)):
    """
    Verifies Razorpay payment signature and updates payment status.
    TEST MODE ONLY.
    """
    if RAZORPAY_MODE != "test":
        raise HTTPException(status_code=400, detail="Razorpay is only available in test mode.")
    
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay credentials not configured on server.")
    
    role = (current_user.get("role") or "").upper()
    if role not in (ROLE_CUSTOMER, ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Payment verification not available for this account.")
    
    customer_id = None
    if role == ROLE_CUSTOMER:
        customer = get_collection("customers").find_one({"user_id": current_user["id"]})
        if customer:
            customer_id = customer.get("customer_id")
    
    try:
        result = verify_razorpay_payment(
            razorpay_order_id=req.razorpay_order_id,
            razorpay_payment_id=req.razorpay_payment_id,
            razorpay_signature=req.razorpay_signature,
            order_id=req.order_id,
            customer_id=customer_id,
            user_id=current_user.get("id"),
            role=role
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify Razorpay payment: {str(e)}")


@router.post("/razorpay/failure")
def record_razorpay_failure_route(req: RazorpayFailureRequest, current_user: dict = Depends(get_current_user)):
    """Records client-reported payment cancellation or failure."""
    return record_razorpay_payment_failure(
        razorpay_order_id=req.razorpay_order_id,
        error_code=req.error_code,
        error_description=req.error_description,
    )


# =============================================================================
# BUSINESS SUBSCRIPTION RAZORPAY ROUTES
# Reuses EXACT SAME Razorpay credentials, client, and configuration
# =============================================================================

class SubscriptionRazorpayOrderRequest(BaseModel):
    plan_id: str
    billing_interval: Optional[str] = "monthly"
    business_id: Optional[str] = None


class SubscriptionRazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    plan_id: str
    billing_interval: Optional[str] = "monthly"
    business_id: Optional[str] = None


@router.post("/subscription/razorpay/create")
def create_subscription_razorpay_order_route(
    req: SubscriptionRazorpayOrderRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """
    Creates a Razorpay order for Business Subscription using the exact same
    Razorpay merchant credentials and configuration as customer orders.
    TEST MODE ONLY.
    """
    if RAZORPAY_MODE != "test":
        raise HTTPException(status_code=400, detail="Razorpay is only available in test mode.")
    
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay credentials not configured on server.")
    
    role = (current_user.get("role") or "").upper()
    enforce_rate_limit("sub-rzp-create-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("sub-rzp-create-ip", request.client.host if request.client else "unknown", 40, 3600)
    
    if role not in (ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Subscription payment initiation requires business owner or admin role.")
    
    business_id = req.business_id
    if role == ROLE_BUSINESS_OWNER:
        biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
        if not biz or (business_id and business_id != biz.get("id")):
            raise HTTPException(status_code=403, detail="You can only initiate subscription payments for your own business.")
        business_id = biz["id"]
    elif not business_id:
        raise HTTPException(status_code=400, detail="Business ID is required for subscription payment.")
    
    try:
        result = create_razorpay_order_for_subscription(
            business_id=business_id,
            plan_id=req.plan_id,
            billing_interval=req.billing_interval or "monthly",
            user_id=current_user.get("id")
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if "razorpay" in str(type(e)).lower():
            raise HTTPException(status_code=500, detail=f"Razorpay error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create Razorpay subscription order: {str(e)}")


@router.post("/subscription/razorpay/verify")
def verify_subscription_razorpay_route(
    req: SubscriptionRazorpayVerifyRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Verifies Razorpay payment signature and activates the business subscription plan.
    Does NOT create customer orders.
    TEST MODE ONLY.
    """
    if RAZORPAY_MODE != "test":
        raise HTTPException(status_code=400, detail="Razorpay is only available in test mode.")
    
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay credentials not configured on server.")
    
    role = (current_user.get("role") or "").upper()
    if role not in (ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Subscription verification requires business owner or admin role.")
    
    business_id = req.business_id
    if role == ROLE_BUSINESS_OWNER:
        biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
        if not biz or (business_id and business_id != biz.get("id")):
            raise HTTPException(status_code=403, detail="You can only verify subscription payments for your own business.")
        business_id = biz["id"]
    elif not business_id:
        p_rec = get_collection("payments").find_one({"razorpay_order_id": req.razorpay_order_id})
        if p_rec and p_rec.get("business_id"):
            business_id = p_rec["business_id"]
        else:
            raise HTTPException(status_code=400, detail="Business ID is required for subscription payment verification.")
    
    try:
        result = verify_razorpay_subscription_payment(
            razorpay_order_id=req.razorpay_order_id,
            razorpay_payment_id=req.razorpay_payment_id,
            razorpay_signature=req.razorpay_signature,
            business_id=business_id,
            plan_id=req.plan_id,
            billing_interval=req.billing_interval,
            user_id=current_user.get("id")
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify subscription payment: {str(e)}")


@router.post("/subscription/razorpay/failure")
def record_subscription_razorpay_failure_route(
    req: RazorpayFailureRequest,
    current_user: dict = Depends(get_current_user)
):
    """Records client-reported subscription payment cancellation or failure."""
    return record_razorpay_payment_failure(
        razorpay_order_id=req.razorpay_order_id,
        error_code=req.error_code,
        error_description=req.error_description,
    )


@router.post("/razorpay/webhook")
@router.post("/webhook/razorpay")
async def razorpay_webhook_route(request: Request):
    """
    Asynchronous Razorpay Webhook processor.
    Validates webhook signature and safely updates payment state.
    """
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature") or request.headers.get("X-Razorpay-Signature") or ""
    
    if not signature or not verify_razorpay_webhook_signature(raw_body, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    
    try:
        import json
        event_payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    result = process_razorpay_webhook_event(event_payload)
    return result


@router.get("/business/settlement")
def get_business_settlement_route(current_user: dict = Depends(get_current_user)):
    """Returns verified settlement overview and Route status for the business."""
    role = (current_user.get("role") or "").upper()
    if role not in (ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN, ROLE_STAFF):
        raise HTTPException(status_code=403, detail="Business owner access required.")

    biz = get_collection("businesses").find_one({"owner_id": current_user["id"]})
    if not biz:
        biz = get_collection("businesses").find_one({"id": current_user.get("business_id")})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    return get_business_settlement_summary(biz["id"])


@router.get("/razorpay/{razorpay_order_id}")
def get_razorpay_payment_status(razorpay_order_id: str, current_user: dict = Depends(get_current_user)):
    """Get Razorpay payment status by Razorpay order ID."""
    payment = get_razorpay_payment_by_order_id(razorpay_order_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")
    
    role = (current_user.get("role") or "").upper()
    if role != ROLE_SUPER_ADMIN and payment.get("customer_id") != current_user.get("customer_id") and payment.get("business_id") != current_user.get("business_id"):
        owner_business = get_collection("businesses").find_one({"owner_id": current_user.get("id"), "id": payment.get("business_id")})
        customer = get_collection("customers").find_one({"user_id": current_user.get("id"), "customer_id": payment.get("customer_id")})
        if not owner_business and not customer:
            raise HTTPException(status_code=403, detail="You cannot access this payment.")
    
    return {
        "payment_id": payment.get("payment_id"),
        "razorpay_order_id": payment.get("razorpay_order_id"),
        "razorpay_payment_id": payment.get("razorpay_payment_id"),
        "razorpay_key_id": payment.get("razorpay_key_id"),
        "status": payment.get("status"),
        "amount": payment.get("amount"),
        "currency": payment.get("currency"),
        "verified": payment.get("verified", False),
        "mode": payment.get("mode"),
        "created_at": payment.get("created_at"),
    }