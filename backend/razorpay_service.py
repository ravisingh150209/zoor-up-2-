"""
Razorpay Service for ZOOR UP
Handles Razorpay order creation, signature verification, webhook processing,
and secure payment state management.
"""
import os
import hmac
import hashlib
import secrets
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import requests
import requests.adapters
import razorpay
from backend.database import get_collection
from backend.commission_service import record_commission_for_payment

# Configuration
RAZORPAY_MODE = os.getenv("RAZORPAY_MODE", "test").strip().lower()
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip() or RAZORPAY_KEY_SECRET


def refresh_razorpay_config():
    """Refreshes module configuration dynamically from backend environment variables."""
    global RAZORPAY_MODE, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
    RAZORPAY_MODE = os.getenv("RAZORPAY_MODE", "test").strip().lower()
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
    RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip() or RAZORPAY_KEY_SECRET


# Connection and response timeout adapter (10s connect, 15s read)
class TimeoutHTTPAdapter(requests.adapters.HTTPAdapter):
    def __init__(self, timeout=None, *args, **kwargs):
        self.timeout = timeout
        super().__init__(*args, **kwargs)

    def send(self, *args, **kwargs):
        kwargs["timeout"] = kwargs.get("timeout") or self.timeout
        return super().send(*args, **kwargs)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sanitize_error_message(err: Any) -> str:
    """Sanitizes error messages, never leaking secrets in logs or API responses."""
    err_str = str(err)
    secrets_to_check = [
        RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET,
        os.getenv("RAZORPAY_KEY_SECRET", ""),
        os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
    ]
    for s in secrets_to_check:
        clean = (s or "").strip()
        if clean and len(clean) >= 4 and clean in err_str:
            err_str = err_str.replace(clean, "[REDACTED]")
    return err_str


def validate_razorpay_config(
    mode: Optional[str] = None,
    key_id: Optional[str] = None,
    key_secret: Optional[str] = None
) -> bool:
    """
    Validates Razorpay configuration consistency without exposing credentials.
    Supports both 'test' and 'live' modes.
    Enforces rzp_test_ prefix in test mode and rzp_live_ prefix in live mode.
    """
    resolved_mode = (mode if mode is not None else RAZORPAY_MODE).strip().lower()
    resolved_key_id = (key_id if key_id is not None else RAZORPAY_KEY_ID).strip()
    resolved_key_secret = (key_secret if key_secret is not None else RAZORPAY_KEY_SECRET).strip()

    if resolved_mode not in ("test", "live"):
        raise RuntimeError(f"Configuration error: Invalid RAZORPAY_MODE '{resolved_mode}'. Allowed modes are 'test' and 'live'.")

    if not resolved_key_id or not resolved_key_secret:
        raise RuntimeError("Razorpay credentials not configured on server (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).")

    if resolved_mode == "test":
        if not resolved_key_id.startswith("rzp_test_"):
            raise RuntimeError("Configuration error: RAZORPAY_MODE is 'test' but key ID does not start with 'rzp_test_'.")
        if len(resolved_key_id) <= len("rzp_test_"):
            raise RuntimeError("Configuration error: RAZORPAY_KEY_ID must include a valid identifier after 'rzp_test_'.")

    if resolved_mode == "live":
        if not resolved_key_id.startswith("rzp_live_"):
            raise RuntimeError("Configuration error: RAZORPAY_MODE is 'live' but key ID does not start with 'rzp_live_'.")
        if len(resolved_key_id) <= len("rzp_live_"):
            raise RuntimeError("Configuration error: RAZORPAY_KEY_ID must include a valid identifier after 'rzp_live_'.")

    if len(resolved_key_secret) < 8:
        raise RuntimeError("Configuration error: RAZORPAY_KEY_SECRET is invalid or too short.")

    return True


def get_razorpay_client() -> razorpay.Client:
    """Get configured Razorpay client instance with finite request timeouts."""
    validate_razorpay_config()
    client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    
    # Configure 10s connection, 15s read timeout on the client HTTP session
    adapter = TimeoutHTTPAdapter(timeout=(10.0, 15.0))
    client.session.mount("https://", adapter)
    client.session.mount("http://", adapter)
    return client


def create_razorpay_order(
    amount_inr: float,
    order_id: str,
    business_id: str,
    customer_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a Razorpay order for the given amount.
    Amount is in INR (converted authoritatively to paise).
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
    
    try:
        razorpay_order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes,
            "partial_payment": False,
        })
        return razorpay_order
    except Exception as e:
        err_str = _sanitize_error_message(e)
        raise RuntimeError(f"Razorpay order creation failed: {err_str}")


def verify_razorpay_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    secret: Optional[str] = None
) -> bool:
    """
    Verify Razorpay payment signature securely using constant-time comparison.
    Uses the active mode's secret.
    """
    key_secret = secret if secret is not None else RAZORPAY_KEY_SECRET
    if not key_secret or not razorpay_signature or not razorpay_order_id or not razorpay_payment_id:
        return False
    
    payload = f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, razorpay_signature)


def verify_razorpay_webhook_signature(
    raw_body: Any,
    signature: str,
    webhook_secret: Optional[str] = None
) -> bool:
    """
    Verify Razorpay webhook signature securely.
    Uses RAZORPAY_WEBHOOK_SECRET, falling back to RAZORPAY_KEY_SECRET if not set.
    """
    secret = (
        webhook_secret if webhook_secret is not None
        else (RAZORPAY_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET)
    )
    if not secret or not signature:
        return False
    
    if isinstance(raw_body, str):
        body_bytes = raw_body.encode("utf-8")
    elif isinstance(raw_body, (bytes, bytearray)):
        body_bytes = bytes(raw_body)
    else:
        return False
    
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        body_bytes,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


def create_razorpay_order_for_payment(
    order_id: str,
    business_id: str,
    customer_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create Razorpay order and save initial payment record.
    Returns dict with payment_id, razorpay_order_id, razorpay_key_id, amount, currency, amount_paise, status, mode.
    Idempotent: returns existing 'pending' status payment for the same order instead of duplicating.
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
    
    amount = float(order.get("total_amount") or order.get("total") or 0.0)
    if amount <= 0:
        raise ValueError("The order has no payable balance")
    
    # Check if order is already paid
    if str(order.get("payment_status", "")).upper() == "PAID":
        raise ValueError("This order has already been paid")
    
    existing_paid = payments_col.find_one({"order_id": order.get("id"), "status": "paid", "payment_method": "RAZORPAY"})
    if existing_paid:
        raise ValueError("This order has already been paid")
    
    # Check for existing 'pending' status payment (idempotency - reuse existing Razorpay order)
    existing_pending = payments_col.find_one({"order_id": order.get("id"), "status": "pending", "payment_method": "RAZORPAY"})
    if existing_pending and existing_pending.get("razorpay_order_id"):
        return {
            "success": True,
            "payment_id": existing_pending.get("payment_id"),
            "razorpay_order_id": existing_pending.get("razorpay_order_id"),
            "razorpay_key_id": existing_pending.get("razorpay_key_id") or RAZORPAY_KEY_ID,
            "amount": existing_pending.get("amount"),
            "currency": "INR",
            "amount_paise": int(round(float(existing_pending.get("amount", 0.0)) * 100)),
            "status": "pending",
            "mode": RAZORPAY_MODE,
        }
    
    razorpay_order = create_razorpay_order(amount, order.get("id"), business_id, customer_id)
    
    now_iso = _now_iso()
    payment_id = f"pay_rzp_{int(datetime.now(timezone.utc).timestamp())}_{secrets.token_hex(4)}"
    
    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": customer_id or order.get("customer_id"),
        "customer_name": order.get("customer_name") or "Customer",
        "customer_phone": order.get("customer_phone") or "",
        "order_id": order.get("id"),
        "amount": amount,
        "currency": "INR",
        "payment_method": "RAZORPAY",
        "payment_mode": "ONLINE",
        "razorpay_order_id": razorpay_order["id"],
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "status": "pending",
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
        "status": "pending",
        "mode": RAZORPAY_MODE,
    }


def verify_razorpay_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    order_id: str,
    customer_id: Optional[str] = None,
    user_id: Optional[str] = None,
    role: str = "CUSTOMER"
) -> Dict[str, Any]:
    """
    Verify Razorpay payment signature and update payment/order/invoice/commission records.
    Returns dict with success, message, payment_id, order_id, amount, status.
    Idempotent: prevents duplicate verification and duplicate commissions.
    """
    if not verify_razorpay_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature):
        raise ValueError("Invalid payment signature")
    
    payments_col = get_collection("payments")
    orders_col = get_collection("orders")
    invoices_col = get_collection("invoices")
    
    payment = payments_col.find_one({"razorpay_order_id": razorpay_order_id})
    if not payment:
        raise ValueError("Payment record not found")
    
    # Idempotency check: if already verified as paid with this payment ID, return success safely
    if payment.get("status") == "paid" and payment.get("razorpay_payment_id") == razorpay_payment_id:
        return {
            "success": True,
            "message": "Payment already verified",
            "payment_id": payment.get("payment_id"),
            "order_id": payment.get("order_id"),
            "amount": payment.get("amount"),
            "status": "paid",
            "razorpay_key_id": payment.get("razorpay_key_id") or RAZORPAY_KEY_ID,
        }
    
    if payment.get("razorpay_payment_id") and payment.get("razorpay_payment_id") != razorpay_payment_id:
        raise ValueError("Payment ID mismatch for this order")
    
    target_order_id = payment.get("order_id") or order_id
    order = orders_col.find_one({"id": target_order_id}) or orders_col.find_one({"order_id": target_order_id})
    if not order:
        raise ValueError("Associated order not found")
    
    # Ownership and access authorization check
    if role == "CUSTOMER":
        is_owner = False
        if customer_id and (payment.get("customer_id") == customer_id or order.get("customer_id") == customer_id):
            is_owner = True
        if user_id and order.get("customer_user_id") == user_id:
            is_owner = True
        if not is_owner and (customer_id or user_id):
            raise ValueError("Order access not allowed")
    
    now_iso = _now_iso()
    amount = float(payment.get("amount") or order.get("total") or 0.0)
    
    update_data = {
        "razorpay_payment_id": razorpay_payment_id,
        "razorpay_signature": razorpay_signature,
        "status": "paid",
        "verified": True,
        "verified_at": now_iso,
        "updated_at": now_iso,
    }
    payments_col.update_one(
        {"razorpay_order_id": razorpay_order_id},
        {"$set": update_data}
    )
    
    orders_col.update_one(
        {"id": order.get("id")},
        {"$set": {"payment_status": "PAID", "payment_method": "RAZORPAY", "updated_at": now_iso}}
    )
    
    invoice = invoices_col.find_one({"order_id": order.get("id")})
    if invoice:
        invoices_col.update_one(
            {"id": invoice.get("id")},
            {"$set": {"payment_status": "paid", "paid_amount": amount, "balance": 0.0, "status": "paid", "updated_at": now_iso}}
        )
    
    # Calculate and record server-side commission (Phase 7)
    try:
        record_commission_for_payment(
            payment_id=payment.get("payment_id"),
            order_id=order.get("id"),
            business_id=payment.get("business_id"),
            amount=amount
        )
    except Exception as e:
        print(f"[COMMISSION] Warning: failed to record commission: {e}")
    
    updated_payment = payments_col.find_one({"razorpay_order_id": razorpay_order_id})
    return {
        "success": True,
        "message": "Payment verified successfully",
        "payment_id": payment.get("payment_id"),
        "order_id": order.get("id"),
        "amount": amount,
        "status": "paid",
        "razorpay_key_id": updated_payment.get("razorpay_key_id") if updated_payment else RAZORPAY_KEY_ID,
    }


def record_razorpay_payment_failure(
    razorpay_order_id: str,
    error_code: Optional[str] = None,
    error_description: Optional[str] = None
) -> Dict[str, Any]:
    """
    Record payment failure or cancellation without crashing.
    Uses 'failed' status which is supported by the PostgreSQL schema.
    """
    payments_col = get_collection("payments")
    payment = payments_col.find_one({"razorpay_order_id": razorpay_order_id})
    if not payment:
        return {"success": False, "message": "Payment record not found"}
    
    # If already paid, do not overwrite with failed
    if payment.get("status") == "paid":
        return {"success": False, "message": "Payment is already marked as paid"}
    
    now_iso = _now_iso()
    notes = f"Payment failed: {error_code or 'UNKNOWN'} - {error_description or 'User cancelled or gateway rejected'}"
    
    payments_col.update_one(
        {"razorpay_order_id": razorpay_order_id},
        {
            "$set": {
                "status": "failed",
                "notes": notes,
                "updated_at": now_iso,
            }
        }
    )
    return {"success": True, "status": "failed", "payment_id": payment.get("payment_id")}


def process_razorpay_webhook_event(event_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process incoming asynchronous webhook event from Razorpay.
    Prevents duplicate processing via webhook_events idempotency collection.
    """
    event_id = event_payload.get("event_id") or event_payload.get("id")
    event_type = event_payload.get("event")
    
    if not event_type:
        return {"status": "ignored", "reason": "Missing event type"}
    
    events_col = get_collection("webhook_events")
    if event_id:
        existing = events_col.find_one({"event_id": event_id})
        if existing:
            return {"status": "duplicate_ignored", "event_id": event_id}
        
        events_col.insert_one({
            "id": f"evt_{secrets.token_hex(8)}",
            "event_id": event_id,
            "event_type": event_type,
            "received_at": _now_iso(),
        })
    
    payload = event_payload.get("payload", {})
    payment_entity = payload.get("payment", {}).get("entity", {})
    order_entity = payload.get("order", {}).get("entity", {})
    
    rzp_order_id = payment_entity.get("order_id") or order_entity.get("id")
    rzp_payment_id = payment_entity.get("id")
    
    if event_type in ("payment.captured", "order.paid"):
        if rzp_order_id:
            payments_col = get_collection("payments")
            payment = payments_col.find_one({"razorpay_order_id": rzp_order_id})
            if payment and payment.get("status") != "paid":
                now_iso = _now_iso()
                payments_col.update_one(
                    {"razorpay_order_id": rzp_order_id},
                    {
                        "$set": {
                            "status": "paid",
                            "razorpay_payment_id": rzp_payment_id or payment.get("razorpay_payment_id"),
                            "verified": True,
                            "verified_at": now_iso,
                            "updated_at": now_iso,
                        }
                    }
                )
                
                # Check if this is a business subscription payment
                is_sub = (
                    payment.get("payment_type") == "BUSINESS_SUBSCRIPTION"
                    or payment.get("plan_id") is not None
                    or payment.get("order_id") is None
                )
                
                if is_sub:
                    biz_id = payment.get("business_id")
                    target_plan = (payment.get("plan_id") or "GROWTH").upper()
                    interval = (payment.get("billing_interval") or "monthly").lower()
                    from datetime import timedelta
                    duration_days = 365 if interval == "annual" else 30
                    ends_at = datetime.now(timezone.utc) + timedelta(days=duration_days)
                    ends_at_iso = ends_at.isoformat().replace("+00:00", "Z")
                    
                    if biz_id:
                        biz_col = get_collection("businesses")
                        biz_col.update_one(
                            {"id": biz_id},
                            {"$set": {
                                "subscription_plan": target_plan,
                                "subscription_status": "ACTIVE",
                                "payment_status": "PAID",
                                "trial_status": "COMPLETED",
                                "subscription_started_at": now_iso,
                                "subscription_ends_at": ends_at_iso,
                                "current_period_end": ends_at_iso,
                                "updated_at": now_iso,
                            }}
                        )
                        subs_col = get_collection("subscriptions")
                        subs_col.update_one(
                            {"business_id": biz_id},
                            {"$set": {
                                "plan_id": target_plan,
                                "plan": target_plan,
                                "status": "active",
                                "subscription_status": "ACTIVE",
                                "payment_status": "PAID",
                                "current_period_start": now_iso,
                                "current_period_end": ends_at_iso,
                                "subscription_started_at": now_iso,
                                "subscription_ends_at": ends_at_iso,
                                "billing_interval": interval,
                                "amount": float(payment.get("amount") or 0.0),
                                "currency": "INR",
                                "provider": "RAZORPAY",
                                "last_payment_id": payment.get("payment_id"),
                                "updated_at": now_iso,
                            }},
                            upsert=True
                        )
                    return {"status": "processed", "action": "subscription_activated", "business_id": biz_id, "plan": target_plan}
                
                # Customer order payment (order_id exists)
                if payment.get("order_id"):
                    orders_col = get_collection("orders")
                    orders_col.update_one(
                        {"id": payment.get("order_id")},
                        {"$set": {"payment_status": "PAID", "payment_method": "RAZORPAY", "updated_at": now_iso}}
                    )
                    invoices_col = get_collection("invoices")
                    invoices_col.update_one(
                        {"order_id": payment.get("order_id")},
                        {"$set": {"payment_status": "paid", "paid_amount": float(payment.get("amount") or 0.0), "balance": 0.0, "status": "paid", "updated_at": now_iso}}
                    )
                    try:
                        record_commission_for_payment(
                            payment_id=payment.get("payment_id"),
                            order_id=payment.get("order_id"),
                            business_id=payment.get("business_id"),
                            amount=float(payment.get("amount") or 0.0)
                        )
                    except Exception:
                        pass
                return {"status": "processed", "action": "marked_paid", "order_id": payment.get("order_id")}
    
    elif event_type == "payment.failed":
        if rzp_order_id:
            record_razorpay_payment_failure(
                razorpay_order_id=rzp_order_id,
                error_code=payment_entity.get("error_code"),
                error_description=payment_entity.get("error_description")
            )
            return {"status": "processed", "action": "marked_failed", "razorpay_order_id": rzp_order_id}
    
    return {"status": "acknowledged", "event_type": event_type}


def get_razorpay_payment_by_order_id(razorpay_order_id: str) -> Optional[Dict[str, Any]]:
    """Get payment record by Razorpay order ID."""
    payments_col = get_collection("payments")
    return payments_col.find_one({"razorpay_order_id": razorpay_order_id})


def get_razorpay_payment_by_payment_id(razorpay_payment_id: str) -> Optional[Dict[str, Any]]:
    """Get payment record by Razorpay payment ID."""
    payments_col = get_collection("payments")
    return payments_col.find_one({"razorpay_payment_id": razorpay_payment_id})


# =============================================================================
# BUSINESS SUBSCRIPTION RAZORPAY INTEGRATION
# Reuses EXACT SAME Razorpay merchant account, credentials, and infrastructure
# =============================================================================

SUBSCRIPTION_PLAN_PRICING: Dict[str, Dict[str, float]] = {
    "FREE": {"monthly": 0.0, "annual": 0.0},
    "STARTER": {"monthly": 299.0, "annual": 2990.0},
    "GROWTH": {"monthly": 799.0, "annual": 7990.0},
    "PRO": {"monthly": 1499.0, "annual": 14990.0},
    "PREMIUM": {"monthly": 2499.0, "annual": 24990.0},
}


def create_razorpay_order_for_subscription(
    business_id: str,
    plan_id: str,
    billing_interval: str = "monthly",
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a Razorpay order for a business subscription using the exact same
    Razorpay merchant credentials and configuration as customer orders.
    Guarantees strict separation:
      - order_id is None (cannot create or touch customer orders)
      - customer_id is None
      - payment_type is 'BUSINESS_SUBSCRIPTION'
    """
    plan_key = plan_id.upper().strip()
    if plan_key not in SUBSCRIPTION_PLAN_PRICING:
        raise ValueError(f"Invalid subscription plan '{plan_id}'. Allowed plans: {list(SUBSCRIPTION_PLAN_PRICING.keys())}")
    
    interval = (billing_interval or "monthly").lower().strip()
    if interval not in ("monthly", "annual"):
        interval = "monthly"
        
    amount_inr = SUBSCRIPTION_PLAN_PRICING[plan_key][interval]
    if amount_inr <= 0:
        raise ValueError("Free plan requires no payment.")
        
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": business_id})
    if not biz:
        raise ValueError("Business not found")
        
    client = get_razorpay_client()
    amount_paise = int(round(amount_inr * 100))
    if amount_paise < 100:
        raise ValueError("Subscription amount must be at least ₹1.00")
    
    payments_col = get_collection("payments")
    
    # Idempotency check: reuse pending subscription payment for this exact business and plan if exists
    existing_pending = payments_col.find_one({
        "business_id": business_id,
        "plan_id": plan_key.lower(),
        "billing_interval": interval,
        "status": "pending",
        "payment_method": "RAZORPAY"
    })
    if existing_pending and existing_pending.get("razorpay_order_id"):
        return {
            "success": True,
            "payment_id": existing_pending.get("payment_id"),
            "razorpay_order_id": existing_pending.get("razorpay_order_id"),
            "razorpay_key_id": existing_pending.get("razorpay_key_id") or RAZORPAY_KEY_ID,
            "amount": existing_pending.get("amount"),
            "currency": "INR",
            "amount_paise": int(round(float(existing_pending.get("amount", amount_inr)) * 100)),
            "status": "pending",
            "mode": RAZORPAY_MODE,
            "plan_id": plan_key.lower(),
            "plan_name": plan_key.capitalize(),
            "billing_interval": interval,
            "business_id": business_id,
            "business_name": biz.get("name") or "Business",
        }
        
    receipt = f"sub_{business_id[:8]}_{secrets.token_hex(4)}"
    notes = {
        "type": "BUSINESS_SUBSCRIPTION",
        "business_id": business_id,
        "plan_id": plan_key.lower(),
        "billing_interval": interval,
        "mode": RAZORPAY_MODE,
    }
    if user_id:
        notes["user_id"] = user_id
        
    try:
        razorpay_order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes,
            "partial_payment": False,
        })
    except Exception as e:
        err_str = _sanitize_error_message(e)
        raise RuntimeError(f"Razorpay subscription order creation failed: {err_str}")
        
    now_iso = _now_iso()
    payment_id = f"pay_sub_{int(datetime.now(timezone.utc).timestamp())}_{secrets.token_hex(4)}"
    
    payment_record = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": business_id,
        "customer_id": None,
        "customer_name": f"{biz.get('name') or 'Business'} Subscription",
        "order_id": None,
        "payment_type": "BUSINESS_SUBSCRIPTION",
        "plan_id": plan_key.lower(),
        "plan_name": plan_key.capitalize(),
        "billing_interval": interval,
        "amount": amount_inr,
        "currency": "INR",
        "payment_method": "RAZORPAY",
        "payment_mode": "ONLINE",
        "razorpay_order_id": razorpay_order["id"],
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "status": "pending",
        "mode": RAZORPAY_MODE,
        "notes": f"ZOOR UP {plan_key.capitalize()} Plan ({interval.capitalize()})",
        "metadata": {
            "type": "BUSINESS_SUBSCRIPTION",
            "business_id": business_id,
            "plan_id": plan_key.lower(),
            "billing_interval": interval,
            "user_id": user_id,
        },
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    payments_col.insert_one(payment_record)
    
    return {
        "success": True,
        "payment_id": payment_id,
        "razorpay_order_id": razorpay_order["id"],
        "razorpay_key_id": RAZORPAY_KEY_ID,
        "amount": amount_inr,
        "currency": "INR",
        "amount_paise": razorpay_order["amount"],
        "status": "pending",
        "mode": RAZORPAY_MODE,
        "plan_id": plan_key.lower(),
        "plan_name": plan_key.capitalize(),
        "billing_interval": interval,
        "business_id": business_id,
        "business_name": biz.get("name") or "Business",
    }


def verify_razorpay_subscription_payment(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
    business_id: str,
    plan_id: Optional[str] = None,
    billing_interval: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Verify Razorpay payment signature for business subscription and activate the subscription plan.
    Does NOT create or modify customer orders or customer order commissions.
    Reuses existing verify_razorpay_signature cryptographic implementation.
    """
    if not verify_razorpay_signature(razorpay_order_id, razorpay_payment_id, razorpay_signature):
        raise ValueError("Invalid payment signature")
        
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")
    subs_col = get_collection("subscriptions")
    
    payment = payments_col.find_one({"razorpay_order_id": razorpay_order_id})
    if not payment:
        raise ValueError("Payment record not found")
        
    if payment.get("business_id") != business_id:
        raise ValueError("Business ID mismatch for this payment")
        
    # Idempotency check: if already verified as paid with this payment ID, return success safely
    if payment.get("status") == "paid" and payment.get("razorpay_payment_id") == razorpay_payment_id:
        return {
            "success": True,
            "message": "Subscription payment already verified",
            "payment_id": payment.get("payment_id"),
            "business_id": business_id,
            "plan_id": (payment.get("plan_id") or plan_id or "GROWTH").upper(),
            "status": "paid",
            "subscription_status": "ACTIVE",
            "razorpay_key_id": payment.get("razorpay_key_id") or RAZORPAY_KEY_ID,
        }
        
    if payment.get("razorpay_payment_id") and payment.get("razorpay_payment_id") != razorpay_payment_id:
        raise ValueError("Payment ID mismatch for this order")
        
    now_dt = datetime.now(timezone.utc)
    now_iso = _now_iso()
    target_plan = (plan_id or payment.get("plan_id") or "GROWTH").upper()
    interval = (billing_interval or payment.get("billing_interval") or "monthly").lower()
    
    from datetime import timedelta
    duration_days = 365 if interval == "annual" else 30
    ends_at = now_dt + timedelta(days=duration_days)
    ends_at_iso = ends_at.isoformat().replace("+00:00", "Z")
    
    update_data = {
        "razorpay_payment_id": razorpay_payment_id,
        "razorpay_signature": razorpay_signature,
        "status": "paid",
        "verified": True,
        "verified_at": now_iso,
        "updated_at": now_iso,
    }
    payments_col.update_one(
        {"razorpay_order_id": razorpay_order_id},
        {"$set": update_data}
    )
    
    # Authoritatively activate business subscription
    biz_update = {
        "subscription_plan": target_plan,
        "subscription_status": "ACTIVE",
        "payment_status": "PAID",
        "trial_status": "COMPLETED",
        "subscription_started_at": now_iso,
        "subscription_ends_at": ends_at_iso,
        "current_period_end": ends_at_iso,
        "updated_at": now_iso,
    }
    businesses_col.update_one(
        {"id": business_id},
        {"$set": biz_update}
    )
    
    # Upsert authoritative subscription record in subscriptions table
    sub_record = {
        "id": f"sub_rec_{business_id}_{secrets.token_hex(4)}",
        "business_id": business_id,
        "store_id": business_id,
        "plan_id": target_plan,
        "plan": target_plan,
        "status": "active",
        "subscription_status": "ACTIVE",
        "trial_status": "NOT_APPLICABLE",
        "payment_status": "PAID",
        "current_period_start": now_iso,
        "current_period_end": ends_at_iso,
        "subscription_started_at": now_iso,
        "subscription_ends_at": ends_at_iso,
        "billing_interval": interval,
        "amount": float(payment.get("amount") or 0.0),
        "currency": "INR",
        "provider": "RAZORPAY",
        "last_payment_id": payment.get("payment_id"),
        "razorpay_subscription_id": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    subs_col.update_one(
        {"business_id": business_id},
        {"$set": sub_record},
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Successfully activated {target_plan} subscription plan",
        "payment_id": payment.get("payment_id"),
        "business_id": business_id,
        "plan_id": target_plan,
        "billing_interval": interval,
        "status": "paid",
        "subscription_status": "ACTIVE",
        "current_period_end": ends_at_iso,
        "razorpay_key_id": payment.get("razorpay_key_id") or RAZORPAY_KEY_ID,
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": razorpay_payment_id,
    }