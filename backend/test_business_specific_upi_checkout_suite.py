import pytest
import urllib.parse
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import get_current_user

client = TestClient(app)


def test_public_business_upi_resolution():
    """
    Validates that:
    1. A business with configured UPI returns its exact saved UPI VPA and name.
    2. A business without configured UPI returns upi_enabled=False.
    3. No hardcoded or cross-store fallback occurs.
    """
    from backend.routes.business_routes import get_public_store_upi
    from unittest.mock import patch

    biz_alpha = {
        "id": "biz_alpha_123",
        "name": "Alpha Gourmet",
        "upi_id": "alphagourmet@okaxis",
        "upi_name": "Alpha Gourmet Cafe",
        "upi_notes": "Pay Alpha Store",
        "upi_enabled": True,
    }
    biz_beta = {
        "id": "biz_beta_456",
        "name": "Beta Bakery",
        "upi_id": "",
        "upi_enabled": False,
    }

    class MockBizCollection:
        def find_one(self, query):
            bid = query.get("id") or query.get("slug")
            if bid == "biz_alpha_123":
                return biz_alpha
            if bid == "biz_beta_456":
                return biz_beta
            return None

    with patch("backend.routes.business_routes.get_collection", return_value=MockBizCollection()):
        # Store Alpha (Configured)
        res_a = get_public_store_upi("biz_alpha_123")
        assert res_a["success"] is True
        assert res_a["business_id"] == "biz_alpha_123"
        assert res_a["upi_id"] == "alphagourmet@okaxis"
        assert res_a["upi_name"] == "Alpha Gourmet Cafe"
        assert res_a["upi_enabled"] is True

        # Store Beta (Not configured)
        res_b = get_public_store_upi("biz_beta_456")
        assert res_b["success"] is True
        assert res_b["business_id"] == "biz_beta_456"
        assert res_b["upi_id"] == ""
        assert res_b["upi_enabled"] is False


def test_direct_upi_payment_creation_and_authoritative_amount():
    """
    Validates that:
    1. Direct UPI payment intent resolves the exact store UPI ID.
    2. The amount is authoritative from the database order.
    3. The generated UPI URI properly encodes payee address, name, amount, and reference.
    4. Payment status is initialized as 'pending'.
    5. Duplicate creation calls are idempotent and prevent duplicate payment records.
    """
    from backend.routes.payment_routes import create_direct_upi_payment, DirectUpiPaymentRequest
    from unittest.mock import patch, MagicMock

    biz_id = "biz_cafe_777"
    order_id = "ord_lunch_888"

    mock_biz = {
        "id": biz_id,
        "name": "Cafe Delight",
        "upi_id": "cafedelight@icici",
        "upi_name": "Cafe Delight Food",
        "upi_notes": "Lunch Order Payment",
        "upi_enabled": True,
    }

    mock_order = {
        "id": order_id,
        "order_id": order_id,
        "business_id": biz_id,
        "customer_id": "cust_rahul",
        "customer_user_id": "user_rahul",
        "total_amount": 745.50,
        "status": "NEW",
        "payment_status": "PENDING",
    }

    mock_payments_db = []

    class MockCollection:
        def __init__(self, data_list):
            self.data_list = data_list

        def find_one(self, query):
            for item in self.data_list:
                match = True
                for k, v in query.items():
                    if item.get(k) != v:
                        match = False
                        break
                if match:
                    return item
            return None

        def insert_one(self, doc):
            self.data_list.append(doc)
            return MagicMock(inserted_id=doc.get("id"))

    def mock_get_collection(col_name):
        if col_name == "businesses":
            return MockCollection([mock_biz])
        if col_name == "orders":
            return MockCollection([mock_order])
        if col_name == "customers":
            return MockCollection([{"user_id": "user_rahul", "customer_id": "cust_rahul"}])
        if col_name == "customer_businesses":
            return MockCollection([{"customer_id": "cust_rahul", "business_id": biz_id, "status": "active"}])
        if col_name == "payments":
            return MockCollection(mock_payments_db)
        return MockCollection([])

    req = DirectUpiPaymentRequest(
        business_id=biz_id,
        order_id=order_id,
        amount=1.0,  # Intentional client manipulation attempt: should be ignored in favor of order total 745.50
    )

    fake_request = MagicMock()
    fake_request.client.host = "127.0.0.1"

    current_user = {
        "id": "user_rahul",
        "role": "CUSTOMER",
    }

    with patch("backend.routes.payment_routes.get_collection", side_effect=mock_get_collection):
        res = create_direct_upi_payment(req, fake_request, current_user)

        assert res["success"] is True
        assert res["status"] == "pending"
        # Authoritative amount check
        assert res["amount"] == 745.50
        assert res["upi_id"] == "cafedelight@icici"

        # Verify safe UPI URI
        upi_uri = res["upi_uri"]
        assert upi_uri.startswith("upi://pay?")
        parsed_url = urllib.parse.urlparse(upi_uri)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        assert query_params["pa"][0] == "cafedelight@icici"
        assert query_params["pn"][0] == "Cafe Delight Food"
        assert query_params["am"][0] == "745.50"
        assert query_params["cu"][0] == "INR"
        assert query_params["tr"][0] == order_id

        # Verification: payment record exists in payments collection
        assert len(mock_payments_db) == 1
        assert mock_payments_db[0]["order_id"] == order_id
        assert mock_payments_db[0]["status"] == "pending"

        # Verification of Idempotency & Duplicate Prevention
        res_duplicate = create_direct_upi_payment(req, fake_request, current_user)
        assert res_duplicate["payment_id"] == res["payment_id"]
        assert len(mock_payments_db) == 1  # No duplicate record created!


def test_unconfigured_business_upi_rejected():
    """Validates that orders for a business without configured UPI cannot create UPI payment intent."""
    from backend.routes.payment_routes import create_direct_upi_payment, DirectUpiPaymentRequest
    from fastapi import HTTPException
    from unittest.mock import patch, MagicMock

    biz_id = "biz_no_upi"
    order_id = "ord_no_upi"

    mock_biz = {
        "id": biz_id,
        "name": "Cash Only Diner",
        "upi_id": "",
    }
    mock_order = {
        "id": order_id,
        "business_id": biz_id,
        "customer_id": "cust_1",
        "customer_user_id": "user_1",
        "total_amount": 250.0,
    }

    class MockCollection:
        def __init__(self, data):
            self.data = data
        def find_one(self, query):
            for d in self.data:
                if all(d.get(k) == v for k, v in query.items()):
                    return d
            return None

    def mock_get_col(name):
        if name == "businesses":
            return MockCollection([mock_biz])
        if name == "orders":
            return MockCollection([mock_order])
        if name == "customers":
            return MockCollection([{"user_id": "user_1", "customer_id": "cust_1"}])
        if name == "customer_businesses":
            return MockCollection([{"customer_id": "cust_1", "business_id": biz_id, "status": "active"}])
        return MockCollection([])

    req = DirectUpiPaymentRequest(business_id=biz_id, order_id=order_id)
    fake_req = MagicMock()
    fake_req.client.host = "127.0.0.1"

    with patch("backend.routes.payment_routes.get_collection", side_effect=mock_get_col):
        with pytest.raises(HTTPException) as exc_info:
            create_direct_upi_payment(req, fake_req, {"id": "user_1", "role": "CUSTOMER"})
        assert exc_info.value.status_code == 400
        assert "not configured UPI payments yet" in exc_info.value.detail


def test_cross_business_mismatch_rejected():
    """Validates that a customer cannot substitute another business's ID for an order."""
    from backend.routes.payment_routes import create_direct_upi_payment, DirectUpiPaymentRequest
    from fastapi import HTTPException
    from unittest.mock import patch, MagicMock

    order_id = "ord_legit_store_1"
    mock_order = {
        "id": order_id,
        "business_id": "store_actual_1",
        "customer_id": "cust_1",
        "customer_user_id": "user_1",
        "total_amount": 100.0,
    }

    class MockCollection:
        def __init__(self, data):
            self.data = data
        def find_one(self, query):
            return self.data[0] if self.data else None

    def mock_get_col(name):
        if name == "orders":
            return MockCollection([mock_order])
        if name == "customers":
            return MockCollection([{"user_id": "user_1", "customer_id": "cust_1"}])
        if name == "customer_businesses":
            return MockCollection([{"customer_id": "cust_1", "business_id": "store_fake_2", "status": "active"}])
        return MockCollection([])

    req = DirectUpiPaymentRequest(business_id="store_fake_2", order_id=order_id)
    fake_req = MagicMock()
    fake_req.client.host = "127.0.0.1"

    with patch("backend.routes.payment_routes.get_collection", side_effect=mock_get_col):
        with pytest.raises(HTTPException) as exc_info:
            create_direct_upi_payment(req, fake_req, {"id": "user_1", "role": "CUSTOMER"})
        assert exc_info.value.status_code == 400
        assert "Business ID does not match order" in exc_info.value.detail


def test_business_payment_reconciliation_and_confirmation():
    """
    Validates that:
    1. Orders remain pending until verified.
    2. Business owner can reconcile and mark order as PAID via /business/confirm.
    3. Unauthorized customer cannot call confirmation endpoint.
    """
    from backend.routes.payment_routes import confirm_business_payment, BusinessPaymentConfirmRequest
    from fastapi import HTTPException
    from unittest.mock import patch, MagicMock

    biz_id = "biz_diner_99"
    order_id = "ord_diner_99_1"
    payment_id = "pay_diner_99_1"

    mock_biz = {"id": biz_id, "owner_id": "owner_diner_99"}
    mock_order = {
        "id": order_id,
        "business_id": biz_id,
        "payment_status": "PENDING",
    }
    mock_payment = {
        "id": payment_id,
        "payment_id": payment_id,
        "business_id": biz_id,
        "order_id": order_id,
        "status": "pending",
        "verified": False,
    }

    class MockCollection:
        def __init__(self, data):
            self.data = data

        def find_one(self, query):
            for d in self.data:
                if all(d.get(k) == v for k, v in query.items()):
                    return d
            return None

        def update_one(self, query, update_spec):
            for d in self.data:
                if all(d.get(k) == v for k, v in query.items()):
                    d.update(update_spec.get("$set", {}))
                    return MagicMock(modified_count=1)
            return MagicMock(modified_count=0)

    orders_col = MockCollection([mock_order])
    payments_col = MockCollection([mock_payment])

    def mock_get_col(name):
        if name == "businesses":
            return MockCollection([mock_biz])
        if name == "orders":
            return orders_col
        if name == "payments":
            return payments_col
        if name == "invoices":
            return MockCollection([])
        return MockCollection([])

    req = BusinessPaymentConfirmRequest(
        order_id=order_id,
        payment_id=payment_id,
        reference_number="UTR1234567890",
        notes="Bank credit confirmed on phone",
    )

    # 1. Customer cannot call confirm
    with patch("backend.routes.payment_routes.get_collection", side_effect=mock_get_col):
        with pytest.raises(HTTPException) as exc_info:
            confirm_business_payment(req, {"id": "user_cust", "role": "CUSTOMER"})
        assert exc_info.value.status_code == 403

    # 2. Business owner can confirm
    with patch("backend.routes.payment_routes.get_collection", side_effect=mock_get_col):
        res = confirm_business_payment(req, {"id": "owner_diner_99", "role": "BUSINESS_OWNER"})
        assert res["success"] is True
        assert res["payment_status"] == "PAID"
        assert res["verified"] is True
        assert mock_order["payment_status"] == "PAID"
        assert mock_payment["status"] == "paid"
        assert mock_payment["verified"] is True
        assert mock_payment["bank_reference"] == "UTR1234567890"


def test_business_subscription_razorpay_preservation():
    """Validates that separate ZOOR UP business subscription flow is preserved."""
    from backend.routes.payment_routes import create_subscription_razorpay_order_route, SubscriptionRazorpayOrderRequest
    from unittest.mock import patch, MagicMock

    biz_id = "biz_sub_test"
    mock_biz = {"id": biz_id, "owner_id": "owner_sub_test"}

    class MockCollection:
        def find_one(self, query):
            return mock_biz

    req = SubscriptionRazorpayOrderRequest(plan_id="pro", billing_interval="monthly")
    fake_req = MagicMock()
    fake_req.client.host = "127.0.0.1"

    with patch("backend.routes.payment_routes.get_collection", return_value=MockCollection()):
        with patch("backend.routes.payment_routes.create_razorpay_order_for_subscription") as mock_create_sub:
            mock_create_sub.return_value = {
                "success": True,
                "razorpay_order_id": "order_sub_mock_123",
                "payment_id": "pay_sub_mock_123",
                "amount": 1499.0,
            }
            res = create_subscription_razorpay_order_route(
                req,
                fake_req,
                {"id": "owner_sub_test", "role": "BUSINESS_OWNER"}
            )
            assert res["success"] is True
            assert res["razorpay_order_id"] == "order_sub_mock_123"


if __name__ == "__main__":
    pytest.main(["-s", __file__])
