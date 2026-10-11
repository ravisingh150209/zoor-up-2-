"""
Test Suite: ZOOR UP Business Subscription Razorpay Integration
Verifies that Business Subscriptions reuse the EXACT SAME Razorpay merchant account,
credentials, and configuration as customer orders, while maintaining complete separation
from customer orders and ensuring rigorous backend cryptographic signature verification.
"""
import os
import hmac
import hashlib
import uuid
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_collection
from backend.auth import create_access_token
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER, ROLE_SUPER_ADMIN
from backend.razorpay_service import (
    RAZORPAY_MODE,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    SUBSCRIPTION_PLAN_PRICING,
    verify_razorpay_signature,
)

client = TestClient(app)


def _gen_test_id(prefix="test"):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _compute_valid_signature(order_id: str, payment_id: str) -> str:
    payload = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()


@pytest.fixture
def test_setup():
    unique_suffix = uuid.uuid4().hex[:6]
    owner_id = f"owner_sub_{unique_suffix}"
    biz_id = f"biz_sub_{unique_suffix}"
    other_owner_id = f"owner_other_{unique_suffix}"
    other_biz_id = f"biz_other_{unique_suffix}"
    customer_user_id = f"cust_user_{unique_suffix}"

    users_col = get_collection("users")
    biz_col = get_collection("businesses")

    # 1. Main Business Owner
    users_col.insert_one({
        "id": owner_id,
        "email": f"owner_{unique_suffix}@example.com",
        "role": ROLE_BUSINESS_OWNER,
        "business_id": biz_id,
    })
    biz_col.insert_one({
        "id": biz_id,
        "owner_id": owner_id,
        "name": f"Sub Test Cafe {unique_suffix}",
        "subscription_plan": "FREE",
        "subscription_status": "ACTIVE",
        "payment_status": "FREE",
    })

    # 2. Secondary Business Owner
    users_col.insert_one({
        "id": other_owner_id,
        "email": f"other_{unique_suffix}@example.com",
        "role": ROLE_BUSINESS_OWNER,
        "business_id": other_biz_id,
    })
    biz_col.insert_one({
        "id": other_biz_id,
        "owner_id": other_owner_id,
        "name": f"Other Cafe {unique_suffix}",
        "subscription_plan": "FREE",
        "subscription_status": "ACTIVE",
        "payment_status": "FREE",
    })

    # 3. Customer User
    users_col.insert_one({
        "id": customer_user_id,
        "email": f"customer_{unique_suffix}@example.com",
        "role": ROLE_CUSTOMER,
    })

    owner_token = create_access_token({"sub": owner_id, "role": ROLE_BUSINESS_OWNER})
    other_owner_token = create_access_token({"sub": other_owner_id, "role": ROLE_BUSINESS_OWNER})
    customer_token = create_access_token({"sub": customer_user_id, "role": ROLE_CUSTOMER})

    return {
        "owner_id": owner_id,
        "biz_id": biz_id,
        "owner_headers": {"Authorization": f"Bearer {owner_token}"},
        "other_owner_headers": {"Authorization": f"Bearer {other_owner_token}"},
        "customer_headers": {"Authorization": f"Bearer {customer_token}"},
    }


def test_reused_razorpay_account_and_credentials_consistency():
    """Requirement 1, 2, 3, 11: Reuses EXACT SAME merchant credentials and mode."""
    assert RAZORPAY_KEY_ID != "", "Razorpay Key ID must be configured"
    assert RAZORPAY_KEY_SECRET != "", "Razorpay Key Secret must be configured"
    assert RAZORPAY_MODE in ("test", "live"), "Razorpay mode must be test or live"
    assert RAZORPAY_KEY_ID.startswith(f"rzp_{RAZORPAY_MODE}_"), (
        f"Key ID {RAZORPAY_KEY_ID[:10]} must match mode {RAZORPAY_MODE}"
    )


def test_authoritative_subscription_pricing():
    """Requirement 5: Pricing is authoritative server-side, preventing tampering."""
    assert SUBSCRIPTION_PLAN_PRICING["STARTER"]["monthly"] == 299.0
    assert SUBSCRIPTION_PLAN_PRICING["GROWTH"]["monthly"] == 799.0
    assert SUBSCRIPTION_PLAN_PRICING["PRO"]["monthly"] == 1499.0
    assert SUBSCRIPTION_PLAN_PRICING["PREMIUM"]["monthly"] == 2499.0

    assert SUBSCRIPTION_PLAN_PRICING["STARTER"]["annual"] == 2990.0
    assert SUBSCRIPTION_PLAN_PRICING["GROWTH"]["annual"] == 7990.0
    assert SUBSCRIPTION_PLAN_PRICING["PRO"]["annual"] == 14990.0
    assert SUBSCRIPTION_PLAN_PRICING["PREMIUM"]["annual"] == 24990.0


def test_customer_cannot_initiate_subscription(test_setup):
    """Requirement 6, 8: Access control ensures customers cannot initiate business subscriptions."""
    res = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "GROWTH", "billing_interval": "monthly"},
        headers=test_setup["customer_headers"]
    )
    assert res.status_code == 403


def test_cross_business_subscription_initiation_rejected(test_setup):
    """Security: Business owners cannot initiate subscriptions for another store."""
    res = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "GROWTH", "business_id": "biz_someone_else"},
        headers=test_setup["owner_headers"]
    )
    assert res.status_code == 403


def test_subscription_razorpay_order_creation_and_separation(test_setup):
    """
    Requirement 5, 6, 7, 8:
    Creates Razorpay order with notes.type = BUSINESS_SUBSCRIPTION.
    Payment record in DB has order_id = None, customer_id = None, payment_type = BUSINESS_SUBSCRIPTION.
    NO customer orders are created.
    """
    orders_col = get_collection("orders")
    initial_orders_count = orders_col.count_documents({})

    res = client.post(
        "/api/payments/subscription/razorpay/create",
        json={
            "plan_id": "GROWTH",
            "billing_interval": "monthly",
            "business_id": test_setup["biz_id"]
        },
        headers=test_setup["owner_headers"]
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["success"] is True
    assert data["razorpay_key_id"] == RAZORPAY_KEY_ID
    assert data["amount"] == 799.0
    assert data["amount_paise"] == 79900
    assert data["status"] == "pending"
    assert data["mode"] == RAZORPAY_MODE
    assert data["plan_id"] == "growth"
    assert data["razorpay_order_id"].startswith("order_")

    # Verify Database Payment Record
    payments_col = get_collection("payments")
    pay_rec = payments_col.find_one({"razorpay_order_id": data["razorpay_order_id"]})
    assert pay_rec is not None
    assert pay_rec["business_id"] == test_setup["biz_id"]
    assert pay_rec.get("order_id") is None, "Subscription payment must NOT have customer order_id"
    assert pay_rec.get("customer_id") is None, "Subscription payment must NOT have customer_id"
    assert pay_rec["payment_type"] == "BUSINESS_SUBSCRIPTION"
    assert pay_rec["status"] == "pending"
    assert pay_rec["amount"] == 799.0
    assert pay_rec["payment_method"] == "RAZORPAY"

    # Verify zero customer orders created
    current_orders_count = orders_col.count_documents({})
    assert current_orders_count == initial_orders_count, "Zero customer orders must be created"


def test_subscription_razorpay_order_creation_idempotency(test_setup):
    """Idempotency: Re-requesting the same pending subscription returns the existing order."""
    res1 = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "PRO", "billing_interval": "annual", "business_id": test_setup["biz_id"]},
        headers=test_setup["owner_headers"]
    )
    assert res1.status_code == 200
    order_id_1 = res1.json()["razorpay_order_id"]

    res2 = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "PRO", "billing_interval": "annual", "business_id": test_setup["biz_id"]},
        headers=test_setup["owner_headers"]
    )
    assert res2.status_code == 200
    order_id_2 = res2.json()["razorpay_order_id"]

    assert order_id_1 == order_id_2, "Must return idempotent pending Razorpay order"


def test_subscription_signature_verification_security(test_setup):
    """Requirement 9: Invalid signature is rejected and plan is NOT activated."""
    create_res = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "STARTER", "billing_interval": "monthly", "business_id": test_setup["biz_id"]},
        headers=test_setup["owner_headers"]
    )
    assert create_res.status_code == 200
    rzp_order_id = create_res.json()["razorpay_order_id"]

    # Attempt with forged signature
    forged_verify = client.post(
        "/api/payments/subscription/razorpay/verify",
        json={
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": "pay_fake_999999",
            "razorpay_signature": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "plan_id": "STARTER",
            "billing_interval": "monthly",
            "business_id": test_setup["biz_id"]
        },
        headers=test_setup["owner_headers"]
    )
    assert forged_verify.status_code == 400
    assert "Invalid payment signature" in forged_verify.text

    # Verify plan was NOT activated
    biz = get_collection("businesses").find_one({"id": test_setup["biz_id"]})
    assert biz.get("subscription_plan") == "FREE"


def test_successful_subscription_verification_and_activation(test_setup):
    """
    Requirement 5, 8, 9:
    Authentic signature verification marks payment paid and activates plan in businesses and subscriptions tables.
    Guarantees no customer orders or commissions are touched.
    """
    orders_col = get_collection("orders")
    commissions_col = get_collection("commissions")
    initial_orders_count = orders_col.count_documents({})
    initial_commissions_count = commissions_col.count_documents({})

    create_res = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "PREMIUM", "billing_interval": "annual", "business_id": test_setup["biz_id"]},
        headers=test_setup["owner_headers"]
    )
    assert create_res.status_code == 200
    rzp_order_id = create_res.json()["razorpay_order_id"]

    fake_payment_id = f"pay_test_{uuid.uuid4().hex[:10]}"
    valid_signature = _compute_valid_signature(rzp_order_id, fake_payment_id)

    verify_res = client.post(
        "/api/payments/subscription/razorpay/verify",
        json={
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": fake_payment_id,
            "razorpay_signature": valid_signature,
            "plan_id": "PREMIUM",
            "billing_interval": "annual",
            "business_id": test_setup["biz_id"]
        },
        headers=test_setup["owner_headers"]
    )
    assert verify_res.status_code == 200, verify_res.text
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    assert verify_data["plan_id"] == "PREMIUM"
    assert verify_data["subscription_status"] == "ACTIVE"

    # Verify payments table
    payments_col = get_collection("payments")
    pay_rec = payments_col.find_one({"razorpay_order_id": rzp_order_id})
    assert pay_rec["status"] == "paid"
    assert pay_rec["verified"] is True
    assert pay_rec["razorpay_payment_id"] == fake_payment_id
    assert pay_rec["order_id"] is None

    # Verify businesses table updated
    biz = get_collection("businesses").find_one({"id": test_setup["biz_id"]})
    assert biz["subscription_plan"] == "PREMIUM"
    assert biz["subscription_status"] == "ACTIVE"
    assert biz["payment_status"] == "PAID"
    assert biz["trial_status"] == "COMPLETED"
    assert biz.get("subscription_ends_at") is not None

    # Verify subscriptions table updated
    subs_col = get_collection("subscriptions")
    sub_rec = subs_col.find_one({"business_id": test_setup["biz_id"]})
    assert sub_rec is not None
    assert sub_rec["plan_id"] == "PREMIUM"
    assert sub_rec["status"] == "active"
    assert sub_rec["provider"] == "RAZORPAY"
    assert sub_rec["billing_interval"] == "annual"

    # Verify zero customer orders and zero order commissions
    assert orders_col.count_documents({}) == initial_orders_count
    assert commissions_col.count_documents({}) == initial_commissions_count


def test_idempotent_subscription_verification(test_setup):
    """Idempotency: Verifying an already verified subscription succeeds safely."""
    create_res = client.post(
        "/api/payments/subscription/razorpay/create",
        json={"plan_id": "GROWTH", "billing_interval": "monthly", "business_id": test_setup["biz_id"]},
        headers=test_setup["owner_headers"]
    )
    rzp_order_id = create_res.json()["razorpay_order_id"]
    payment_id = f"pay_test_{uuid.uuid4().hex[:10]}"
    signature = _compute_valid_signature(rzp_order_id, payment_id)

    verify1 = client.post(
        "/api/payments/subscription/razorpay/verify",
        json={
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
            "plan_id": "GROWTH",
            "business_id": test_setup["biz_id"]
        },
        headers=test_setup["owner_headers"]
    )
    assert verify1.status_code == 200

    verify2 = client.post(
        "/api/payments/subscription/razorpay/verify",
        json={
            "razorpay_order_id": rzp_order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
            "plan_id": "GROWTH",
            "business_id": test_setup["biz_id"]
        },
        headers=test_setup["owner_headers"]
    )
    assert verify2.status_code == 200
    assert "already verified" in verify2.json()["message"].lower()


if __name__ == "__main__":
    pytest.main(["-v", __file__])
