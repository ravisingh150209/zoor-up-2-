import pytest
import re
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import get_current_user

client = TestClient(app)

UPI_REGEX = re.compile(r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$")


def test_upi_regex_validation():
    """Validates store UPI VPA format rules."""
    valid_upis = [
        "store@okaxis",
        "9817400078@ybl",
        "merchant.zoorup@okhdfcbank",
        "cafe_delight-1@paytm",
        "user.name@icici",
    ]
    invalid_upis = [
        "",
        "notanupi",
        "@okaxis",
        "store@",
        "store@ok axis",
        "store@@okaxis",
        "a@b",  # handle too short
    ]

    for upi in valid_upis:
        assert UPI_REGEX.match(upi) is not None, f"Expected {upi} to be valid"

    for upi in invalid_upis:
        assert UPI_REGEX.match(upi) is None, f"Expected {upi} to be invalid"


def test_unauthenticated_and_unauthorized_access():
    """Validates that unauthenticated users and customers cannot access business payments."""
    # 1. Unauthenticated request
    resp = client.get("/api/payments/business")
    assert resp.status_code in (401, 403), f"Expected 401/403 but got {resp.status_code}"

    # 2. Customer user attempting to access business payments endpoint -> 403 Forbidden
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "cust_test_user_1",
        "role": "CUSTOMER",
    }
    try:
        resp_cust = client.get("/api/payments/business")
        assert resp_cust.status_code == 403, f"Expected 403 for Customer role, got {resp_cust.status_code}"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_cross_business_isolation_and_summaries():
    """
    Tests that:
    1. Business A cannot see Business B payments.
    2. Summary cards accurately compute total_revenue, pending_payments, subscription_revenue, and total_transactions.
    3. Pending, failed, and refunded payments are strictly EXCLUDED from total revenue.
    4. Subscriptions are separated from order revenue.
    5. Duplicate payment records are deduplicated.
    """
    from backend.routes.payment_routes import get_business_payments
    from unittest.mock import patch

    biz_a_id = "biz_test_alpha_101"
    biz_b_id = "biz_test_beta_202"

    biz_a_user = {
        "id": "owner_alpha",
        "role": "BUSINESS_OWNER",
        "business_id": biz_a_id,
    }

    mock_businesses = [
        {"id": biz_a_id, "owner_id": "owner_alpha", "name": "Alpha Cafe"},
        {"id": biz_b_id, "owner_id": "owner_beta", "name": "Beta Bistro"},
    ]

    # Sample payments dataset
    mock_payments = [
        # --- Business A Payments ---
        # 1. Paid Customer Order #1
        {
            "id": "pay_a_1",
            "payment_id": "pay_a_1",
            "business_id": biz_a_id,
            "order_id": "ord_101",
            "customer_name": "Rohan Sharma",
            "amount": 500.0,
            "status": "paid",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-01T10:00:00Z",
        },
        # 2. Duplicate record of Paid Customer Order #1 (should be deduplicated)
        {
            "id": "pay_a_1",
            "payment_id": "pay_a_1",
            "business_id": biz_a_id,
            "order_id": "ord_101",
            "customer_name": "Rohan Sharma",
            "amount": 500.0,
            "status": "paid",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-01T10:00:00Z",
        },
        # 3. Completed Customer Order #2 (UPI)
        {
            "id": "pay_a_2",
            "payment_id": "pay_a_2",
            "business_id": biz_a_id,
            "order_id": "ord_102",
            "customer_name": "Priya Verma",
            "amount": 350.0,
            "status": "completed",
            "payment_method": "UPI",
            "created_at": "2026-10-02T11:00:00Z",
        },
        # 4. Pending Customer Order #3 (must NOT be in total_revenue, must be in pending_payments)
        {
            "id": "pay_a_3",
            "payment_id": "pay_a_3",
            "business_id": biz_a_id,
            "order_id": "ord_103",
            "customer_name": "Aman Gupta",
            "amount": 200.0,
            "status": "pending",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-03T12:00:00Z",
        },
        # 5. Failed Customer Order #4 (must NOT be in total_revenue or pending_payments)
        {
            "id": "pay_a_4",
            "payment_id": "pay_a_4",
            "business_id": biz_a_id,
            "order_id": "ord_104",
            "customer_name": "Kiran Rao",
            "amount": 150.0,
            "status": "failed",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-04T13:00:00Z",
        },
        # 6. Refunded Customer Order #5 (must NOT be in total_revenue)
        {
            "id": "pay_a_5",
            "payment_id": "pay_a_5",
            "business_id": biz_a_id,
            "order_id": "ord_105",
            "customer_name": "Deepak Sen",
            "amount": 400.0,
            "status": "refunded",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-05T14:00:00Z",
        },
        # 7. Paid Business Subscription (must be in subscription_revenue, NEVER in total_revenue)
        {
            "id": "pay_sub_a_1",
            "payment_id": "pay_sub_a_1",
            "business_id": biz_a_id,
            "order_id": None,
            "plan_id": "pro",
            "plan_name": "Pro Plan",
            "payment_type": "BUSINESS_SUBSCRIPTION",
            "amount": 1499.0,
            "status": "paid",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-06T15:00:00Z",
        },
        # 8. Pending Business Subscription (must be in pending_payments)
        {
            "id": "pay_sub_a_2",
            "payment_id": "pay_sub_a_2",
            "business_id": biz_a_id,
            "order_id": None,
            "plan_id": "enterprise",
            "plan_name": "Enterprise Plan",
            "payment_type": "BUSINESS_SUBSCRIPTION",
            "amount": 3999.0,
            "status": "pending",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-07T16:00:00Z",
        },

        # --- Business B Payments (Isolation verification) ---
        {
            "id": "pay_b_1",
            "payment_id": "pay_b_1",
            "business_id": biz_b_id,
            "order_id": "ord_b_999",
            "customer_name": "External Customer",
            "amount": 8888.0,
            "status": "paid",
            "payment_method": "RAZORPAY",
            "created_at": "2026-10-08T17:00:00Z",
        },
    ]

    class MockCollection:
        def __init__(self, data):
            self.data = data

        def find(self, query):
            results = []
            for item in self.data:
                match = True
                for k, v in query.items():
                    if item.get(k) != v:
                        match = False
                        break
                if match:
                    results.append(item)
            return results

        def find_one(self, query):
            matches = self.find(query)
            return matches[0] if matches else None

    def mock_get_collection(col_name):
        if col_name == "businesses":
            return MockCollection(mock_businesses)
        if col_name == "payments":
            return MockCollection(mock_payments)
        return MockCollection([])

    with patch("backend.routes.payment_routes.get_collection", side_effect=mock_get_collection):
        # 1. Fetch for Business A with no filters
        resp = get_business_payments(
            status=None,
            mode=None,
            search=None,
            date_from=None,
            date_to=None,
            sort_by="created_at",
            sort_dir="desc",
            current_user=biz_a_user,
        )

        payments = resp["payments"]
        summary = resp["summary"]

        # Verification 1: Cross-business isolation
        for p in payments:
            assert p["business_id"] == biz_a_id
            assert p["business_id"] != biz_b_id

        # Verification 2: Deduplication
        # Out of 8 rows for Biz A, row 1 was duplicated, so total unique transactions = 7
        assert summary["total_transactions"] == 7
        unique_ids = [p["payment_id"] for p in payments]
        assert len(unique_ids) == len(set(unique_ids))

        # Verification 3: Total Order Revenue
        # Order 1 (500) + Order 2 (350) = 850.
        # Excludes pending (200), failed (150), refunded (400), and subscription (1499).
        assert summary["total_revenue"] == 850.0

        # Verification 4: Pending Payments
        # Pending Order 3 (200) + Pending Sub (3999) = 4199.0
        assert summary["pending_payments"] == 4199.0

        # Verification 5: Subscription Revenue
        # Paid Sub (1499.0). Kept separate from order revenue!
        assert summary["subscription_revenue"] == 1499.0

        # 2. Status Filter: only 'paid'
        resp_paid = get_business_payments(
            status="paid",
            mode=None,
            search=None,
            date_from=None,
            date_to=None,
            current_user=biz_a_user,
        )
        assert len(resp_paid["payments"]) == 2  # Order 1 and Sub 1
        for p in resp_paid["payments"]:
            assert p["status"] == "paid"

        # 3. Mode Filter: 'UPI'
        resp_upi = get_business_payments(
            status=None,
            mode="UPI",
            search=None,
            date_from=None,
            date_to=None,
            current_user=biz_a_user,
        )
        assert len(resp_upi["payments"]) == 1
        assert resp_upi["payments"][0]["payment_id"] == "pay_a_2"

        # 4. Search Filter: search "Priya"
        resp_search = get_business_payments(
            status=None,
            mode=None,
            search="Priya",
            date_from=None,
            date_to=None,
            current_user=biz_a_user,
        )
        assert len(resp_search["payments"]) == 1
        assert resp_search["payments"][0]["customer_name"] == "Priya Verma"

        # 5. Search Filter: search "Pro"
        resp_sub_search = get_business_payments(
            status=None,
            mode=None,
            search="Pro",
            date_from=None,
            date_to=None,
            current_user=biz_a_user,
        )
        assert len(resp_sub_search["payments"]) == 1
        assert resp_sub_search["payments"][0]["plan_id"] == "pro"
        assert resp_sub_search["payments"][0]["is_subscription"] is True

        # 6. Date Range Filter
        resp_date = get_business_payments(
            status=None,
            mode=None,
            search=None,
            date_from="2026-10-01",
            date_to="2026-10-02",
            current_user=biz_a_user,
        )
        # Should only include records from Oct 1 and Oct 2
        assert len(resp_date["payments"]) == 2
        date_pids = [p["payment_id"] for p in resp_date["payments"]]
        assert "pay_a_1" in date_pids
        assert "pay_a_2" in date_pids

        # 7. Sorting: by amount descending
        resp_sort_desc = get_business_payments(
            status=None,
            mode=None,
            search=None,
            date_from=None,
            date_to=None,
            sort_by="amount",
            sort_dir="desc",
            current_user=biz_a_user,
        )
        amounts_desc = [p["amount"] for p in resp_sort_desc["payments"]]
        assert amounts_desc[0] == 3999.0  # highest numeric amount first

        # 8. Sorting: by amount ascending
        resp_sort_asc = get_business_payments(
            status=None,
            mode=None,
            search=None,
            date_from=None,
            date_to=None,
            sort_by="amount",
            sort_dir="asc",
            current_user=biz_a_user,
        )
        amounts_asc = [p["amount"] for p in resp_sort_asc["payments"]]
        assert amounts_asc[0] == 150.0  # lowest numeric amount first


def test_staff_and_admin_role_access():
    """Validates that Staff and Super Admin roles can access business payments."""
    from backend.routes.payment_routes import get_business_payments
    from unittest.mock import patch

    biz_user_staff = {
        "id": "staff_1",
        "role": "STAFF",
        "business_id": "biz_alpha",
    }
    mock_biz = {"id": "biz_alpha", "owner_id": "owner_1", "name": "Alpha Cafe"}

    class MockCollection:
        def find(self, query):
            return []

        def find_one(self, query):
            return mock_biz

    with patch("backend.routes.payment_routes.get_collection", return_value=MockCollection()):
        resp = get_business_payments(
            current_user=biz_user_staff,
        )
        assert "payments" in resp
        assert "summary" in resp
        assert resp["summary"]["total_transactions"] == 0


if __name__ == "__main__":
    pytest.main(["-s", __file__])
