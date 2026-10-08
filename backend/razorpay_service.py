"""
Razorpay Service for ZOOR UP - TEST MODE ONLY
Handles Razorpay order creation, signature verification, and payment processing.
"""
import os
import hmac
import hashlib
import secrets
from datetime import datetime
from typing import Dict, Any, Optional

import razorpay
from backend.database import get_collection

RAZORPAY_MODE = os.getenv("RAZORPAY_MODE", "test").strip().lower()
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()

if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    print("[RAZORPAY] WARNING: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not configured. Razorpay payments will not work.")

if RAZORPAY_MODE != "test":
    print(f"[RAZORPAY] WARNING: RAZORPAY_MODE is '{RAZORPAY_MODE}'. Only 'test' mode is supported.")


def get_razorpay_client() -> razorpay.Client:
    """Get Razorpay client instance."""
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise RuntimeError("Razorpay credentials not configured")
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def create_razorpay_order(amount_inr: float, order_id: str, business_id: str, customer_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Create a Razorpay order for the given amount.
    Amount is in INR (will be converted to paise).
    Returns the Razorpay order object.
    """
    client = get_razorpay_client()
    
    amount_paise = int(round(amount_inr * 100))
    if amount_paise < 100:
        raise ValueError("Amount must be at least ₹1.00")
    
    receipt = f"ord_{order_id}_{secrets.token_hex(4)}"
    notes = {
        "business_id": business_id,
        "order_id": order_id,
        "mode": RAZORPAY_MODE,
    }
    if customer_id:
        notes["customer_id"] = customer_id
    
    razorpay_order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "notes": notes,
        "partial_payment": False,
    })
    
    return razorpay_order


def verify_razorpay_signature(razorpay_order_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
    """
    Verify Razorpay payment signature.
    Returns True if signature is valid, False otherwise.
    """
    if not RAZORPAY_KEY_SECRET:
        return False
    
    payload = f"{razorpay_order_id}|{razorpay_payment_id}".encode()
    expected_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, razorpay_signature)


def save_razorpay_payment_record(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    order_id: str,
    business_id: str,
    customer_id: Optional[str],
    amount: float,
    status: str,
    verified: bool = False
) -> Dict[str, Any]:
    """
    Save Razorpay payment record to database.
    Prevents duplicate payment verification by checking existing records.
    """
    payments_col = get_collection("payments")
    orders_col = get_collection("orders")
    invoices_col = get_collection("invoices")
    
    existing = payments_col.find_one({"razorpay_payment_id": razorpay_payment_id})
    if existing:
        return {
            "success": False,
            "duplicate": True,
            "message": "Payment already recorded",
            "payment": existing
        }
    
    existing_order = payments_col.find_one({"razorpay_order_id": razorpay_order_id})
    if existing_order and existing_order.get("status") == "paid":
        return {
            "success": False,
            "duplicate": True,
            "message": "Order already paid",
            "payment": existing_order
        }
    
    now_iso = datetime.utcnow().isoformat() + "Z"
    payment_id = f"pay_rzp_{int(datetime.utcnow().timestamp())}_{secrets.token_hex(4)}"
    
    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": customer_id,
        "order_id": order_id,
        "amount": amount,
        "currency": "INR",
        "payment_method": "RAZORPAY",
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": razorpay_payment_id,
        "razorpay_signature": razorpay_signature,
        "status": status,
        "verified": verified,
        "mode": RAZORPAY_MODE,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    
    payments_col.insert_one(payment_record)
    
    if status == "paid" and verified:
        orders_col.update_one(
            {"id": order_id},
            {"$set": {"payment_status": "PAID", "payment_method": "RAZORPAY", "updated_at": now_iso}}
        )
        invoice = invoices_col.find_one({"order_id": order_id})
        if invoice:
            invoices_col.update_one(
                {"id": invoice.get("id")},
                {"$set": {"payment_status": "paid", "paid_amount": amount, "balance": 0, "status": "paid", "updated_at": now_iso}}
            )
    
    return {
        "success": True,
        "payment": payment_record
    }


def create_razorpay_order_for_payment(
    order_id: str,
    business_id: str,
    customer_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create Razorpay order and save initial payment record.
    Returns dict with payment_id, razorpay_order_id, razorpay_key_id, amount, currency, amount_paise, status, mode.
    Idempotent: returns existing 'created' status payment for the same order instead of creating a new one.
    """
    orders_col = get_collection("orders")
    payments_col = get_collection("payments")
    
    order = orders_col.find_one({"id": order_id})
    if not order:
        order = orders_col.find_one({"order_id": order_id})
    if not order:
        raise ValueError("Order not found")
    
    if order.get("business_id") != business_id:
        raise ValueError("Business ID does not match order")
    
    amount = float(order.get("total_amount") or order.get("total") or 0)
    if amount <= 0:
        raise ValueError("The order has no payable balance")
    
    # Check for existing paid payment
    existing_paid = payments_col.find_one({"order_id": order.get("id"), "status": "paid", "payment_method": "RAZORPAY"})
    if existing_paid:
        raise ValueError("This order has already been paid")
    
    # Check for existing 'created' status payment (idempotency - return existing Razorpay order)
    existing_created = payments_col.find_one({"order_id": order.get("id"), "status": "created", "payment_method": "RAZORPAY"})
    if existing_created and existing_created.get("razorpay_order_id"):
        # Return existing Razorpay order details
        return {
            "success": True,
            "payment_id": existing_created.get("payment_id"),
            "razorpay_order_id": existing_created.get("razorpay_order_id"),
            "razorpay_key_id": RAZORPAY_KEY_ID,
            "amount": existing_created.get("amount"),
            "currency": "INR",
            "amount_paise": int(round(existing_created.get("amount", 0) * 100)),
            "status": "created",
            "mode": RAZORPAY_MODE,
        }
    
    razorpay_order = create_razorpay_order(amount, order.get("id"), business_id, customer_id)
    
    now_iso = datetime.utcnow().isoformat() + "Z"
    payment_id = f"pay_rzp_{int(datetime.utcnow().timestamp())}_{secrets.token_hex(4)}"
    
    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": customer_id or order.get("customer_id"),
        "order_id": order.get("id"),
        "amount": amount,
        "currency": "INR",
        "payment_method": "RAZORPAY",
        "razorpay_order_id": razorpay_order["id"],
        "status": "created",
        "mode": RAZORPAY_MODE,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    payments_col.insert_one(payment_record)
    
    return {
        "success": True,
        "payment_id": payment_id,
        "razorpay_order_id": razorpay_order["id"],
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "amount": amount,
        "currency": "INR",
        "amount_paise": razorpay_order["amount"],
        "status": "created",
        "mode": RAZORPAY_MODE,
    }


def verify_razorpay_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    order_id: str,
    customer_id: Optional[str] = None,
    role: str = "CUSTOMER"
) -> Dict[str, Any]:
    """
    Verify Razorpay payment signature and update payment/order/invoice records.
    Returns dict with success, message, payment_id, order_id, amount, status.
    """
    if not verify_razorpay_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature):
        raise ValueError("Invalid payment signature")
    
    payments_col = get_collection("payments")
    orders_col = get_collection("orders")
    invoices_col = get_collection("invoices")
    
    payment = payments_col.find_one({"razorpay_order_id": razorpay_order_id})
    if not payment:
        raise ValueError("Payment record not found")
    
    if payment.get("status") == "paid" and payment.get("razorpay_payment_id") == razorpay_payment_id:
        return {
            "success": True,
            "message": "Payment already verified",
            "payment_id": payment.get("payment_id"),
            "status": "paid",
        }
    
    if payment.get("razorpay_payment_id") and payment.get("razorpay_payment_id") != razorpay_payment_id:
        raise ValueError("Payment ID mismatch")
    
    order = orders_col.find_one({"id": payment.get("order_id")})
    if not order:
        raise ValueError("Associated order not found")
    
    if role == "CUSTOMER" and customer_id:
        if payment.get("customer_id") != customer_id and order.get("customer_user_id") != customer_id:
            raise ValueError("Order access not allowed")
    
    now_iso = datetime.utcnow().isoformat() + "Z"
    update_data = {
        "razorpay_payment_id": razorpay_payment_id,
        "razorpay_signature": razorpay_signature,
        "status": "paid",
        "verified": True,
        "updated_at": now_iso,
    }
    payments_col.update_one(
        {"razorpay_order_id": razorpay_order_id},
        {"$set": update_data}
    )
    
    orders_col.update_one(
        {"id": payment.get("order_id")},
        {"$set": {"payment_status": "PAID", "payment_method": "RAZORPAY", "updated_at": now_iso}}
    )
    
    invoice = invoices_col.find_one({"order_id": payment.get("order_id")})
    if invoice:
        invoices_col.update_one(
            {"id": invoice.get("id")},
            {"$set": {"payment_status": "paid", "paid_amount": payment.get("amount"), "balance": 0, "status": "paid", "updated_at": now_iso}}
        )
    
    return {
        "success": True,
        "message": "Payment verified successfully",
        "payment_id": payment.get("payment_id"),
        "order_id": payment.get("order_id"),
        "amount": payment.get("amount"),
        "status": "paid",
    }


def get_razorpay_payment_by_order_id(razorpay_order_id: str) -> Optional[Dict[str, Any]]:
    """Get payment record by Razorpay order ID."""
    payments_col = get_collection("payments")
    return payments_col.find_one({"razorpay_order_id": razorpay_order_id})


def get_razorpay_payment_by_payment_id(razorpay_payment_id: str) -> Optional[Dict[str, Any]]:
    """Get payment record by Razorpay payment ID."""
    payments_col = get_collection("payments")
    return payments_col.find_one({"razorpay_payment_id": razorpay_payment_id})