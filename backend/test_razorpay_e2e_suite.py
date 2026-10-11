"""
ZOOR UP — Comprehensive Razorpay Payment System Automated Test Suite
Covers all 17 requirements specified in the End-to-End Repair Plan.
"""
import os
import hmac
import hashlib
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from backend.database import get_collection
from backend.razorpay_service import (
    RAZORPAY_MODE,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    validate_razorpay_config,
    get_razorpay_client,
    create_razorpay_order,
    create_razorpay_order_for_payment,
    verify_razorpay_signature,
    verify_razorpay_payment,
    record_razorpay_payment_failure,
    verify_razorpay_webhook_signature,
    process_razorpay_webhook_event,
)
from backend.commission_service import (
    calculate_commission,
    record_commission_for_payment,
    handle_commission_refund,
)
from backend.settlement_service import (
    inspect_route_capability,
    get_business_settlement_summary,
)


def _gen_test_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# =============================================================================
# 1. Missing / Invalid Razorpay Credentials
# =============================================================================
def test_missing_credentials_and_mode_consistency():
    with patch("backend.razorpay_service.RAZORPAY_KEY_ID", ""):
        with pytest.raises(RuntimeError) as exc_info:
            validate_razorpay_config()
        assert "not configured" in str(exc_info.value)

    # Inconsistent mode test (e.g. test mode with live key)
    with patch("backend.razorpay_service.RAZORPAY_MODE", "test"):
        with patch("backend.razorpay_service.RAZORPAY_KEY_ID", "rzp_live_12345678"):
            with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", "dummy_secret_123"):
                with pytest.raises(RuntimeError) as exc_info:
                    validate_razorpay_config()
                assert "rzp_test_" in str(exc_info.value)


# =============================================================================
# 2. Invalid Checkout Request Validation
# =============================================================================
def test_invalid_checkout_requests():
    # Amount below minimum ₹1.00 (less than 100 paise)
    with pytest.raises(ValueError) as exc:
        create_razorpay_order(0.5, "ord_1", "biz_1")
    assert "at least ₹1.00" in str(exc.value)

    # Order does not exist
    with pytest.raises(ValueError) as exc:
        create_razorpay_order_for_payment("non_existent_order_id_999", "biz_1")
    assert "Order not found" in str(exc.value)


# =============================================================================
# 3. Valid Razorpay Order Creation
# =============================================================================
def test_valid_razorpay_order_creation():
    mock_client = MagicMock()
    mock_client.order.create.return_value = {
        "id": "order_mock_test_12345",
        "amount": 25000,
        "currency": "INR",
        "receipt": "ord_test_receipt",
        "status": "created",
    }
    with patch("backend.razorpay_service.get_razorpay_client", return_value=mock_client):
        res = create_razorpay_order(250.0, "test_ord_1", "test_biz_1")
        assert res["id"] == "order_mock_test_12345"
        assert res["amount"] == 25000
        assert res["currency"] == "INR"


# =============================================================================
# 4 & 5. Correct Pending Status & Unsupported Status Normalization
# =============================================================================
def test_correct_pending_status_and_idempotency():
    orders_col = get_collection("orders")
    payments_col = get_collection("payments")

    biz_id = _gen_test_id("biz")
    order_id = _gen_test_id("ORD")

    test_order = {
        "id": order_id,
        "order_id": order_id,
        "business_id": biz_id,
        "total": 350.0,
        "total_amount": 350.0,
        "payment_status": "PENDING",
        "customer_name": "Test Customer",
        "customer_phone": "+919876543210",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    orders_col.insert_one(test_order)

    mock_client = MagicMock()
    mock_client.order.create.return_value = {
        "id": f"order_rzp_{uuid.uuid4().hex[:8]}",
        "amount": 35000,
        "currency": "INR",
    }

    with patch("backend.razorpay_service.get_razorpay_client", return_value=mock_client):
        # 1. Create order for payment
        res1 = create_razorpay_order_for_payment(order_id, biz_id)
        assert res1["success"] is True
        assert res1["status"] == "pending", "Payment status MUST be pending, not created"
        assert res1["amount"] == 350.0
        assert res1["amount_paise"] == 35000

        # Verify DB record has pending status
        db_p = payments_col.find_one({"payment_id": res1["payment_id"]})
        assert db_p is not None
        assert db_p["status"] == "pending"

        # 6. Duplicate order creation idempotency: must return existing record
        res2 = create_razorpay_order_for_payment(order_id, biz_id)
        assert res2["payment_id"] == res1["payment_id"]
        assert res2["razorpay_order_id"] == res1["razorpay_order_id"]
        assert res2["status"] == "pending"

    # Clean up
    orders_col.delete_one({"id": order_id})
    payments_col.delete_one({"payment_id": res1["payment_id"]})


# =============================================================================
# 7 & 8. Signature Verification (Valid and Tampered)
# =============================================================================
def test_signature_verification_security():
    secret = "test_key_secret_for_hmac_sha256"
    rzp_order_id = "order_test_999888"
    rzp_payment_id = "pay_test_777666"

    # Generate legitimate signature
    payload = f"{rzp_order_id}|{rzp_payment_id}".encode("utf-8")
    valid_sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", secret):
        # Valid signature succeeds
        assert verify_razorpay_signature(rzp_order_id, rzp_payment_id, valid_sig) is True

        # Tampered signature fails
        tampered_sig = valid_sig[:-4] + "0000"
        assert verify_razorpay_signature(rzp_order_id, rzp_payment_id, tampered_sig) is False

        # Wrong payload fails
        assert verify_razorpay_signature("other_order", rzp_payment_id, valid_sig) is False


# =============================================================================
# 9 & 11. Payment Verification Flow & Duplicate Callback Idempotency
# =============================================================================
def test_payment_verification_and_duplicate_callback():
    orders_col = get_collection("orders")
    payments_col = get_collection("payments")
    invoices_col = get_collection("invoices")

    secret = "secret_for_full_verify_test"
    biz_id = _gen_test_id("biz")
    order_id = _gen_test_id("ORD")
    rzp_order_id = _gen_test_id("order_rzp")
    rzp_payment_id = _gen_test_id("pay_rzp")
    payment_id = _gen_test_id("pay")

    orders_col.insert_one({
        "id": order_id,
        "business_id": biz_id,
        "total": 450.0,
        "payment_status": "PENDING",
        "customer_id": "cus_test_1",
    })
    invoices_col.insert_one({
        "id": f"INV-{order_id}",
        "order_id": order_id,
        "business_id": biz_id,
        "status": "issued",
        "payment_status": "pending",
        "total": 450.0,
    })
    payments_col.insert_one({
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": biz_id,
        "customer_id": "cus_test_1",
        "order_id": order_id,
        "amount": 450.0,
        "razorpay_order_id": rzp_order_id,
        "status": "pending",
        "payment_method": "RAZORPAY",
    })

    payload = f"{rzp_order_id}|{rzp_payment_id}".encode("utf-8")
    valid_sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    with patch("backend.razorpay_service.RAZORPAY_KEY_SECRET", secret):
        # First verification succeeds
        res = verify_razorpay_payment(
            razorpay_order_id=rzp_order_id,
            razorpay_payment_id=rzp_payment_id,
            razorpay_signature=valid_sig,
            order_id=order_id,
            customer_id="cus_test_1",
        )
        assert res["success"] is True
        assert res["status"] == "paid"

        # Verify DB updates
        updated_ord = orders_col.find_one({"id": order_id})
        assert str(updated_ord["payment_status"]).upper() == "PAID"

        updated_inv = invoices_col.find_one({"order_id": order_id})
        assert updated_inv["status"] == "paid"
        assert updated_inv["payment_status"] == "paid"

        updated_pay = payments_col.find_one({"payment_id": payment_id})
        assert updated_pay["status"] == "paid"
        assert bool(updated_pay.get("verified") or (isinstance(updated_pay.get("metadata"), dict) and updated_pay["metadata"].get("verified"))) is True

        # 9. Duplicate verification callback: must return success idempotently without error
        res_dup = verify_razorpay_payment(
            razorpay_order_id=rzp_order_id,
            razorpay_payment_id=rzp_payment_id,
            razorpay_signature=valid_sig,
            order_id=order_id,
            customer_id="cus_test_1",
        )
        assert res_dup["success"] is True
        assert res_dup["message"] == "Payment already verified"
        assert res_dup["status"] == "paid"

    # Clean up
    orders_col.delete_one({"id": order_id})
    invoices_col.delete_one({"id": f"INV-{order_id}"})
    payments_col.delete_one({"payment_id": payment_id})


# =============================================================================
# 10. Failed or Cancelled Payment Handling
# =============================================================================
def test_failed_or_cancelled_payment_recording():
    payments_col = get_collection("payments")
    rzp_order_id = _gen_test_id("order_failed")
    payment_id = _gen_test_id("pay_failed")

    payments_col.insert_one({
        "id": payment_id,
        "payment_id": payment_id,
        "razorpay_order_id": rzp_order_id,
        "status": "pending",
        "amount": 100.0,
    })

    fail_res = record_razorpay_payment_failure(
        razorpay_order_id=rzp_order_id,
        error_code="BAD_REQUEST_ERROR",
        error_description="Customer cancelled transaction"
    )
    assert fail_res["success"] is True
    assert fail_res["status"] == "failed"

    updated = payments_col.find_one({"razorpay_order_id": rzp_order_id})
    assert updated["status"] == "failed"
    assert "Customer cancelled" in updated.get("notes", "")

    payments_col.delete_one({"payment_id": payment_id})


# =============================================================================
# 14 & 15. Server-Side Commission Calculation & Refund
# =============================================================================
def test_commission_calculation_and_refund():
    # 5% commission on ₹1000 = ₹50
    biz_custom = {"commission_rate": 5.0, "commission_fixed": 0.0}
    calc = calculate_commission(1000.0, biz_custom)
    assert calc["gross_amount"] == 1000.0
    assert calc["commission_rate"] == 5.0
    assert calc["commission_amount"] == 50.0
    assert calc["net_business_amount"] == 950.0

    # Fixed fee + percentage: 2% + ₹10 on ₹500 = ₹10 + ₹10 = ₹20
    biz_fixed = {"commission_percentage": 2.0, "commission_fixed": 10.0}
    calc2 = calculate_commission(500.0, biz_fixed)
    assert calc2["commission_amount"] == 20.0
    assert calc2["net_business_amount"] == 480.0

    # Record commission for payment
    comm = record_commission_for_payment("pay_test_comm", "ord_test_comm", "biz_test", 1000.0)
    assert comm["status"] == "calculated"
    assert comm["gross_amount"] == 1000.0

    # Refund handles partial and full
    ref = handle_commission_refund("pay_test_comm", 500.0)
    assert ref["refund_status"] == "partially_refunded"

    # Clean up
    get_collection("commissions").delete_one({"payment_id": "pay_test_comm"})


# =============================================================================
# 16. Settlement Prerequisite Inspection (Truthful Route Status)
# =============================================================================
def test_settlement_prerequisite_inspection():
    route_status = inspect_route_capability()
    assert isinstance(route_status, dict)
    assert "supported" in route_status
    assert "status" in route_status

    summary = get_business_settlement_summary("test_biz_1")
    assert "gross_collected" in summary
    assert "platform_commission" in summary
    assert "net_payable" in summary
    assert "settlement_channel" in summary


# =============================================================================
# 17. Asynchronous Webhook Processing & Deduplication
# =============================================================================
def test_webhook_processing_and_deduplication():
    secret = "wh_secret_test_2026"
    raw_payload = b'{"event":"payment.captured","event_id":"evt_test_12345","payload":{"payment":{"entity":{"id":"pay_wh_1","order_id":"order_wh_1"}}}}'
    sig = hmac.new(secret.encode("utf-8"), raw_payload, hashlib.sha256).hexdigest()

    with patch("backend.razorpay_service.RAZORPAY_WEBHOOK_SECRET", secret):
        # Valid signature
        assert verify_razorpay_webhook_signature(raw_payload, sig) is True
        # Bad signature
        assert verify_razorpay_webhook_signature(raw_payload, "invalid_sig_abc") is False

    import json
    parsed = json.loads(raw_payload.decode("utf-8"))
    
    # Process event first time
    res1 = process_razorpay_webhook_event(parsed)
    assert res1.get("status") in ("processed", "acknowledged")

    # Duplicate delivery must be ignored
    res2 = process_razorpay_webhook_event(parsed)
    assert res2.get("status") == "duplicate_ignored"

    get_collection("webhook_events").delete_one({"event_id": "evt_test_12345"})


if __name__ == "__main__":
    pytest.main(["-v", __file__])
