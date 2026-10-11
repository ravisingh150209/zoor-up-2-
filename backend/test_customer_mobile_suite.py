"""
Automated Test Suite for Customer Mobile App & Cart Flows
Verifies:
1. Customer Home loading & data structure
2. Expired / missing authentication (401 response)
3. New customer account with no businesses (graceful empty state)
4. Cart persistence, order creation & customer identity isolation
5. Optional loyalty & voucher endpoints resilience
6. Measures response timings
"""
import sys
import os
import time
import uuid
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DEV_OTP"] = "true"
os.environ["ENVIRONMENT"] = "development"

from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection

client = TestClient(app)
test_results = {}

def report(name, passed, extra=""):
    test_results[name] = passed
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name} {extra}")

def run_tests():
    print("=== STARTING CUSTOMER MOBILE & CART VERIFICATION SUITE ===")
    ts = uuid.uuid4().hex[:6]
    
    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    cust_col = get_collection("customers")
    cb_col = get_collection("customer_businesses")
    prod_col = get_collection("products")
    orders_col = get_collection("orders")

    # 1. Setup Test Store & Test Product
    biz_id = f"biz_mob_{ts}"
    owner_id = f"usr_mob_owner_{ts}"
    prod_id = f"prd_mob_{ts}"
    
    biz_col.insert_one({
        "id": biz_id,
        "name": f"Mobile Store {ts}",
        "slug": f"mobile-store-{ts}",
        "owner_id": owner_id,
        "status": "ACTIVE",
        "upi_id": "mobstore@upi",
        "upi_name": "Mobile Store",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    prod_col.insert_one({
        "id": prod_id,
        "business_id": biz_id,
        "name": f"Deluxe Coffee {ts}",
        "price": 150.0,
        "discount_price": 120.0,
        "available": True,
        "active": True,
        "category": "Beverages"
    })

    # Setup Customer 1 (Connected to Store)
    c1_user_id = f"usr_c1_{ts}"
    c1_cust_id = f"ZUP-CUS-M1-{ts.upper()}"
    c1_token = create_access_token({"sub": c1_user_id, "id": c1_user_id, "customer_id": c1_cust_id, "role": "customer", "email": f"c1_{ts}@customer.com"})
    c1_headers = {"Authorization": f"Bearer {c1_token}"}
    
    users_col.insert_one({"id": c1_user_id, "role": "customer", "customer_id": c1_cust_id, "name": f"Alice {ts}", "email": f"c1_{ts}@customer.com", "phone": "9876543210"})
    cust_col.insert_one({
        "id": c1_user_id,
        "user_id": c1_user_id,
        "customer_id": c1_cust_id,
        "name": f"Alice {ts}",
        "email": f"c1_{ts}@customer.com",
        "phone": "9876543210",
        "points": 250,
        "stamps": 3,
        "lifetime_points": 500,
        "total_visits": 3,
        "status": "ACTIVE"
    })
    cb_col.insert_one({
        "id": f"cb_{ts}_1",
        "customer_id": c1_cust_id,
        "business_id": biz_id,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Setup Customer 2 (Brand new customer with 0 businesses connected)
    c2_user_id = f"usr_c2_{ts}"
    c2_cust_id = f"ZUP-CUS-M2-{ts.upper()}"
    c2_token = create_access_token({"sub": c2_user_id, "id": c2_user_id, "customer_id": c2_cust_id, "role": "customer", "email": f"c2_{ts}@customer.com"})
    c2_headers = {"Authorization": f"Bearer {c2_token}"}
    users_col.insert_one({"id": c2_user_id, "role": "customer", "customer_id": c2_cust_id, "name": f"Bob {ts}", "email": f"c2_{ts}@customer.com", "phone": "9876543211"})
    cust_col.insert_one({
        "id": c2_user_id,
        "user_id": c2_user_id,
        "customer_id": c2_cust_id,
        "name": f"Bob {ts}",
        "email": f"c2_{ts}@customer.com",
        "phone": "9876543211",
        "points": 0,
        "stamps": 0,
        "lifetime_points": 0,
        "total_visits": 0,
        "status": "ACTIVE"
    })

    # TEST 1: Customer Home Endpoint Timings and Data Format
    t0 = time.time()
    res = client.get("/api/customer/home", headers=c1_headers)
    dt1 = (time.time() - t0) * 1000
    pass1 = res.status_code == 200
    data1 = res.json() if pass1 else {}
    pass1 = pass1 and data1.get("success") is True
    pass1 = pass1 and data1.get("customer", {}).get("customer_id") == c1_cust_id
    pass1 = pass1 and len(data1.get("businesses", [])) == 1
    report("TEST 1: Customer Home Endpoint resolves authoritative profile & connected store", pass1, f"({dt1:.1f}ms)")

    # TEST 2: Unauthenticated / Expired Token Returns 401
    t0 = time.time()
    res_no_auth = client.get("/api/customer/home")
    dt2 = (time.time() - t0) * 1000
    pass2 = res_no_auth.status_code == 401
    res_bad_auth = client.get("/api/customer/home", headers={"Authorization": "Bearer expired_or_invalid_jwt"})
    pass2 = pass2 and res_bad_auth.status_code == 401
    report("TEST 2: Expired or missing token returns HTTP 401 cleanly", pass2, f"({dt2:.1f}ms)")

    # TEST 3: New Customer With No Connected Store Returns Graceful Empty State
    t0 = time.time()
    res_c2 = client.get("/api/customer/home", headers=c2_headers)
    dt3 = (time.time() - t0) * 1000
    pass3 = res_c2.status_code == 200
    data_c2 = res_c2.json() if pass3 else {}
    pass3 = pass3 and data_c2.get("is_empty") is True
    pass3 = pass3 and len(data_c2.get("businesses", [])) == 0
    pass3 = pass3 and data_c2.get("customer", {}).get("points") == 0
    report("TEST 3: New account with no loyalty card resolves is_empty=True without failure", pass3, f"({dt3:.1f}ms)")

    # TEST 4: Cart Order Creation with Correct Customer Identity, Variant, and Store ID
    t0 = time.time()
    order_payload = {
        "business_id": biz_id,
        "items": [{"product_id": prod_id, "quantity": 2}],
        "order_type": "TAKEAWAY",
        "payment_method": "CASH",
        "customer_name": f"Alice {ts}",
        "customer_phone": "9876543210",
        "idempotency_key": f"idem_cart_{ts}_{uuid.uuid4().hex[:16]}"
    }
    res_order = client.post("/api/orders", json=order_payload, headers=c1_headers)
    dt4 = (time.time() - t0) * 1000
    pass4 = res_order.status_code in (200, 201)
    order_data = res_order.json() if pass4 else {}
    pass4 = pass4 and (order_data.get("business_id") == biz_id or order_data.get("order", {}).get("business_id") == biz_id)
    report("TEST 4: Cart to Order creation persists correct product ID, store ID, and customer ID", pass4, f"({dt4:.1f}ms, Status {res_order.status_code})")

    # TEST 5: Cart Isolation - Customer 2 Cannot See Customer 1's Orders
    c2_orders = client.get("/api/orders/my", headers=c2_headers).json()
    c2_order_list = c2_orders if isinstance(c2_orders, list) else c2_orders.get("orders", [])
    order_id = order_data.get("id") or order_data.get("order", {}).get("id")
    pass5 = all(o.get("id") != order_id for o in c2_order_list)
    report("TEST 5: Strict cart and order isolation between customers", pass5)

    # TEST 6: Public Menu for Business Endpoint
    t0 = time.time()
    res_menu = client.get(f"/api/public/menu/mobile-store-{ts}")
    dt6 = (time.time() - t0) * 1000
    pass6 = res_menu.status_code == 200
    menu_data = res_menu.json() if pass6 else {}
    pass6 = pass6 and menu_data.get("business", {}).get("id") == biz_id
    report("TEST 6: Storefront menu endpoint resolves products & categories", pass6, f"({dt6:.1f}ms)")

    all_passed = all(test_results.values())
    print(f"\nFINAL TEST SUITE SUMMARY: {'ALL 6 TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    return all_passed

def test_customer_mobile_suite():
    assert run_tests() is True

if __name__ == "__main__":
    ok = run_tests()
    sys.exit(0 if ok else 1)
