"""
Test Suite: Customer Loyalty Card Error Resilience & Concurrency
Verifies:
1. Successful loyalty-card loading for connected customer.
2. Customer with no existing loyalty record (initializes safely without crashing).
3. Temporary backend/resource failure (Errno 11 / EAGAIN triggers 503 with friendly message).
4. Database timeout or connection failure handling without exposing raw tracebacks.
5. Correct customer and business isolation (unconnected customer receives 403 Forbidden).
6. Retry behavior (SupabaseCollection retries on transient socket/connection errors).
7. Existing customer loyalty points and stamps remain unchanged.
"""
import sys
import os
import time
import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DEV_OTP"] = "true"
os.environ["ENVIRONMENT"] = "development"

from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection
from backend.supabase_database import SupabaseCollection, SupabaseDatabaseError

client = TestClient(app, raise_server_exceptions=False)
test_results = {}

def report(name, passed, extra=""):
    test_results[name] = passed
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} {extra}")

def run_tests():
    print("=== STARTING LOYALTY CARD ERROR RESILIENCE TEST SUITE ===")
    ts = uuid.uuid4().hex[:6]

    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    cust_col = get_collection("customers")
    cb_col = get_collection("customer_businesses")
    loyalty_col = get_collection("loyalty")

    # 1. Setup Test Business
    biz_id = f"biz_loyal_{ts}"
    owner_id = f"usr_owner_{ts}"
    biz_col.insert_one({
        "id": biz_id,
        "name": f"Loyalty Test Store {ts}",
        "slug": f"loyalty-store-{ts}",
        "owner_id": owner_id,
        "status": "ACTIVE",
        "stamps_required": 10,
        "reward_description": "Free Cappuccino",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Setup Customer 1 (Connected, has points & stamps)
    c1_user_id = f"usr_loyal1_{ts}"
    c1_cust_id = f"ZUP-CUS-LY1-{ts.upper()}"
    c1_token = create_access_token({"sub": c1_user_id, "id": c1_user_id, "customer_id": c1_cust_id, "role": "customer", "email": f"c1_{ts}@test.com"})
    c1_headers = {"Authorization": f"Bearer {c1_token}"}

    users_col.insert_one({"id": c1_user_id, "role": "customer", "customer_id": c1_cust_id, "name": f"Charlie {ts}", "email": f"c1_{ts}@test.com"})
    cust_col.insert_one({
        "id": c1_user_id,
        "user_id": c1_user_id,
        "customer_id": c1_cust_id,
        "name": f"Charlie {ts}",
        "email": f"c1_{ts}@test.com",
        "points": 450,
        "stamps": 4,
        "lifetime_points": 450,
        "status": "ACTIVE"
    })
    cb_col.insert_one({
        "id": f"cb_{ts}_1",
        "customer_id": c1_cust_id,
        "business_id": biz_id,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    loyalty_col.insert_one({
        "id": f"loyal_{ts}_1",
        "customer_id": c1_cust_id,
        "business_id": biz_id,
        "points": 450,
        "stamps": 4,
        "tier": "BASIC",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    })

    # Setup Customer 2 (Connected, but NO existing loyalty record)
    c2_user_id = f"usr_loyal2_{ts}"
    c2_cust_id = f"ZUP-CUS-LY2-{ts.upper()}"
    c2_token = create_access_token({"sub": c2_user_id, "id": c2_user_id, "customer_id": c2_cust_id, "role": "customer", "email": f"c2_{ts}@test.com"})
    c2_headers = {"Authorization": f"Bearer {c2_token}"}

    users_col.insert_one({"id": c2_user_id, "role": "customer", "customer_id": c2_cust_id, "name": f"David {ts}", "email": f"c2_{ts}@test.com"})
    cust_col.insert_one({
        "id": c2_user_id,
        "user_id": c2_user_id,
        "customer_id": c2_cust_id,
        "name": f"David {ts}",
        "email": f"c2_{ts}@test.com",
        "points": 0,
        "stamps": 0,
        "status": "ACTIVE"
    })
    cb_col.insert_one({
        "id": f"cb_{ts}_2",
        "customer_id": c2_cust_id,
        "business_id": biz_id,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Setup Customer 3 (Unconnected customer)
    c3_user_id = f"usr_loyal3_{ts}"
    c3_cust_id = f"ZUP-CUS-LY3-{ts.upper()}"
    c3_token = create_access_token({"sub": c3_user_id, "id": c3_user_id, "customer_id": c3_cust_id, "role": "customer", "email": f"c3_{ts}@test.com"})
    c3_headers = {"Authorization": f"Bearer {c3_token}"}

    users_col.insert_one({"id": c3_user_id, "role": "customer", "customer_id": c3_cust_id, "name": f"Eve {ts}", "email": f"c3_{ts}@test.com"})
    cust_col.insert_one({
        "id": c3_user_id,
        "user_id": c3_user_id,
        "customer_id": c3_cust_id,
        "name": f"Eve {ts}",
        "points": 0,
        "stamps": 0,
        "status": "ACTIVE"
    })

    # TEST 1: Successful Loyalty Card Loading
    res1 = client.get(f"/api/loyalty/{biz_id}", headers=c1_headers)
    passed1 = res1.status_code == 200 and res1.json().get("points") == 450 and res1.json().get("stamps") == 4
    report("1. Successful loyalty-card loading", passed1, f"(status={res1.status_code}, points={res1.json().get('points')})")

    # Also test get_customer_home for customer 1
    res1_home = client.get("/api/customer/home", headers=c1_headers)
    passed1_home = res1_home.status_code == 200 and len(res1_home.json().get("businesses", [])) >= 1
    report("1b. Customer Home loading with connected business", passed1_home, f"(status={res1_home.status_code})")

    # TEST 2: Customer with No Existing Loyalty Record (Graceful creation/fallback)
    res2 = client.get(f"/api/loyalty/{biz_id}", headers=c2_headers)
    passed2 = res2.status_code == 200 and res2.json().get("points") == 0 and res2.json().get("stamps") == 0
    report("2. Customer with no existing loyalty record initializes safely", passed2, f"(status={res2.status_code}, points={res2.json().get('points')})")

    # TEST 3: Temporary Backend / Resource Failure (Errno 11 -> 503 Service Unavailable)
    # Simulate an Errno 11 OSError in an endpoint to verify global exception handler returns 503
    def mock_errno11(*args, **kwargs):
        err = OSError(11, "Resource temporarily unavailable")
        raise err

    with patch("backend.routes.customer_routes.get_customer_profile", side_effect=mock_errno11):
        res3 = client.get(f"/api/loyalty/{biz_id}", headers=c1_headers)
        passed3 = (
            res3.status_code == 503
            and "temporarily unavailable" in res3.json().get("detail", "").lower()
            and "Errno 11" not in res3.json().get("detail", "")
            and res3.headers.get("Retry-After") == "2"
        )
        report("3. Errno 11 returns 503 with friendly message (no raw traceback)", passed3, f"(status={res3.status_code}, detail={res3.json().get('detail')})")

    # TEST 4: Database Timeout or Connection Failure Handling
    def mock_timeout(*args, **kwargs):
        raise TimeoutError("Connection to Supabase timed out")

    with patch("backend.routes.customer_routes.get_customer_profile", side_effect=mock_timeout):
        res4 = client.get(f"/api/loyalty/{biz_id}", headers=c1_headers)
        passed4 = (
            res4.status_code == 503
            and "temporarily unavailable" in res4.json().get("detail", "").lower()
        )
        report("4. Database timeout returns 503 without exposing raw error", passed4, f"(status={res4.status_code}, detail={res4.json().get('detail')})")

    # TEST 5: Customer and Business Isolation (Unconnected customer receives 403 Forbidden)
    res5 = client.get(f"/api/loyalty/{biz_id}", headers=c3_headers)
    passed5 = res5.status_code == 403 and "not connected" in res5.json().get("detail", "").lower()
    report("5. Correct customer and business isolation (403 for unconnected customer)", passed5, f"(status={res5.status_code})")

    # TEST 6: Retry Behavior in SupabaseCollection
    # Test _execute_with_retry: transient OSError(11) is retried before failing or succeeding
    attempt_counter = [0]
    def flaky_action():
        attempt_counter[0] += 1
        if attempt_counter[0] < 2:
            raise OSError(11, "Resource temporarily unavailable")
        mock_resp = MagicMock()
        mock_resp.data = [{"id": "test_id"}]
        return mock_resp

    test_col = SupabaseCollection(client=MagicMock(), collection_name="test_col", table_name="test_table")
    retry_result = test_col._execute_with_retry(flaky_action, max_retries=2)
    passed6 = attempt_counter[0] == 2 and retry_result.data == [{"id": "test_id"}]
    report("6. SupabaseCollection retry behavior succeeds on transient retry", passed6, f"(attempts={attempt_counter[0]})")

    # TEST 7: Existing Loyalty Points and Stamps Remain Unchanged
    # Verify Customer 1's points and stamps are exactly 450 and 4 as initialized
    loyalty_doc = loyalty_col.find_one({"customer_id": c1_cust_id, "business_id": biz_id})
    cust_doc = cust_col.find_one({"customer_id": c1_cust_id})
    passed7 = (
        loyalty_doc is not None
        and int(loyalty_doc.get("points", 0)) == 450
        and int(loyalty_doc.get("stamps", 0)) == 4
        and cust_doc is not None
        and int(cust_doc.get("points", 0)) == 450
        and int(cust_doc.get("stamps", 0)) == 4
    )
    report("7. Existing loyalty points and stamps preserved unchanged", passed7, f"(points={loyalty_doc.get('points') if loyalty_doc else None}, stamps={loyalty_doc.get('stamps') if loyalty_doc else None})")

    print("\n=== SUMMARY ===")
    total = len(test_results)
    passed = sum(1 for v in test_results.values() if v)
    print(f"Total: {total}, Passed: {passed}, Failed: {total - passed}")
    return passed == total

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
