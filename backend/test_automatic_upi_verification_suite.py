"""
ZOOR UP — Automatic UPI Payment Verification Test Suite
Tests server-side cryptographic signature verification, authoritative order amounts,
webhook idempotency, cross-business isolation, failure handling, and confirms
that orders CANNOT become PAID without authentic confirmation.
"""
import os
import hmac
import hashlib
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_collection
from backend.auth import create_access_token
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER
from backend.razorpay_service import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    create_razorpay_order_for_payment,
    verify_razorpay_payment,
    record_razorpay_payment_failure,
    create_razorpay_order_for_subscription,
    verify_razorpay_subscription_payment,
    process_razorpay_webhook_event,
)

client = TestClient(app)


def _gen_id(prefix="t"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _compute_valid_signature(order_id: str, payment_id: str) -> str:
    payload = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()


def _compute_valid_webhook_signature(body_bytes: bytes) -> str:
    secret = RAZORPAY_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET
    return hmac.new(
        secret.encode("utf-8"),
        body_bytes,
        hashlib.sha256
    ).hexdigest()


@pytest.fixture
def test_env():
    suffix = uuid.uuid4().hex[:6]
    owner_id = f"owner_{suffix}"
    biz_id = f"biz_{suffix}"
    cust_user_id = f"cust_user_{suffix}"
    cust_id = f"cust_{suffix}"

    other_owner_id = f"other_owner_{suffix}"
    other_biz_id = f"other_biz_{suffix}"

    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    cust_col = get_collection("customers")
    cust_biz_col = get_collection("customer_businesses")
    orders_col = get_collection("orders")
    invoices_col = get_collection("invoices")
    payments_col = get_collection("payments")

    # Business 1
    users_col.insert_one({
        "id": owner_id,
        "email": f"owner_{suffix}@example.com",
        "role": ROLE_BUSINESS_OWNER,
        "business_id": biz_id,
    })
    biz_col.insert_one({
        "id": biz_id,
        "owner_id": owner_id,
        "name": f"Store {suffix}",
        "slug": f"store-{suffix}",
        "upi_id": f"store_{suffix}@okaxis",
        "status": "active",
    })

    # Business 2 (for cross-business testing)
    users_col.insert_one({
        "id": other_owner_id,
        "email": f"other_owner_{suffix}@example.com",
        "role": ROLE_BUSINESS_OWNER,
        "business_id": other_biz_id,
    })
    biz_col.insert_one({
        "id": other_biz_id,
        "owner_id": other_owner_id,
        "name": f"Other Store {suffix}",
        "slug": f"other-store-{suffix}",
        "upi_id": f"other_{suffix}@okaxis",
        "status": "active",
    })

    # Customer connected ONLY to Business 1
    users_col.insert_one({
        "id": cust_user_id,
        "email": f"cust_{suffix}@example.com",
        "role": ROLE_CUSTOMER,
        "business_id": biz_id,
    })
    cust_col.insert_one({
        "id": cust_id,
        "customer_id": cust_id,
        "user_id": cust_user_id,
        "name": "Jane Customer",
        "phone": "+919876543210",
        "business_id": biz_id,
    })
    cust_biz_col.insert_one({
        "id": f"cb_{suffix}",
        "customer_id": cust_id,
        "business_id": biz_id,
        "status": "active",
    })

    # Create test order for Business 1
    order_id = f"ord_{suffix}"
    order_amount = 350.0
    orders_col.insert_one({
        "id": order_id,
        "order_id": order_id,
        "business_id": biz_id,
        "customer_id": cust_id,
        "customer_user_id": cust_user_id,
        "customer_name": "Jane Customer",
        "customer_phone": "+919876543210",
        "total": order_amount,
        "total_amount": order_amount,
        "payment_status": "PENDING",
        "payment_method": "UPI",
        "order_type": "DINE_IN",
        "table_number": "5",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    invoices_col.insert_one({
        "id": f"inv_{suffix}",
        "order_id": order_id,
        "business_id": biz_id,
        "customer_id": cust_id,
        "total_amount": order_amount,
        "status": "issued",
        "payment_status": "issued",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    cust_token = create_access_token({"sub": cust_user_id, "role": ROLE_CUSTOMER, "customer_id": cust_id})
    owner_token = create_access_token({"sub": owner_id, "role": ROLE_BUSINESS_OWNER, "business_id": biz_id})

    return {
        "biz_id": biz_id,
        "other_biz_id": other_biz_id,
        "order_id": order_id,
        "order_amount": order_amount,
        "cust_user_id": cust_user_id,
        "cust_id": cust_id,
        "owner_id": owner_id,
        "cust_token": cust_token,
        "owner_token": owner_token,
    }


# =============================================================================
# 1. Successful Verified Payment Flow
# =============================================================================
def test_successful_verified_payment(test_env):
    """
    Validates end-to-end verified payment:
    1. Unique order creation on backend.
    2. Authoritative amount check.
    3. Valid cryptographic signature verification.
    4. Transition to PAID status on order, payment, and invoice.
    """
    token = test_env["cust_token"]
    order_id = test_env["order_id"]
    biz_id = test_env["biz_id"]

    # Step 1: Create Razorpay order
    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": order_id, "business_id": biz_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    rzp_data = resp.json()
    assert rzp_data["success"] is True
    assert "razorpay_order_id" in rzp_data
    assert rzp_data["amount"] == test_env["order_amount"]
    assert rzp_data["amount_paise"] == int(test_env["order_amount"] * 100)

    rzp_order_id = rzp_data["razorpay_order_id"]
    rzp_payment_id = f"pay_{uuid.uuid4().hex[:14]}"

    # Order must still be PENDING before verification
    orders_col = get_collection("orders")
    order = orders_col.find_one({"id": order_id})
    assert order["payment_status"].upper() == "PENDING"

    # Step 2: Compute valid HMAC signature
    valid_sig = _compute_valid_signature(rzp_order_id, rzp_payment_id)

    # Step 3: Verify payment
    verify_resp = client.post(
        "/api/payments/razorpay/verify",
        json={
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": rzp_payment_id,
            "razorpay_signature": valid_sig,
            "order_id": order_id,
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert verify_resp.status_code == 200
    verify_data = verify_resp.json()
    assert verify_data["success"] is True
    assert verify_data["status"] == "paid"

    # Step 4: Verify order, payment, and invoice are marked PAID
    updated_order = orders_col.find_one({"id": order_id})
    assert updated_order["payment_status"].upper() == "PAID"

    payments_col = get_collection("payments")
    updated_pmt = payments_col.find_one({"razorpay_order_id": rzp_order_id})
    assert updated_pmt["status"] == "paid"
    assert updated_pmt["verified"] is True
    assert updated_pmt["razorpay_payment_id"] == rzp_payment_id

    invoices_col = get_collection("invoices")
    updated_inv = invoices_col.find_one({"order_id": order_id})
    assert updated_inv["status"] == "paid"


# =============================================================================
# 2. Forged / Unverified Payment Confirmation Rejected
# =============================================================================
def test_forged_unverified_payment_confirmation(test_env):
    """
    Confirms that fake/tampered signatures are strictly rejected and
    the order CANNOT become PAID without verified confirmation.
    """
    token = test_env["cust_token"]
    order_id = test_env["order_id"]
    biz_id = test_env["biz_id"]

    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": order_id, "business_id": biz_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    rzp_order_id = resp.json()["razorpay_order_id"]
    fake_payment_id = "pay_fake_12345678"
    bogus_sig = "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef"

    # Attempt to verify with forged signature
    verify_resp = client.post(
        "/api/payments/razorpay/verify",
        json={
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": fake_payment_id,
            "razorpay_signature": bogus_sig,
            "order_id": order_id,
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert verify_resp.status_code in (400, 422)
    assert "Invalid payment signature" in verify_resp.text

    # Order MUST remain PENDING
    orders_col = get_collection("orders")
    order = orders_col.find_one({"id": order_id})
    assert order["payment_status"].upper() == "PENDING"


# =============================================================================
# 3. Failed Payment Leaves Order Pending
# =============================================================================
def test_failed_payment_records_failure_and_leaves_order_pending(test_env):
    """
    Client or gateway reported failure records failure status on payment
    and keeps the order PENDING for retry.
    """
    token = test_env["cust_token"]
    order_id = test_env["order_id"]
    biz_id = test_env["biz_id"]

    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": order_id, "business_id": biz_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    rzp_order_id = resp.json()["razorpay_order_id"]

    fail_resp = client.post(
        "/api/payments/razorpay/failure",
        json={
            "razorpay_order_id": rzp_order_id,
            "error_code": "BAD_REQUEST_ERROR",
            "error_description": "UPI transaction declined by bank",
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert fail_resp.status_code == 200

    payments_col = get_collection("payments")
    pmt = payments_col.find_one({"razorpay_order_id": rzp_order_id})
    assert pmt["status"] == "failed"

    orders_col = get_collection("orders")
    order = orders_col.find_one({"id": order_id})
    assert order["payment_status"].upper() == "PENDING"


# =============================================================================
# 4. Pending Payment Remains Pending Without Confirmation
# =============================================================================
def test_pending_payment_remains_pending(test_env):
    """
    Payment intent created but unconfirmed never transitions order to PAID.
    """
    token = test_env["cust_token"]
    order_id = test_env["order_id"]
    biz_id = test_env["biz_id"]

    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": order_id, "business_id": biz_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200

    orders_col = get_collection("orders")
    order = orders_col.find_one({"id": order_id})
    assert order["payment_status"].upper() == "PENDING"


# =============================================================================
# 5. Authoritative Backend Amount (Incorrect Amount Prevented)
# =============================================================================
def test_authoritative_backend_amount_protection(test_env):
    """
    Verifies that order amount is derived authoritatively from the backend order
    record, and cannot be spoofed or manipulated by the client.
    """
    token = test_env["cust_token"]
    order_id = test_env["order_id"]
    biz_id = test_env["biz_id"]

    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": order_id, "business_id": biz_id, "amount": 1.0},
        headers={"Authorization": f"Bearer {token}"}
    )
    data = resp.json()
    # Amount MUST be 350.0 (from DB), NOT 1.0 (from request)
    assert data["amount"] == 350.0
    assert data["amount_paise"] == 35000


# =============================================================================
# 6. Wrong Order Reference Rejected
# =============================================================================
def test_wrong_order_reference_rejected(test_env):
    """
    Verifies that payment verification for a mismatched or non-existent
    order reference is rejected.
    """
    token = test_env["cust_token"]

    resp = client.post(
        "/api/payments/razorpay/verify",
        json={
            "razorpay_order_id": "order_non_existent_999",
            "razorpay_payment_id": "pay_fake_999",
            "razorpay_signature": "fake_sig",
            "order_id": "ord_fake_999",
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code in (400, 404, 500)


# =============================================================================
# 7. Duplicate Webhook Idempotency
# =============================================================================
def test_duplicate_webhook_idempotency(test_env):
    """
    Verifies that duplicate webhook deliveries are handled idempotently without
    errors or status regressions.
    """
    token = test_env["cust_token"]
    order_id = test_env["order_id"]
    biz_id = test_env["biz_id"]

    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": order_id, "business_id": biz_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    rzp_order_id = resp.json()["razorpay_order_id"]
    rzp_payment_id = f"pay_wh_{uuid.uuid4().hex[:12]}"

    webhook_event_id = f"evt_{uuid.uuid4().hex[:10]}"
    webhook_payload = {
        "event": "payment.captured",
        "id": webhook_event_id,
        "payload": {
            "payment": {
                "entity": {
                    "id": rzp_payment_id,
                    "order_id": rzp_order_id,
                    "amount": int(test_env["order_amount"] * 100),
                    "currency": "INR",
                    "status": "captured",
                    "method": "upi",
                }
            }
        }
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")
    sig = _compute_valid_webhook_signature(raw_body)

    # First webhook submission
    wh_resp1 = client.post(
        "/api/payments/razorpay/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
        }
    )
    assert wh_resp1.status_code == 200
    res1 = wh_resp1.json()
    assert res1.get("status") in ("processed", "success", "already_processed")

    # Order should now be PAID
    orders_col = get_collection("orders")
    order = orders_col.find_one({"id": order_id})
    assert order["payment_status"].upper() == "PAID"

    # Second (duplicate) webhook submission
    wh_resp2 = client.post(
        "/api/payments/razorpay/webhook",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Razorpay-Signature": sig,
        }
    )
    assert wh_resp2.status_code == 200
    res2 = wh_resp2.json()
    assert res2.get("status") in ("duplicate_ignored", "already_processed", "processed", "success")

    # Order must remain PAID, no crash
    order_after = orders_col.find_one({"id": order_id})
    assert order_after["payment_status"].upper() == "PAID"


# =============================================================================
# 8. Cross-Business Payment Isolation
# =============================================================================
def test_cross_business_payment_isolation(test_env):
    """
    Verifies that a customer connected only to Business 1 cannot initiate or
    manipulate payments for Business 2.
    """
    token = test_env["cust_token"]
    other_biz_id = test_env["other_biz_id"]

    # Customer tries to initiate payment for other business
    resp = client.post(
        "/api/payments/razorpay/create",
        json={"order_id": test_env["order_id"], "business_id": other_biz_id},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code in (400, 403)


# =============================================================================
# 9. Existing Subscription Razorpay Flow Preserved
# =============================================================================
def test_existing_subscription_razorpay_flow_preserved(test_env):
    """
    Verifies that business subscriptions reusing the same Razorpay integration
    continue to function without regression.
    """
    owner_token = test_env["owner_token"]
    biz_id = test_env["biz_id"]

    resp = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "GROWTH", "billing_interval": "monthly", "business_id": biz_id},
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert resp.status_code == 200
    sub_data = resp.json()
    assert sub_data["success"] is True
    assert "razorpay_order_id" in sub_data
    assert sub_data["amount"] == 799.0
