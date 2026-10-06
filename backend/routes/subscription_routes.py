"""
ZOOR UP Direct UPI Subscription & Payment Routes
Replaces third-party payment gateways with direct UPI payments.

Canonical endpoints:
- GET  /api/subscriptions/plans (and /api/subscription/plans)
- GET  /api/subscriptions/current (and /api/subscription/current, /api/subscription)
- POST /api/subscriptions/payment/initiate (and /api/subscription/payment/initiate)
- GET  /api/subscriptions/payment/{payment_id} (and /api/subscription/payment/{payment_id})
- POST /api/subscriptions/payment/{payment_id}/verify (and /api/subscription/payment/{payment_id}/verify)
- POST /api/subscriptions/cancel (and /api/subscription/cancel)
- GET  /api/subscriptions/history (and /api/subscription/history)
- GET  /api/subscriptions/admin/all (and /api/subscription/admin/all)

Security & Flow Rules:
- Server-authoritative plan pricing (FREE = ₹0, STARTER = ₹299, GROWTH = ₹799, PRO = ₹1499)
- Client sends ONLY plan_id (never trust client-supplied price)
- URL-encode all dynamic values safely
- Opening the UPI app starts payment; payment is created with status 'pending' (NEVER falsely marked paid)
- Subscription is ONLY activated when payment verification confirms success
"""
import os
import time
import secrets
import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header, Request, status, Depends, Query
from backend.models import ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN
from backend.auth import get_current_user, get_optional_current_user, require_role
from backend.database import get_collection, db_instance
from backend.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/api/subscription", tags=["Subscription"])
subscriptions_router = APIRouter(prefix="/api/subscriptions", tags=["Subscriptions"])

MERCHANT_BRAND = "ZOOR UP"
# Platform UPI for subscription payments (business pays ZOOR UP platform)
# Configurable via environment variable; not hardcoded
PLATFORM_UPI = os.environ.get("PLATFORM_UPI", "8521893325@ybl")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")

PLAN_PRICING: Dict[str, Dict[str, Any]] = {
    "FREE": {
        "id": "FREE",
        "name": "Free",
        "monthly": 0,
        "annual": 0,
        "customer_limit": 50,
        "staff_limit": 1,
        "features": [
            "Basic Business Management",
            "Up to 50 Customers",
            "Digital QR Menu",
            "Standard Dashboard",
            "Table Booking"
        ]
    },
    "STARTER": {
        "id": "STARTER",
        "name": "Starter",
        "monthly": 299,
        "annual": 2990,
        "customer_limit": 250,
        "staff_limit": 3,
        "features": [
            "Up to 250 Customers",
            "Loyalty & Reward Points",
            "QR Menu & Catalog",
            "Basic Analytics",
            "Table Booking System",
            "Up to 3 Staff Accounts"
        ]
    },
    "GROWTH": {
        "id": "GROWTH",
        "name": "Growth",
        "monthly": 799,
        "annual": 7990,
        "customer_limit": 1000,
        "staff_limit": 10,
        "features": [
            "Advanced Analytics",
            "Full Inventory Management",
            "Staff Roles & Permissions",
            "Billing & POS Invoices",
            "Customer CRM & History",
            "Table Reservation Management",
            "WhatsApp Notifications"
        ]
    },
    "PRO": {
        "id": "PRO",
        "name": "Pro",
        "monthly": 1499,
        "annual": 14990,
        "customer_limit": 100000,
        "staff_limit": 50,
        "features": [
            "Unlimited Customers",
            "Custom Domain / QR Branding",
            "Automated Customer Campaigns",
            "Table & Seating Optimization",
            "Full Financial & Tax Invoices",
            "Dedicated Support"
        ]
    },
    "PREMIUM": {
        "id": "PREMIUM",
        "name": "Premium",
        "monthly": 2499,
        "annual": 24990,
        "customer_limit": 500000,
        "staff_limit": 100,
        "features": [
            "Everything in Pro",
            "Unlimited Customers & Staff",
            "Custom Domain & White-Label Branding",
            "Multi-Location Sync",
            "Automated Marketing & WhatsApp Campaigns",
            "Dedicated Account Manager & 24/7 Priority SLA"
        ]
    }
}

class PaymentInitiatePayload(BaseModel):
    plan_id: str
    billing_interval: Optional[str] = "monthly"
    business_id: Optional[str] = None
    store_id: Optional[str] = None

    class Config:
        extra = "forbid"

class PaymentVerifyPayload(BaseModel):
    utr: Optional[str] = None
    notes: Optional[str] = None
    independently_reconciled: bool = False

    class Config:
        extra = "forbid"

class SubscriptionCancelPayload(BaseModel):
    subscription_id: Optional[str] = None
    business_id: Optional[str] = None

def resolve_business_id(current_user: Optional[dict], requested_id: Optional[str] = None) -> str:
    """Resolves authenticated business ID securely."""
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Business authentication required.")

    businesses_col = get_collection("businesses")
    if (current_user.get("role") or "").upper() == ROLE_SUPER_ADMIN and requested_id:
        requested = businesses_col.find_one({"id": requested_id.strip()}) or businesses_col.find_one({"slug": requested_id.strip()})
        if requested:
            return requested["id"]

    biz = businesses_col.find_one({"owner_id": current_user["id"]})
    if not biz and current_user.get("business_id"):
        biz = businesses_col.find_one({"id": current_user["business_id"], "owner_id": current_user["id"]})
    if not biz:
        raise HTTPException(status_code=403, detail="Business ownership could not be verified.")

    if requested_id:
        requested = businesses_col.find_one({"id": requested_id.strip()}) or businesses_col.find_one({"slug": requested_id.strip()})
        if not requested or requested.get("id") != biz["id"]:
            raise HTTPException(status_code=403, detail="You can only access billing for your own business.")
    return biz["id"]


def generate_upi_uri(amount: int, plan_name: str, payment_id: Optional[str] = None) -> str:
    """Safely generates URL-encoded UPI payment intent/deep link."""
    clean_plan = plan_name.strip()
    tn_val = f"ZOOR UP - {clean_plan}"
    if payment_id:
        tn_val = f"ZOOR UP - {clean_plan} - {payment_id}"
    params = {
        "pa": PLATFORM_UPI,
        "pn": MERCHANT_BRAND,
        "am": str(amount),
        "cu": "INR",
        "tn": tn_val
    }
    encoded_query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote, safe="@")
    return f"upi://pay?{encoded_query}"

# ==============================================================================
# 1. Authoritative Plans & Pricing
# ==============================================================================
def handle_get_plans():
    formatted_plans = [
        {
            "id": p["id"].lower(),
            "plan_id": p["id"].lower(),
            "name": p["name"],
            "price": p["monthly"],
            "monthly": p["monthly"],
            "annual": p["annual"],
            "billing_cycle": "monthly",
            "customer_limit": p.get("customer_limit", 1000),
            "staff_limit": p.get("staff_limit", 10),
            "features": p.get("features", []),
            "is_paid": p["id"] != "FREE"
        }
        for p in PLAN_PRICING.values()
    ]
    return {
        "success": True,
        "brand": MERCHANT_BRAND,
        "merchant_upi": PLATFORM_UPI,
        "currency": "INR",
        "plans": formatted_plans
    }

@router.get("/plans")
def get_plans_singular():
    return handle_get_plans()

@subscriptions_router.get("/plans")
def get_plans_plural():
    return handle_get_plans()

# ==============================================================================
# 2. Get Current Business Subscription
# ==============================================================================
def handle_get_current_subscription(business_id: Optional[str], current_user: Optional[dict]):
    biz_id = resolve_business_id(current_user, business_id)

    sub = db_instance.subscriptions.find_one({"business_id": biz_id})
    biz = db_instance.businesses.find_one({"id": biz_id})

    if not sub:
        # Check if legitimate verified payment exists for this business
        legit_payment = db_instance.payments.find_one({"business_id": biz_id, "status": "paid"})
        if legit_payment and biz and biz.get("subscription_plan") and biz.get("subscription_plan").upper() != "FREE":
            plan_name = biz["subscription_plan"].upper()
            is_free = False
        else:
            plan_name = "FREE"
            is_free = True

        res_dict = {
            "success": True,
            "business_id": biz_id,
            "plan": plan_name,
            "plan_id": plan_name.lower(),
            "plan_name": plan_name.capitalize(),
            "status": "ACTIVE",
            "subscription_status": "ACTIVE",
            "payment_status": "NOT_REQUIRED" if is_free else "PAID",
            "auto_renew": False,
            "cancel_at_period_end": False,
            "amount": 0 if is_free else PLAN_PRICING.get(plan_name.upper(), {}).get("monthly", 0),
            "currency": "INR",
            "billing_interval": "monthly",
            "billing_cycle": "monthly",
            "current_period_start": None,
            "current_period_end": None,
            "started_at": None,
            "expires_at": None,
            "next_billing_date": None,
            "mandate_status": "none",
            "can_access_premium": not is_free,
            "is_free": is_free,
            "is_paid": not is_free,
            "merchant_info": {
                "brand": MERCHANT_BRAND,
                "merchant_upi": PLATFORM_UPI
            }
        }
        res_dict["subscription"] = dict(res_dict)
        return res_dict

    plan_name = sub.get("plan", "FREE").upper()
    is_free = plan_name == "FREE"
    status_str = sub.get("status", "ACTIVE").upper()

    res_dict = {
        "success": True,
        "business_id": biz_id,
        "subscription_id": sub.get("id"),
        "plan": plan_name,
        "plan_id": plan_name.lower(),
        "plan_name": plan_name.capitalize(),
        "status": status_str,
        "subscription_status": status_str,
        "payment_status": sub.get("payment_status", "NOT_REQUIRED" if is_free else "PAID"),
        "amount": sub.get("amount", PLAN_PRICING.get(plan_name, {}).get("monthly", 0)),
        "currency": "INR",
        "billing_interval": sub.get("billing_interval", "monthly"),
        "billing_cycle": sub.get("billing_interval", "monthly"),
        "auto_renew": bool(sub.get("auto_renew", False)),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end", False)),
        "current_period_start": sub.get("current_period_start"),
        "current_period_end": sub.get("current_period_end"),
        "started_at": sub.get("current_period_start"),
        "expires_at": sub.get("current_period_end"),
        "next_billing_date": sub.get("current_period_end"),
        "mandate_status": sub.get("mandate_status", "none"),
        "can_access_premium": not is_free and status_str in ("ACTIVE", "TRIAL"),
        "is_free": is_free,
        "is_paid": not is_free,
        "merchant_info": {
            "brand": MERCHANT_BRAND,
            "merchant_upi": PLATFORM_UPI
        }
    }
    res_dict["subscription"] = dict(res_dict)
    return res_dict

@router.get("/current")
@router.get("")
def get_current_subscription_singular(
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    return handle_get_current_subscription(business_id, current_user)

@subscriptions_router.get("/current")
@subscriptions_router.get("")
def get_current_subscription_plural(
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    return handle_get_current_subscription(business_id, current_user)

# ==============================================================================
# 3. DIRECT UPI PAYMENT INITIATION (POST /api/subscriptions/payment/initiate)
# ==============================================================================
def handle_payment_initiate(payload: PaymentInitiatePayload, current_user: Optional[dict]):
    biz_id = resolve_business_id(current_user, payload.business_id)
    plan_key = payload.plan_id.upper().strip()

    if plan_key not in PLAN_PRICING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan ID '{payload.plan_id}'. Allowed plans: {list(PLAN_PRICING.keys())}"
        )

    interval = (payload.billing_interval or "monthly").lower()
    if interval not in ("monthly", "annual"):
        interval = "monthly"

    plan_info = PLAN_PRICING[plan_key]
    amount = plan_info[interval]

    # Handle FREE plan immediately
    if plan_key == "FREE" or amount == 0:
        now_iso = datetime.utcnow().isoformat() + "Z"
        db_instance.subscriptions.update_one(
            {"business_id": biz_id},
            {"$set": {
                "business_id": biz_id,
                "plan": "FREE",
                "status": "ACTIVE",
                "subscription_status": "ACTIVE",
                "payment_status": "NOT_REQUIRED",
                "billing_interval": interval,
                "amount": 0,
                "auto_renew": False,
                "cancel_at_period_end": False,
                "updated_at": now_iso
            }},
            upsert=True
        )
        db_instance.businesses.update_one(
            {"id": biz_id},
            {"$set": {
                "subscription_plan": "FREE",
                "subscription_status": "ACTIVE",
                "payment_status": "FREE",
                "updated_at": now_iso
            }}
        )
        return {
            "success": True,
            "is_free": True,
            "message": "Switched to Free plan. No payment required.",
            "plan_id": "free",
            "plan_name": "Free",
            "amount": 0,
            "currency": "INR",
            "status": "ACTIVE"
        }

    # Generate unique payment ID
    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"
    payment_id = f"pay_upi_{int(now.timestamp())}_{secrets.token_hex(4)}"

    # Generate UPI URI with payment_id
    upi_uri = generate_upi_uri(amount, plan_info["name"], payment_id)

    # Store pending payment record in database
    # CRITICAL: Do NOT mark payment as paid or subscription as active!
    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": biz_id,
        "plan_id": plan_key.lower(),
        "plan_name": plan_info["name"],
        "amount": amount,
        "currency": "INR",
        "upi_id": PLATFORM_UPI,
        "billing_interval": interval,
        "status": "pending",
        "transaction_reference": payment_id,
        "upi_uri": upi_uri,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    db_instance.payments.insert_one(payment_record)

    return {
        "success": True,
        "status": "pending",
        "payment_id": payment_id,
        "plan_id": plan_key.lower(),
        "plan_name": plan_info["name"],
        "amount": amount,
        "currency": "INR",
        "upi_id": PLATFORM_UPI,
        "upi_uri": upi_uri
    }

@subscriptions_router.post("/payment/initiate")
def initiate_payment_subscriptions(
    payload: PaymentInitiatePayload,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    enforce_rate_limit("subscription-initiate-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("subscription-initiate-ip", request.client.host if request.client else "unknown", 40, 3600)
    return handle_payment_initiate(payload, current_user)

@router.post("/payment/initiate")
@router.post("/create")
@router.post("/checkout")
def initiate_payment_subscription(
    payload: PaymentInitiatePayload,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    enforce_rate_limit("subscription-initiate-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("subscription-initiate-ip", request.client.host if request.client else "unknown", 40, 3600)
    return handle_payment_initiate(payload, current_user)

# ==============================================================================
# 4. PAYMENT STATUS CHECK (GET /api/subscriptions/payment/{payment_id})
# ==============================================================================
def handle_get_payment_status(payment_id: str, current_user: dict):
    clean_id = payment_id.strip()
    payment = (
        db_instance.payments.find_one({"payment_id": clean_id}) or
        db_instance.payments.find_one({"id": clean_id}) or
        db_instance.payments.find_one({"transaction_reference": clean_id})
    )

    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment with ID '{clean_id}' was not found."
        )

    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN:
        biz_id = resolve_business_id(current_user)
        if payment.get("business_id") != biz_id:
            raise HTTPException(status_code=403, detail="You cannot access this payment.")

    return {
        "payment_id": payment.get("payment_id") or payment.get("id"),
        "status": payment.get("status", "pending"),
        "plan_id": payment.get("plan_id", "free"),
        "plan_name": payment.get("plan_name", ""),
        "amount": payment.get("amount", 0),
        "currency": payment.get("currency", "INR"),
        "upi_id": payment.get("upi_id", PLATFORM_UPI),
        "created_at": payment.get("created_at")
    }

@subscriptions_router.get("/payment/{payment_id}")
def get_payment_status_subscriptions(payment_id: str, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN]))):
    return handle_get_payment_status(payment_id, current_user)

@router.get("/payment/{payment_id}")
def get_payment_status_subscription(payment_id: str, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN]))):
    return handle_get_payment_status(payment_id, current_user)

# ==============================================================================
# 5. PAYMENT VERIFICATION (POST /api/subscriptions/payment/{payment_id}/verify)
# ==============================================================================
def handle_verify_payment(payment_id: str, payload: PaymentVerifyPayload, current_user: Optional[dict]):
    clean_id = payment_id.strip()
    payment = (
        db_instance.payments.find_one({"payment_id": clean_id}) or
        db_instance.payments.find_one({"id": clean_id}) or
        db_instance.payments.find_one({"transaction_reference": clean_id})
    )

    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")
    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only an authorized administrator can verify UPI payments.")
    if not (payload.utr or "").strip():
        raise HTTPException(status_code=400, detail="A UPI UTR/reference is required for manual verification.")
    if not payload.independently_reconciled:
        raise HTTPException(status_code=400, detail="Confirm independent UPI reconciliation before activating a subscription.")
    if payment.get("status") == "paid":
        raise HTTPException(status_code=409, detail="This payment has already been verified.")

    meta = payment.get("metadata") or {}
    biz_id = payment.get("business_id") or meta.get("business_id") or payment.get("store_id")
    plan_key = (payment.get("plan_id") or meta.get("plan_id") or "").upper().strip()
    plan_info = PLAN_PRICING.get(plan_key)
    if not biz_id or not plan_info:
        raise HTTPException(status_code=400, detail="The pending payment is missing valid business or plan details.")

    interval = (payment.get("billing_interval") or meta.get("billing_interval") or "monthly").lower().strip()
    if interval not in ("monthly", "annual") or payment.get("amount") != plan_info[interval]:
        raise HTTPException(status_code=400, detail="Pending payment pricing does not match the authoritative plan price.")

    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"
    period_days = 365 if interval == "annual" else 30
    period_end_iso = (now + timedelta(days=period_days)).isoformat() + "Z"

    # Reference / UTR
    ref = (payload.utr or "").strip()
    if not ref:
        raise HTTPException(status_code=400, detail="A UPI UTR/reference is required.")

    if db_instance.payments.find_one({"verified_utr": ref}):
        raise HTTPException(status_code=409, detail="This UPI reference has already been reconciled.")

    # Claim pending state first so repeated/concurrent reconciliation cannot activate twice.
    claimed = db_instance.payments.update_one(
        {"id": payment["id"], "status": "pending"},
        {"$set": {
            "status": "paid",
            "verified_utr": ref,
            "transaction_reference": ref,
            "verified_at": now_iso,
            "updated_at": now_iso,
            "notes": payload.notes or "Independently reconciled direct UPI payment"
        }}
    )
    if claimed is False or getattr(claimed, "matched_count", 1) == 0:
        raise HTTPException(status_code=409, detail="Payment is no longer pending and cannot be reconciled again.")

    # Activate business subscription
    db_instance.subscriptions.update_one(
        {"business_id": biz_id},
        {"$set": {
            "business_id": biz_id,
            "plan": plan_key,
            "status": "ACTIVE",
            "subscription_status": "ACTIVE",
            "payment_status": "PAID",
            "amount": payment.get("amount", plan_info["monthly"]),
            "currency": "INR",
            "billing_interval": interval,
            "auto_renew": False,
            "cancel_at_period_end": False,
            "current_period_start": now_iso,
            "current_period_end": period_end_iso,
            "last_payment_id": clean_id,
            "transaction_reference": ref,
            "updated_at": now_iso
        }},
        upsert=True
    )

    # Update business document
    db_instance.businesses.update_one(
        {"id": biz_id},
        {"$set": {
            "subscription_plan": plan_key,
            "subscription_status": "ACTIVE",
            "payment_status": "PAID",
            "last_payment_id": clean_id,
            "subscription_started_at": now_iso,
            "subscription_ends_at": period_end_iso,
            "updated_at": now_iso
        }}
    )

    return {
        "success": True,
        "verified": True,
        "status": "paid",
        "payment_id": clean_id,
        "plan_id": plan_key.lower(),
        "plan_name": plan_info["name"],
        "subscription_status": "ACTIVE",
        "message": f"Payment successfully verified! Your {plan_info['name']} plan is now active."
    }

@subscriptions_router.post("/payment/{payment_id}/verify")
def verify_payment_subscriptions(
    payment_id: str,
    payload: PaymentVerifyPayload,
    current_user: dict = Depends(require_role([ROLE_SUPER_ADMIN]))
):
    enforce_rate_limit("subscription-verify-admin", current_user.get("id"), 60, 3600)
    return handle_verify_payment(payment_id, payload, current_user)

@router.post("/payment/{payment_id}/verify")
@router.post("/verify")
def verify_payment_subscription(
    payment_id: Optional[str] = None,
    payload: Optional[PaymentVerifyPayload] = None,
    current_user: dict = Depends(require_role([ROLE_SUPER_ADMIN]))
):
    enforce_rate_limit("subscription-verify-admin", current_user.get("id"), 60, 3600)
    eff_id = payment_id or (payload.transaction_reference if payload else None) or "pay_latest"
    if not payload:
        payload = PaymentVerifyPayload()
    return handle_verify_payment(eff_id, payload, current_user)

# ==============================================================================
# 6. CANCEL SUBSCRIPTION (POST /api/subscriptions/cancel)
# ==============================================================================
def handle_cancel_subscription(payload: SubscriptionCancelPayload, current_user: Optional[dict]):
    biz_id = resolve_business_id(current_user, payload.business_id)
    sub = db_instance.subscriptions.find_one({"business_id": biz_id})
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found for this business")

    now_iso = datetime.utcnow().isoformat() + "Z"
    db_instance.subscriptions.update_one(
        {"business_id": biz_id},
        {"$set": {
            "auto_renew": False,
            "cancel_at_period_end": True,
            "cancelled_at": now_iso,
            "updated_at": now_iso
        }}
    )

    db_instance.businesses.update_one(
        {"id": biz_id},
        {"$set": {
            "auto_renew": False,
            "cancel_at_period_end": True,
            "updated_at": now_iso
        }}
    )

    return {
        "success": True,
        "auto_renew": False,
        "cancel_at_period_end": True,
        "current_period_end": sub.get("current_period_end"),
        "message": "Subscription will not renew automatically. Your plan remains active until the end of your billing period."
    }

@subscriptions_router.post("/cancel")
def cancel_subscription_plural(
    payload: SubscriptionCancelPayload,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    return handle_cancel_subscription(payload, current_user)

@router.post("/cancel")
def cancel_subscription_singular(
    payload: SubscriptionCancelPayload,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    return handle_cancel_subscription(payload, current_user)

# ==============================================================================
# 7. PAYMENT HISTORY (GET /api/subscriptions/history)
# ==============================================================================
def handle_get_payment_history(business_id: Optional[str], current_user: Optional[dict]):
    biz_id = resolve_business_id(current_user, business_id)

    payments = db_instance.payments.find({"business_id": biz_id})
    payments.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)

    return {
        "success": True,
        "business_id": biz_id,
        "payments": [
            {
                "id": p.get("id"),
                "payment_id": p.get("payment_id") or p.get("id"),
                "date": p.get("created_at"),
                "plan": (p.get("plan_name") or p.get("plan_id", "FREE")).upper(),
                "plan_name": p.get("plan_name") or p.get("plan_id", "Free"),
                "amount": p.get("amount", 0),
                "currency": p.get("currency", "INR"),
                "status": (p.get("status") or "pending").upper(),
                "payment_method": "upi",
                "upi_id": p.get("upi_id", PLATFORM_UPI),
                "transaction_reference": p.get("transaction_reference"),
                "billing_interval": p.get("billing_interval", "monthly")
            }
            for p in payments
        ]
    }

@subscriptions_router.get("/history")
@subscriptions_router.get("/payment-history")
def get_payment_history_plural(
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    return handle_get_payment_history(business_id, current_user)

@router.get("/history")
@router.get("/payment-history")
def get_payment_history_singular(
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    return handle_get_payment_history(business_id, current_user)

# ==============================================================================
# 8. PLATFORM ADMIN ALL SUBSCRIPTIONS (GET /api/subscriptions/admin/all)
# ==============================================================================
def handle_get_admin_subscriptions():
    subscriptions = db_instance.subscriptions.find()
    businesses = {b["id"]: b.get("name", "Unknown Business") for b in db_instance.businesses.find()}

    result = []
    for s in subscriptions:
        b_id = s.get("business_id")
        result.append({
            "subscription_id": s.get("id"),
            "business_id": b_id,
            "business_name": businesses.get(b_id, "Unknown"),
            "plan": s.get("plan", "FREE"),
            "amount": s.get("amount", 0),
            "status": s.get("status", "ACTIVE"),
            "payment_status": s.get("payment_status", "PAID"),
            "auto_renew": s.get("auto_renew", False),
            "next_billing_date": s.get("current_period_end"),
            "created_at": s.get("created_at")
        })

    return {
        "success": True,
        "count": len(result),
        "subscriptions": result
    }

@subscriptions_router.get("/admin/all")
def get_admin_subscriptions_plural(current_user: dict = Depends(require_role([ROLE_SUPER_ADMIN]))):
    return handle_get_admin_subscriptions()

@router.get("/admin/all")
def get_admin_subscriptions_singular(current_user: dict = Depends(require_role([ROLE_SUPER_ADMIN]))):
    return handle_get_admin_subscriptions()
