"""
ZOOR UP Direct UPI Payment Routes
Provides direct UPI payments and dynamic UPI deep links (Merchant: 8521893325@ybl).
No third-party payment gateway dependencies.
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
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER, ROLE_SUPER_ADMIN
from backend.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/api/payments", tags=["UPI Payments"])

MERCHANT_BRAND = "ZOOR UP"
MERCHANT_UPI = "8521893325@ybl"

class DirectUpiPaymentRequest(BaseModel):
    business_id: Optional[str] = None
    amount: float
    order_id: Optional[str] = None
    notes: Optional[str] = "ZOOR UP Payment"
    customer_id: Optional[str] = None

class DirectUpiVerifyRequest(BaseModel):
    payment_id: str
    transaction_reference: Optional[str] = None
    utr: Optional[str] = None

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
    if not order or order.get("business_id") != business_id or (customer_id and order.get("customer_id") != customer_id):
        raise HTTPException(status_code=404, detail="Order not found for this account.")
    amount = float(order.get("total_amount") or order.get("total") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="The order has no payable balance.")

    now = datetime.utcnow()
    now_iso = now.isoformat() + "Z"
    payment_id = f"pay_{int(now.timestamp())}_{secrets.token_hex(4)}"

    # Check business specific UPI ID or fallback to merchant default
    vpa = MERCHANT_UPI
    biz_name = MERCHANT_BRAND
    if business_id:
        biz = db_instance.businesses.find_one({"id": business_id})
        if biz:
            if biz.get("upi_id"):
                vpa = biz["upi_id"].strip()
            if biz.get("name"):
                biz_name = biz["name"].strip()

    note = req.notes or f"Payment to {biz_name}"
    params = {
        "pa": vpa,
        "pn": biz_name,
        "am": f"{amount:.2f}",
        "cu": "INR",
        "tn": note
    }
    encoded_query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    upi_uri = f"upi://pay?{encoded_query}"

    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": customer_id,
        "order_id": req.order_id,
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

@router.get("/upi/{payment_id}")
@router.get("/{payment_id}")
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
        "upi_id": payment.get("upi_id", MERCHANT_UPI),
        "business_id": payment.get("business_id"),
        "created_at": payment.get("created_at")
    }

@router.post("/upi/verify")
@router.post("/verify")
def verify_payment(req: DirectUpiVerifyRequest, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Only an authorized administrator can verify UPI payments.")
    raise HTTPException(status_code=501, detail="Automated direct UPI verification is unavailable; payment remains pending.")
