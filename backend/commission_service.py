"""
ZOOR UP Platform Commission Service
Provides server-side commission calculations, persistence, and audit breakdown.
Configurable per business (percentage or fixed) with platform default fallback.
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from backend.database import get_collection

# Default platform commission percentage if not explicitly configured per business
DEFAULT_PLATFORM_COMMISSION_PERCENT = float(os.getenv("PLATFORM_COMMISSION_PERCENT", "0.0"))
DEFAULT_PLATFORM_FIXED_FEE = float(os.getenv("PLATFORM_FIXED_FEE", "0.0"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def calculate_commission(amount: float, business: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Calculate server-side platform commission for a verified order amount.
    Applies business-specific rate or platform default.
    Never deducts money directly; provides calculated audit breakdown.
    """
    amount = float(amount or 0.0)
    if amount <= 0.0:
        return {
            "gross_amount": 0.0,
            "commission_rate": 0.0,
            "commission_fixed": 0.0,
            "commission_amount": 0.0,
            "net_business_amount": 0.0,
        }

    biz = business or {}
    
    # Priority: business-specific rate > platform default
    rate_val = biz.get("commission_rate")
    if rate_val is None:
        rate_val = biz.get("commission_percentage")
    if rate_val is None:
        rate_val = DEFAULT_PLATFORM_COMMISSION_PERCENT
    commission_rate = max(0.0, float(rate_val or 0.0))

    fixed_val = biz.get("commission_fixed")
    if fixed_val is None:
        fixed_val = DEFAULT_PLATFORM_FIXED_FEE
    commission_fixed = max(0.0, float(fixed_val or 0.0))

    # Calculate percentage fee
    percentage_fee = round((amount * commission_rate) / 100.0, 2)
    total_commission = round(percentage_fee + commission_fixed, 2)

    # Commission cannot exceed gross amount
    total_commission = min(total_commission, amount)
    net_business_amount = round(amount - total_commission, 2)

    return {
        "gross_amount": amount,
        "commission_rate": commission_rate,
        "commission_fixed": commission_fixed,
        "commission_amount": total_commission,
        "net_business_amount": net_business_amount,
    }


def record_commission_for_payment(
    payment_id: str,
    order_id: str,
    business_id: str,
    amount: float
) -> Dict[str, Any]:
    """
    Record calculated platform commission for a verified payment.
    Idempotent: returns existing commission record if already calculated.
    """
    commissions_col = get_collection("commissions")
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")

    # 1. Idempotency check: don't charge or record commission twice
    existing = commissions_col.find_one({"payment_id": payment_id})
    if existing:
        return existing

    biz = businesses_col.find_one({"id": business_id}) or {}
    calc = calculate_commission(amount, biz)

    now_iso = _now_iso()
    record_id = f"comm_{uuid.uuid4().hex[:12]}"

    commission_record = {
        "id": record_id,
        "commission_id": record_id,
        "payment_id": payment_id,
        "order_id": order_id,
        "business_id": business_id,
        "gross_amount": calc["gross_amount"],
        "commission_rate": calc["commission_rate"],
        "commission_fixed": calc["commission_fixed"],
        "commission_amount": calc["commission_amount"],
        "net_business_amount": calc["net_business_amount"],
        "currency": "INR",
        "status": "calculated",  # Indicates audit calculation; not actual bank deduction
        "refund_status": None,
        "refunded_commission": 0.0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    try:
        commissions_col.insert_one(commission_record)
    except Exception:
        pass

    # Also update payment record with commission breakdown for unified transaction display
    try:
        payments_col.update_one(
            {"payment_id": payment_id},
            {
                "$set": {
                    "commission_amount": calc["commission_amount"],
                    "commission_rate": calc["commission_rate"],
                    "net_amount": calc["net_business_amount"],
                    "commission_status": "calculated",
                    "updated_at": now_iso,
                }
            }
        )
    except Exception:
        pass

    return commission_record


def handle_commission_refund(payment_id: str, refund_amount: float) -> Optional[Dict[str, Any]]:
    """
    Update commission record if a payment is refunded.
    Proportionately adjusts or voids the calculated commission.
    """
    commissions_col = get_collection("commissions")
    record = commissions_col.find_one({"payment_id": payment_id})
    if not record:
        return None

    now_iso = _now_iso()
    gross = float(record.get("gross_amount") or 0.0)
    orig_commission = float(record.get("commission_amount") or 0.0)
    refund_amt = float(refund_amount or 0.0)

    if gross > 0:
        refund_ratio = min(1.0, refund_amt / gross)
        refunded_comm = round(orig_commission * refund_ratio, 2)
    else:
        refunded_comm = orig_commission

    update_fields = {
        "refund_status": "fully_refunded" if refund_amt >= gross else "partially_refunded",
        "refunded_commission": refunded_comm,
        "updated_at": now_iso,
    }

    commissions_col.update_one({"id": record["id"]}, {"$set": update_fields})
    record.update(update_fields)
    return record
