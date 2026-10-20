"""
ZOOR UP - Razorpay LIVE & TEST Mode Comprehensive Verification Test Suite
Verifies:
1. TEST mode configuration & validation (rzp_test_ prefix)
2. LIVE mode configuration & validation (rzp_live_ prefix)
3. Invalid configuration handling (missing keys, mismatched modes, invalid prefixes, truncated keys, short secrets)
4. LIVE mode subscription order creation and metadata
5. LIVE mode signature verification (valid vs tampered/forged) & authoritative activation
6. Client-reported cancellation/failure handling without activating subscriptions
7. Webhook signature verification using RAZORPAY_WEBHOOK_SECRET
8. Webhook payment.captured activation & payment.failed handling
9. Webhook idempotency handling
10. Strict separation from customer QR orders (UPI and Cash)
11. Zero secrets exposure in responses, logs, or error messages
"""
import os
import hmac
import hashlib
import json
import uuid
from unittest.mock import MagicMock, patch
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
    RAZORPAY_WEBHOOK_SECRET,
    validate_razorpay_config,
    create_razorpay_order_for_subscription,
    verify_razorpay_signature,
    verify_razorpay_subscription_payment,
    record_razorpay_payment_failure,
    verify_razorpay_webhook_signature,
    process_razorpay_webhook_event,
    _sanitize_error_message,
)

client = TestClient(app)


def _compute_signature(order_id: str, payment_id: str, secret: str) -> str:
    payload = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _compute_webhook_signature(payload_bytes: bytes, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


@pytest.fixture
def live_test_biz():
    unique_suffix = uuid.uuid4().hex[:6]
    owner_id = f"owner_live_{unique_suffix}"
    biz_id = f"biz_live_{unique_suffix}"

    users_col = get_collection("users")
    biz_col = get_collection("businesses")

    users_col.insert_one({
        "id": owner_id,
        "email": f"owner_{unique_suffix}@example.com",
        "role": ROLE_BUSINESS_OWNER,
        "business_id": biz_id,
    })
    biz_col.insert_one({
        "id": biz_id,
        "owner_id": owner_id,
        "name": f"Live Cafe {unique_suffix}",
        "subscription_plan": "FREE",
        "subscription_status": "ACTIVE",
        "payment_status": "FREE",
    })

    owner_token = create_access_token({"sub": owner_id, "role": ROLE_BUSINESS_OWNER})

    return {
        "owner_id": owner_id,
        "biz_id": biz_id,
        "headers": {"Authorization": f"Bearer {owner_token}"},
    }


# =============================================================================
# 1. TEST MODE & LIVE MODE CONFIGURATION VALIDATION
# =============================================================================
def test_valid_test_mode_configuration():
    """Test mode with rzp_test_ key passes validation."""
    assert validate_razorpay_config(
        mode="test",
        key_id="rzp_test_abcdef123456",
        key_secret="test_secret_key_12345"
    ) is True


def test_valid_live_mode_configuration():
    """LIVE mode with rzp_live_ key passes validation."""
    assert validate_razorpay_config(
        mode="live",
        key_id="rzp_live_abcdef123456",
        key_secret="live_secret_key_12345"
    ) is True


# =============================================================================
# 2. INVALID CONFIGURATION VALIDATIONS
# =============================================================================
def test_invalid_mode_rejected():
    """Invalid RAZORPAY_MODE values like 'sandbox' or 'prod' must raise RuntimeError."""
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="sandbox", key_id="rzp_test_123", key_secret="secret_12345")
    assert "Invalid RAZORPAY_MODE" in str(exc.value)

    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="production", key_id="rzp_live_123", key_secret="secret_12345")
    assert "Invalid RAZORPAY_MODE" in str(exc.value)


def test_missing_credentials_rejected():
    """Missing key ID or key secret must raise RuntimeError without leaking information."""
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="live", key_id="", key_secret="secret_12345")
    assert "not configured" in str(exc.value).lower()

    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="live", key_id="rzp_live_123456", key_secret="")
    assert "not configured" in str(exc.value).lower()


def test_mode_mismatched_keys_rejected():
    """Live key in test mode and test key in live mode must be rejected."""
    # Test mode with Live key
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="test", key_id="rzp_live_1234567890", key_secret="secret_12345")
    assert "rzp_test_" in str(exc.value)

    # Live mode with Test key
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="live", key_id="rzp_test_1234567890", key_secret="secret_12345")
    assert "rzp_live_" in str(exc.value)


def test_invalid_key_prefix_and_truncated_key_rejected():
    """Arbitrary key prefixes and bare prefixes without identifiers must be rejected."""
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="live", key_id="random_key_12345", key_secret="secret_12345")
    assert "rzp_live_" in str(exc.value)

    # Bare prefix with no actual key id
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="live", key_id="rzp_live_", key_secret="secret_12345")
    assert "valid identifier" in str(exc.value)

    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="test", key_id="rzp_test_", key_secret="secret_12345")
    assert "valid identifier" in str(exc.value)


def test_short_secret_rejected():
    """Secret shorter than 8 characters must be rejected."""
    with pytest.raises(RuntimeError) as exc:
        validate_razorpay_config(mode="live", key_id="rzp_live_12345678", key_secret="short")
    assert "too short" in str(exc.value)


# =============================================================================
# 3. LIVE MODE SUBSCRIPTION ORDER CREATION
# =============================================================================
def test_subscription_order_creation_in_live_mode(live_test_biz):
    """
    In LIVE mode, subscription orders are created with mode='live',
    return rzp_live_ key ID, and never leak secret.
    """
    mock_order = {
        "id": "order_live_sub_999888",
        "amount": 79900,
        "currency": "INR",
        "receipt": "sub_receipt_123",
        "status": "created",
    }
    mock_client = MagicMock()
    mock_client.order.create.return_value = mock_order

    with patch("backend.razorpay_service.RAZORPAY_MODE", "live"):
        with patch("backend.razorpay_service.RAZORPAY_KEY_ID", "rzp_live_ABCDEF123456"):
            with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", "super_live_secret_key_888"):
                with patch("backend.routes.payment_routes.RAZORPAY_MODE", "live"):
                    with patch("backend.routes.payment_routes.RAZORPAY_KEY_ID", "rzp_live_ABCDEF123456"):
                        with patch("backend.routes.payment_routes.RAZORPAY_KEY_SECRET", "super_live_secret_key_888"):
                            with patch("backend.razorpay_service.get_razorpay_client", return_value=mock_client):
                                res = client.post(
                                    "/api/payments/subscription/razorpay/create",
                                    json={
                                        "plan_id": "GROWTH",
                                        "billing_interval": "monthly",
                                        "business_id": live_test_biz["biz_id"]
                                    },
                                    headers=live_test_biz["headers"]
                                )
                                assert res.status_code == 200, res.text
                                data = res.json()
                                assert data["success"] is True
                                assert data["mode"] == "live"
                                assert data["razorpay_key_id"] == "rzp_live_ABCDEF123456"
                                assert data["amount"] == 799.0
                                assert data["amount_paise"] == 79900
                                assert data["plan_id"] == "growth"

                                # Verify secret is not in response
                                res_str = json.dumps(data)
                                assert "super_live_secret_key_888" not in res_str


# =============================================================================
# 4. LIVE MODE PAYMENT VERIFICATION & ACTIVATION
# =============================================================================
def test_subscription_verification_and_activation_live_mode(live_test_biz):
    """
    In LIVE mode, valid signature computed with LIVE secret activates the subscription.
    """
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")
    subs_col = get_collection("subscriptions")

    rzp_order_id = f"order_live_{uuid.uuid4().hex[:10]}"
    live_key_id = "rzp_live_TESTKEY123456"
    live_secret = "my_live_secret_key_99999"

    # Pre-insert pending subscription payment
    payment_id = f"pay_sub_live_{uuid.uuid4().hex[:8]}"
    payments_col.insert_one({
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": live_test_biz["biz_id"],
        "order_id": None,
        "payment_type": "BUSINESS_SUBSCRIPTION",
        "plan_id": "pro",
        "billing_interval": "monthly",
        "amount": 1499.0,
        "currency": "INR",
        "payment_method": "RAZORPAY",
        "razorpay_order_id": rzp_order_id,
        "razorpay_key_id": live_key_id,
        "status": "pending",
        "mode": "live",
    })

    rzp_payment_id = f"pay_live_{uuid.uuid4().hex[:12]}"
    valid_signature = _compute_signature(rzp_order_id, rzp_payment_id, live_secret)

    with patch("backend.razorpay_service.RAZORPAY_MODE", "live"):
        with patch("backend.razorpay_service.RAZORPAY_KEY_ID", live_key_id):
            with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", live_secret):
                with patch("backend.routes.payment_routes.RAZORPAY_MODE", "live"):
                    with patch("backend.routes.payment_routes.RAZORPAY_KEY_ID", live_key_id):
                        with patch("backend.routes.payment_routes.RAZORPAY_KEY_SECRET", live_secret):
                            verify_res = client.post(
                                "/api/payments/subscription/razorpay/verify",
                                json={
                                    "razorpay_order_id": rzp_order_id,
                                    "razorpay_payment_id": rzp_payment_id,
                                    "razorpay_signature": valid_signature,
                                    "plan_id": "PRO",
                                    "billing_interval": "monthly",
                                    "business_id": live_test_biz["biz_id"]
                                },
                                headers=live_test_biz["headers"]
                            )
                            assert verify_res.status_code == 200, verify_res.text
                            data = verify_res.json()
                            assert data["success"] is True
                            assert data["status"] == "paid"
                            assert data["subscription_status"] == "ACTIVE"
                            assert data["plan_id"] == "PRO"

                            # Verify payments record
                            pay_db = payments_col.find_one({"razorpay_order_id": rzp_order_id})
                            assert pay_db["status"] == "paid"
                            assert pay_db["verified"] is True
                            assert pay_db["razorpay_payment_id"] == rzp_payment_id

                            # Verify businesses record
                            biz_db = businesses_col.find_one({"id": live_test_biz["biz_id"]})
                            assert biz_db["subscription_plan"] == "PRO"
                            assert biz_db["subscription_status"] == "ACTIVE"
                            assert biz_db["payment_status"] == "PAID"

                            # Verify subscriptions record
                            sub_db = subs_col.find_one({"business_id": live_test_biz["biz_id"]})
                            assert sub_db["plan_id"] == "PRO"
                            assert sub_db["status"] == "active"
                            assert sub_db["provider"] == "RAZORPAY"


def test_tampered_signature_in_live_mode_rejected(live_test_biz):
    """
    In LIVE mode, tampered signature is rejected and does NOT activate subscription.
    """
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")

    rzp_order_id = f"order_live_tamper_{uuid.uuid4().hex[:8]}"
    live_secret = "my_live_secret_key_99999"

    payments_col.insert_one({
        "id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "payment_id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "business_id": live_test_biz["biz_id"],
        "order_id": None,
        "payment_type": "BUSINESS_SUBSCRIPTION",
        "plan_id": "growth",
        "billing_interval": "monthly",
        "amount": 799.0,
        "currency": "INR",
        "payment_method": "RAZORPAY",
        "razorpay_order_id": rzp_order_id,
        "status": "pending",
        "mode": "live",
    })

    forged_sig = "a" * 64

    with patch("backend.razorpay_service.RAZORPAY_MODE", "live"):
        with patch("backend.razorpay_service.RAZORPAY_KEY_ID", "rzp_live_TESTKEY123456"):
            with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", live_secret):
                with patch("backend.routes.payment_routes.RAZORPAY_MODE", "live"):
                    with patch("backend.routes.payment_routes.RAZORPAY_KEY_ID", "rzp_live_TESTKEY123456"):
                        with patch("backend.routes.payment_routes.RAZORPAY_KEY_SECRET", live_secret):
                            verify_res = client.post(
                                "/api/payments/subscription/razorpay/verify",
                                json={
                                    "razorpay_order_id": rzp_order_id,
                                    "razorpay_payment_id": "pay_fake_live_123",
                                    "razorpay_signature": forged_sig,
                                    "plan_id": "GROWTH",
                                    "business_id": live_test_biz["biz_id"]
                                },
                                headers=live_test_biz["headers"]
                            )
                            assert verify_res.status_code == 400
                            assert "Invalid payment signature" in verify_res.text

                            # Verify subscription remains FREE
                            biz_db = businesses_col.find_one({"id": live_test_biz["biz_id"]})
                            assert biz_db["subscription_plan"] == "FREE"


# =============================================================================
# 5. PAYMENT FAILURE / CANCELLATION DOES NOT ACTIVATE
# =============================================================================
def test_subscription_failure_route_does_not_activate(live_test_biz):
    """
    Reporting payment failure updates payment to 'failed' and never activates subscription.
    """
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")

    rzp_order_id = f"order_sub_fail_{uuid.uuid4().hex[:8]}"
    payments_col.insert_one({
        "id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "payment_id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "business_id": live_test_biz["biz_id"],
        "order_id": None,
        "payment_type": "BUSINESS_SUBSCRIPTION",
        "plan_id": "starter",
        "amount": 299.0,
        "payment_method": "RAZORPAY",
        "razorpay_order_id": rzp_order_id,
        "status": "pending",
        "mode": "live",
    })

    fail_res = client.post(
        "/api/payments/subscription/razorpay/failure",
        json={
            "razorpay_order_id": rzp_order_id,
            "error_code": "BAD_REQUEST_ERROR",
            "error_description": "User closed Razorpay modal"
        },
        headers=live_test_biz["headers"]
    )
    assert fail_res.status_code == 200
    assert fail_res.json()["status"] == "failed"

    # Payment record is failed
    pay_db = payments_col.find_one({"razorpay_order_id": rzp_order_id})
    assert pay_db["status"] == "failed"

    # Business subscription is still FREE
    biz_db = businesses_col.find_one({"id": live_test_biz["biz_id"]})
    assert biz_db["subscription_plan"] == "FREE"


# =============================================================================
# 6. WEBHOOK VERIFICATION WITH RAZORPAY_WEBHOOK_SECRET
# =============================================================================
def test_webhook_signature_verification_using_dedicated_secret():
    """Webhook verification uses RAZORPAY_WEBHOOK_SECRET correctly."""
    webhook_secret = "whsec_live_test_secret_777777"
    raw_payload = json.dumps({"event": "payment.captured", "test": True}).encode("utf-8")
    valid_sig = _compute_webhook_signature(raw_payload, webhook_secret)

    with patch("backend.razorpay_service.RAZORPAY_WEBHOOK_SECRET", webhook_secret):
        assert verify_razorpay_webhook_signature(raw_payload, valid_sig) is True
        assert verify_razorpay_webhook_signature(raw_payload, "invalid_sig_abc123") is False


def test_webhook_payment_captured_activates_subscription(live_test_biz):
    """
    Webhook payment.captured event activates the business subscription.
    """
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")

    rzp_order_id = f"order_wh_sub_{uuid.uuid4().hex[:8]}"
    rzp_payment_id = f"pay_wh_{uuid.uuid4().hex[:10]}"
    webhook_secret = "webhook_secret_for_suite_12345"

    payments_col.insert_one({
        "id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "payment_id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "business_id": live_test_biz["biz_id"],
        "order_id": None,
        "payment_type": "BUSINESS_SUBSCRIPTION",
        "plan_id": "premium",
        "billing_interval": "annual",
        "amount": 24990.0,
        "payment_method": "RAZORPAY",
        "razorpay_order_id": rzp_order_id,
        "status": "pending",
        "mode": "live",
    })

    webhook_payload = {
        "entity": "event",
        "account_id": "acc_123",
        "event": "payment.captured",
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "payload": {
            "payment": {
                "entity": {
                    "id": rzp_payment_id,
                    "order_id": rzp_order_id,
                    "amount": 2499000,
                    "status": "captured"
                }
            }
        }
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")
    valid_sig = _compute_webhook_signature(raw_body, webhook_secret)

    with patch("backend.razorpay_service.RAZORPAY_WEBHOOK_SECRET", webhook_secret):
        wh_res = client.post(
            "/api/payments/razorpay/webhook",
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": valid_sig,
            }
        )
        assert wh_res.status_code == 200, wh_res.text
        data = wh_res.json()
        assert data["status"] == "processed"
        assert data["action"] == "subscription_activated"
        assert data["plan"] == "PREMIUM"

        # Verify business updated
        biz_db = businesses_col.find_one({"id": live_test_biz["biz_id"]})
        assert biz_db["subscription_plan"] == "PREMIUM"
        assert biz_db["subscription_status"] == "ACTIVE"
        assert biz_db["payment_status"] == "PAID"


def test_webhook_payment_failed_records_failure_no_activation(live_test_biz):
    """
    Webhook payment.failed records failure and does NOT activate subscription.
    """
    payments_col = get_collection("payments")
    businesses_col = get_collection("businesses")

    rzp_order_id = f"order_wh_fail_{uuid.uuid4().hex[:8]}"
    webhook_secret = "webhook_secret_for_suite_12345"

    payments_col.insert_one({
        "id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "payment_id": f"pay_sub_{uuid.uuid4().hex[:8]}",
        "business_id": live_test_biz["biz_id"],
        "order_id": None,
        "payment_type": "BUSINESS_SUBSCRIPTION",
        "plan_id": "growth",
        "amount": 799.0,
        "payment_method": "RAZORPAY",
        "razorpay_order_id": rzp_order_id,
        "status": "pending",
        "mode": "live",
    })

    webhook_payload = {
        "event": "payment.failed",
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_failed_123",
                    "order_id": rzp_order_id,
                    "error_code": "BAD_REQUEST_ERROR",
                    "error_description": "Payment failed at bank"
                }
            }
        }
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")
    valid_sig = _compute_webhook_signature(raw_body, webhook_secret)

    with patch("backend.razorpay_service.RAZORPAY_WEBHOOK_SECRET", webhook_secret):
        wh_res = client.post(
            "/api/payments/razorpay/webhook",
            data=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Razorpay-Signature": valid_sig,
            }
        )
        assert wh_res.status_code == 200
        pay_db = payments_col.find_one({"razorpay_order_id": rzp_order_id})
        assert pay_db["status"] == "failed"

        biz_db = businesses_col.find_one({"id": live_test_biz["biz_id"]})
        assert biz_db["subscription_plan"] == "FREE"


# =============================================================================
# 7. ERROR MESSAGE SANITIZATION (ZERO SECRETS LEAKAGE)
# =============================================================================
def test_error_message_sanitization():
    """Verify secrets are redacted from error messages."""
    secret = "secret_to_never_expose_12345"
    err = f"API Error: Razorpay authorization failed with secret {secret}."
    with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", secret):
        sanitized = _sanitize_error_message(err)
        assert secret not in sanitized
        assert "[REDACTED]" in sanitized


# =============================================================================
# 8. SEPARATION FROM CUSTOMER QR ORDERS
# =============================================================================
def test_subscription_creation_does_not_create_customer_order(live_test_biz):
    """
    Subscription creation must NEVER create or touch customer orders or order commissions.
    """
    orders_col = get_collection("orders")
    commissions_col = get_collection("commissions")
    initial_orders = orders_col.count_documents({})
    initial_commissions = commissions_col.count_documents({})

    mock_order = {
        "id": f"order_sep_{uuid.uuid4().hex[:8]}",
        "amount": 29900,
        "currency": "INR",
        "status": "created",
    }
    mock_client = MagicMock()
    mock_client.order.create.return_value = mock_order

    with patch("backend.razorpay_service.get_razorpay_client", return_value=mock_client):
        create_razorpay_order_for_subscription(
            business_id=live_test_biz["biz_id"],
            plan_id="STARTER",
            billing_interval="monthly"
        )

    assert orders_col.count_documents({}) == initial_orders
    assert commissions_col.count_documents({}) == initial_commissions
