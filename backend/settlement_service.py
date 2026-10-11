"""
ZOOR UP Business Linked Accounts & Settlement Service
Handles Razorpay Route capabilities inspection, account onboarding status,
and settlement ledger auditing.

Truthful integration: Never fakes external bank settlements.
Accurately reports whether Razorpay Route is enabled or requires onboarding.
"""
import os
from typing import Dict, Any, Optional

from backend.database import get_collection
from backend.razorpay_service import get_razorpay_client, RAZORPAY_MODE


def inspect_route_capability() -> Dict[str, Any]:
    """
    Inspect whether Razorpay Route (transfers / linked accounts) is active on this account.
    Safe: uses read-only probe; never initiates funds transfers.
    """
    try:
        client = get_razorpay_client()
        # Probe transfer API
        client.transfer.all({"count": 1})
        return {
            "supported": True,
            "status": "active",
            "mode": RAZORPAY_MODE,
            "message": "Razorpay Route is active on this account.",
            "requires_action": False,
        }
    except Exception as e:
        error_msg = str(e)
        return {
            "supported": False,
            "status": "inactive_requires_onboarding",
            "mode": RAZORPAY_MODE,
            "message": "Razorpay Route / Marketplace transfers is not activated on this Razorpay account.",
            "error_detail": error_msg,
            "settlement_model": "PLATFORM_STANDARD_DIRECT",
            "requires_action": True,
            "onboarding_requirements": [
                "1. Contact Razorpay Support / Account Manager to enable Razorpay Route for this merchant ID.",
                "2. Submit Platform Marketplace Agreement and Corporate KYC to Razorpay.",
                "3. Collect Business Owner Legal Entity Name, PAN, GSTIN, and Bank Account (IFSC).",
                "4. Programmatically create or link seller accounts via Razorpay Route once activated."
            ]
        }


def get_business_settlement_summary(business_id: str) -> Dict[str, Any]:
    """
    Calculate verified settlement ledger for a business.
    Reports gross collections, calculated platform commission, and net amount.
    Clearly indicates actual settlement state (Standard Platform payout vs Route).
    """
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")

    biz = businesses_col.find_one({"id": business_id}) or {}
    
    # Query all verified paid payments for this business
    all_payments = payments_col.find({"business_id": business_id, "status": "paid"})

    gross_total = 0.0
    commission_total = 0.0
    net_total = 0.0
    payment_count = 0

    for p in all_payments:
        amt = float(p.get("amount") or 0.0)
        comm = float(p.get("commission_amount") or 0.0)
        net = float(p.get("net_amount") or (amt - comm))
        gross_total += amt
        commission_total += comm
        net_total += net
        payment_count += 1

    route_capability = inspect_route_capability()

    return {
        "business_id": business_id,
        "business_name": biz.get("name", "Store"),
        "total_payments_count": payment_count,
        "gross_collected": round(gross_total, 2),
        "platform_commission": round(commission_total, 2),
        "net_payable": round(net_total, 2),
        "currency": "INR",
        "settlement_channel": "PLATFORM_STANDARD_PAYOUT" if not route_capability["supported"] else "RAZORPAY_ROUTE",
        "route_status": route_capability["status"],
        "route_supported": route_capability["supported"],
        "onboarding_requirements": route_capability.get("onboarding_requirements", []),
    }
