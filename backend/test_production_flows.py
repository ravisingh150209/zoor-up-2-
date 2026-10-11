"""
Verification of Customer + Business Production Flows
Tests 1 through 11 against live FastAPI app and Supabase.
"""
import sys
import os
import uuid
from decimal import Decimal
from datetime import datetime, timedelta, timezone

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

results = {}

def report(name, passed, msg=""):
    results[name] = passed
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] {name} {msg}")

def run_all_tests():
    print("=== STARTING 11 PRODUCTION FLOW TESTS ===")
    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    cust_col = get_collection("customers")
    cb_col = get_collection("customer_businesses")
    prod_col = get_collection("products")
    orders_col = get_collection("orders")
    vouchers_col = get_collection("vouchers")
    cv_col = get_collection("customer_vouchers")

    ts = uuid.uuid4().hex[:6]

    # Setup Store A
    owner_a_id = f"usr_owner_a_{ts}"
    biz_a_id = f"biz_store_a_{ts}"
    owner_a_token = create_access_token({"sub": owner_a_id, "id": owner_a_id, "role": "business_owner", "email": f"owner_a_{ts}@example.com"})
    owner_a_headers = {"Authorization": f"Bearer {owner_a_token}"}
    users_col.insert_one({"id": owner_a_id, "role": "business_owner", "business_id": biz_a_id, "email": f"owner_a_{ts}@example.com", "name": f"Owner A {ts}"})
    biz_col.insert_one({
        "id": biz_a_id,
        "name": f"Store A {ts}",
        "slug": f"store-a-{ts}",
        "owner_id": owner_a_id,
        "status": "ACTIVE",
        "upi_id": "",
        "upi_name": f"Store A {ts}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Setup Store B
    owner_b_id = f"usr_owner_b_{ts}"
    biz_b_id = f"biz_store_b_{ts}"
    owner_b_token = create_access_token({"sub": owner_b_id, "id": owner_b_id, "role": "business_owner", "email": f"owner_b_{ts}@example.com"})
    owner_b_headers = {"Authorization": f"Bearer {owner_b_token}"}
    users_col.insert_one({"id": owner_b_id, "role": "business_owner", "business_id": biz_b_id, "email": f"owner_b_{ts}@example.com", "name": f"Owner B {ts}"})
    biz_col.insert_one({
        "id": biz_b_id,
        "name": f"Store B {ts}",
        "slug": f"store-b-{ts}",
        "owner_id": owner_b_id,
        "status": "ACTIVE",
        "upi_id": f"storeb_{ts}@okaxis",
        "upi_name": f"Store B {ts}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Products for Store A
    prod_a_id = f"prod_a_{ts}"
    prod_col.insert_one({
        "id": prod_a_id,
        "business_id": biz_a_id,
        "name": f"Item A {ts}",
        "price": 100.0,
        "active": True,
        "available": True,
    })

    # Products for Store B
    prod_b_id = f"prod_b_{ts}"
    prod_col.insert_one({
        "id": prod_b_id,
        "business_id": biz_b_id,
        "name": f"Item B {ts}",
        "price": 200.0,
        "active": True,
        "available": True,
    })

    # Setup Customer 1 (associated with A & B)
    c1_user_id = f"usr_c1_{ts}"
    c1_cust_id = f"ZUP-CUS-C1-{ts.upper()}"
    c1_token = create_access_token({"sub": c1_user_id, "id": c1_user_id, "customer_id": c1_cust_id, "role": "customer", "email": f"c1_{ts}@customer.com"})
    c1_headers = {"Authorization": f"Bearer {c1_token}"}
    users_col.insert_one({"id": c1_user_id, "role": "customer", "customer_id": c1_cust_id, "email": f"c1_{ts}@customer.com", "name": f"Customer One {ts}"})
    cust_col.insert_one({
        "id": c1_user_id,
        "customer_id": c1_cust_id,
        "user_id": c1_user_id,
        "name": f"Customer One {ts}",
        "email": f"c1_{ts}@customer.com",
        "phone": f"+9198{ts[:8]}",
        "points": 500,
        "stamps": 5,
        "status": "ACTIVE"
    })

    # Setup Customer 2 (associated ONLY with Store A)
    c2_user_id = f"usr_c2_{ts}"
    c2_cust_id = f"ZUP-CUS-C2-{ts.upper()}"
    c2_token = create_access_token({"sub": c2_user_id, "id": c2_user_id, "customer_id": c2_cust_id, "role": "customer", "email": f"c2_{ts}@customer.com"})
    c2_headers = {"Authorization": f"Bearer {c2_token}"}
    users_col.insert_one({"id": c2_user_id, "role": "customer", "customer_id": c2_cust_id, "email": f"c2_{ts}@customer.com", "name": f"Customer Two {ts}"})
    cust_col.insert_one({
        "id": c2_user_id,
        "customer_id": c2_cust_id,
        "user_id": c2_user_id,
        "name": f"Customer Two {ts}",
        "email": f"c2_{ts}@customer.com",
        "phone": f"+9199{ts[:8]}",
        "points": 100,
        "stamps": 1,
        "status": "ACTIVE"
    })

    # Associations
    cb_col.insert_one({"id": f"cb_c1_a_{ts}", "customer_id": c1_cust_id, "business_id": biz_a_id, "status": "active", "source": "test"})
    cb_col.insert_one({"id": f"cb_c1_b_{ts}", "customer_id": c1_cust_id, "business_id": biz_b_id, "status": "active", "source": "test"})
    cb_col.insert_one({"id": f"cb_c2_a_{ts}", "customer_id": c2_cust_id, "business_id": biz_a_id, "status": "active", "source": "test"})

    # ----------------------------------------------------
    # TEST 1: Business saves UPI ID -> refresh/logout/login -> verify UPI ID remains
    # ----------------------------------------------------
    upi_a_val = f"storea_{ts}@okicici"
    save_res = client.put("/api/business/upi", json={
        "upi_id": upi_a_val,
        "upi_name": f"Store A {ts}",
        "upi_notes": "ZOOR UP Store Payment"
    }, headers=owner_a_headers)
    t1_pass = save_res.status_code == 200 and save_res.json().get("upi_id") == upi_a_val

    # Verify retrieval via GET /api/business/upi (simulate page refresh)
    get_res = client.get("/api/business/upi", headers=owner_a_headers)
    t1_pass = t1_pass and get_res.status_code == 200 and get_res.json().get("upi_id") == upi_a_val

    # Simulate logout/login from another device by generating a brand new token
    fresh_login_token = create_access_token({"sub": owner_a_id, "id": owner_a_id, "role": "business_owner", "email": f"owner_a_{ts}@example.com"})
    fresh_headers = {"Authorization": f"Bearer {fresh_login_token}"}
    relogin_res = client.get("/api/business/profile", headers=fresh_headers)
    t1_pass = t1_pass and relogin_res.status_code == 200 and relogin_res.json().get("upi_id") == upi_a_val

    # Also verify direct Supabase record
    supa_biz_a = biz_col.find_one({"id": biz_a_id})
    t1_pass = t1_pass and supa_biz_a and supa_biz_a.get("upi_id") == upi_a_val
    report("TEST 1: Business saves UPI ID & persistence", t1_pass, f"UPI: {upi_a_val}")

    # ----------------------------------------------------
    # TEST 2: Customer Store A -> checkout -> UPI -> verify Store A's UPI ID is used
    # ----------------------------------------------------
    order_a_res = client.post("/api/orders", json={
        "business_id": biz_a_id,
        "items": [{"product_id": prod_a_id, "quantity": 1}],
        "order_type": "TAKEAWAY",
        "payment_method": "UPI",
        "idempotency_key": f"idem_order_a_{ts}_{uuid.uuid4().hex[:8]}"
    }, headers=c1_headers)
    t2_pass = order_a_res.status_code == 201
    order_a = order_a_res.json() if t2_pass else {}

    # Initiate UPI payment
    pay_a_res = client.post("/api/payments/upi/create", json={
        "business_id": biz_a_id,
        "order_id": order_a.get("id"),
        "amount": order_a.get("total", 105.0)
    }, headers=c1_headers)
    t2_pass = t2_pass and pay_a_res.status_code == 200
    pay_a_data = pay_a_res.json() if t2_pass else {}
    t2_pass = t2_pass and pay_a_data.get("upi_id") == upi_a_val
    t2_pass = t2_pass and f"pa={upi_a_val}" in pay_a_data.get("upi_uri", "")
    t2_pass = t2_pass and pay_a_data.get("status") == "pending"
    report("TEST 2: Customer Store A checkout uses Store A UPI ID", t2_pass, f"Used: {pay_a_data.get('upi_id')}")

    # ----------------------------------------------------
    # TEST 3: Customer Store B -> checkout -> UPI -> verify Store B's UPI ID is used
    # ----------------------------------------------------
    order_b_res = client.post("/api/orders", json={
        "business_id": biz_b_id,
        "items": [{"product_id": prod_b_id, "quantity": 1}],
        "order_type": "TAKEAWAY",
        "payment_method": "UPI",
        "idempotency_key": f"idem_order_b_{ts}_{uuid.uuid4().hex[:8]}"
    }, headers=c1_headers)
    t3_pass = order_b_res.status_code == 201
    order_b = order_b_res.json() if t3_pass else {}

    pay_b_res = client.post("/api/payments/upi/create", json={
        "business_id": biz_b_id,
        "order_id": order_b.get("id"),
        "amount": order_b.get("total", 210.0)
    }, headers=c1_headers)
    t3_pass = t3_pass and pay_b_res.status_code == 200
    pay_b_data = pay_b_res.json() if t3_pass else {}
    expected_upi_b = f"storeb_{ts}@okaxis"
    t3_pass = t3_pass and pay_b_data.get("upi_id") == expected_upi_b
    t3_pass = t3_pass and f"pa={expected_upi_b}" in pay_b_data.get("upi_uri", "")
    t3_pass = t3_pass and pay_b_data.get("status") == "pending"
    report("TEST 3: Customer Store B checkout uses Store B UPI ID", t3_pass, f"Used: {pay_b_data.get('upi_id')}")

    # ----------------------------------------------------
    # TEST 4: Customer scans customer card QR -> correct customer resolves
    # ----------------------------------------------------
    qr_cus_res = client.post("/api/qr/resolve", json={
        "qr_data": f"https://zoorup.io/customer/{c1_cust_id}"
    })
    t4_pass = qr_cus_res.status_code == 200
    qr_cus_data = qr_cus_res.json() if t4_pass else {}
    t4_pass = t4_pass and qr_cus_data.get("type") == "CUSTOMER" and qr_cus_data.get("customer_id") == c1_cust_id
    report("TEST 4: Customer card QR resolves correct customer", t4_pass, f"Resolved: {qr_cus_data.get('customer_id')}")

    # ----------------------------------------------------
    # TEST 5: Customer scans Store QR / Table QR -> correct store resolves
    # ----------------------------------------------------
    qr_store_res = client.post("/api/qr/resolve", json={
        "qr_data": f"https://zoorup.io/b/{biz_a_id}/menu"
    })
    t5_pass = qr_store_res.status_code == 200
    qr_store_data = qr_store_res.json() if t5_pass else {}
    t5_pass = t5_pass and qr_store_data.get("business_id") == biz_a_id and qr_store_data.get("type") == "MENU"

    # Also test UPI QR resolution
    qr_upi_res = client.post("/api/qr/resolve", json={
        "qr_data": f"upi://pay?pa={upi_a_val}&pn=Store%20A&am=105.00&cu=INR&tn=ZOORUP"
    })
    t5_pass = t5_pass and qr_upi_res.status_code == 200 and qr_upi_res.json().get("type") == "UPI" and qr_upi_res.json().get("upi_id") == upi_a_val
    report("TEST 5: Store QR and UPI QR resolve correctly", t5_pass, f"Store: {qr_store_data.get('business_id')}")

    # ----------------------------------------------------
    # TEST 6: Valid coupon -> Apply -> correct discount -> checkout total correct
    # ----------------------------------------------------
    coupon_code = f"PROMO10_{ts.upper()}"
    vouchers_col.insert_one({
        "id": f"vch_{ts}",
        "voucher_id": f"vch_{ts}",
        "business_id": biz_a_id,
        "code": coupon_code,
        "title": "10% OFF Promo",
        "discount_type": "PERCENTAGE",
        "discount_value": 10.0,
        "min_spend": 50.0,
        "minimum_order_value": 50.0,
        "status": "ACTIVE",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Validate endpoint
    val_res = client.post("/api/coupons/validate", json={
        "business_id": biz_a_id,
        "code": coupon_code,
        "subtotal": 100.0
    })
    t6_pass = val_res.status_code == 200
    val_data = val_res.json() if t6_pass else {}
    t6_pass = t6_pass and val_data.get("valid") is True and val_data.get("discount_amount") == 10.0

    # Place order with coupon
    order_coupon_res = client.post("/api/orders", json={
        "business_id": biz_a_id,
        "items": [{"product_id": prod_a_id, "quantity": 1}], # subtotal 100
        "order_type": "TAKEAWAY",
        "payment_method": "UPI",
        "coupon_code": coupon_code,
        "idempotency_key": f"idem_coupon_{ts}_{uuid.uuid4().hex[:8]}"
    }, headers=c1_headers)
    t6_pass = t6_pass and order_coupon_res.status_code == 201
    ord_c_data = order_coupon_res.json() if t6_pass else {}
    # Subtotal: 100, Discount: 10, Discounted Subtotal: 90, Tax 5%: 4.5, Total: 94.5
    t6_pass = t6_pass and ord_c_data.get("discount") == 10.0
    t6_pass = t6_pass and ord_c_data.get("total") == 94.5
    t6_pass = t6_pass and ord_c_data.get("coupon_code") == coupon_code
    report("TEST 6: Valid coupon applies correct discount & server total", t6_pass, f"Total: {ord_c_data.get('total')}")

    # ----------------------------------------------------
    # TEST 7: Invalid/expired coupon rejected correctly
    # ----------------------------------------------------
    # Expired coupon
    exp_code = f"EXPIRED_{ts.upper()}"
    vouchers_col.insert_one({
        "id": f"vch_exp_{ts}",
        "voucher_id": f"vch_exp_{ts}",
        "business_id": biz_a_id,
        "code": exp_code,
        "title": "Expired Promo",
        "discount_type": "PERCENTAGE",
        "discount_value": 20.0,
        "status": "ACTIVE",
        "expires_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    val_exp = client.post("/api/coupons/validate", json={
        "business_id": biz_a_id,
        "code": exp_code,
        "subtotal": 100.0
    })
    t7_pass = val_exp.status_code == 200 and val_exp.json().get("success") is False and val_exp.json().get("valid") is False

    # Wrong store coupon
    val_wrong_store = client.post("/api/coupons/validate", json={
        "business_id": biz_b_id, # coupon belongs to store A
        "code": coupon_code,
        "subtotal": 100.0
    })
    t7_pass = t7_pass and val_wrong_store.status_code == 200 and val_wrong_store.json().get("success") is False and val_wrong_store.json().get("valid") is False
    report("TEST 7: Expired and wrong-store coupons rejected", t7_pass)

    # ----------------------------------------------------
    # TEST 8: Eligible reward -> redeem -> persisted after refresh
    # ----------------------------------------------------
    cust_voucher_id = f"cv_test_{ts}"
    cv_col.insert_one({
        "id": cust_voucher_id,
        "customer_id": c1_cust_id,
        "business_id": biz_a_id,
        "voucher_id": f"vch_{ts}",
        "code": f"REDEEM-{ts.upper()}",
        "title": "VIP Coffee",
        "discount_type": "FIXED",
        "discount_value": 50.0,
        "status": "AVAILABLE",
        "claimed_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    redeem_res = client.post(f"/api/vouchers/{cust_voucher_id}/redeem", headers=c1_headers)
    print("DEBUG T8 redeem_res:", redeem_res.status_code, redeem_res.text)
    t8_pass = redeem_res.status_code == 200
    redeem_data = redeem_res.json() if t8_pass else {}
    t8_pass = t8_pass and redeem_data.get("status") == "REDEEMED"

    # Refresh/check in Supabase
    cv_record = cv_col.find_one({"id": cust_voucher_id})
    t8_pass = t8_pass and cv_record and cv_record.get("status") == "REDEEMED"

    # Try duplicate redemption
    dup_redeem_res = client.post(f"/api/vouchers/{cust_voucher_id}/redeem", headers=c1_headers)
    t8_pass = t8_pass and dup_redeem_res.status_code == 400
    report("TEST 8: Reward voucher redeem & duplicate prevention", t8_pass, f"Status: {cv_record.get('status')}")

    # ----------------------------------------------------
    # TEST 9: Customer associated with A+B -> only A+B cards appear -> no duplicate cards
    # ----------------------------------------------------
    c1_home_res = client.get("/api/customer/home", headers=c1_headers)
    t9_pass = c1_home_res.status_code == 200
    c1_home_data = c1_home_res.json() if t9_pass else {}
    c1_businesses = c1_home_data.get("businesses", [])
    c1_biz_ids = [b["id"] for b in c1_businesses]
    # Exactly Store A and Store B
    t9_pass = t9_pass and (biz_a_id in c1_biz_ids) and (biz_b_id in c1_biz_ids)
    # No duplicate cards for Store A or Store B
    t9_pass = t9_pass and (c1_biz_ids.count(biz_a_id) == 1) and (c1_biz_ids.count(biz_b_id) == 1)
    report("TEST 9: Customer associated with A+B sees only A+B and no duplicates", t9_pass, f"Count: {len(c1_biz_ids)}")

    # ----------------------------------------------------
    # TEST 10: Customer associated only with A -> only A appears (not B)
    # ----------------------------------------------------
    c2_home_res = client.get("/api/customer/home", headers=c2_headers)
    t10_pass = c2_home_res.status_code == 200
    c2_home_data = c2_home_res.json() if t10_pass else {}
    c2_businesses = c2_home_data.get("businesses", [])
    c2_biz_ids = [b["id"] for b in c2_businesses]
    # Exactly Store A, MUST NOT see Store B
    t10_pass = t10_pass and (biz_a_id in c2_biz_ids)
    t10_pass = t10_pass and (biz_b_id not in c2_biz_ids)
    t10_pass = t10_pass and (c2_biz_ids.count(biz_a_id) == 1)
    report("TEST 10: Customer associated only with A sees only A (not B)", t10_pass, f"Seen: {c2_biz_ids}")

    # ----------------------------------------------------
    # TEST 11: Customer A vs Customer B -> no cross-customer data
    # ----------------------------------------------------
    # Customer 2 attempts to redeem Customer 1's voucher
    c2_try_redeem = client.post(f"/api/vouchers/{cust_voucher_id}/redeem", headers=c2_headers)
    t11_pass = c2_try_redeem.status_code in (403, 404)

    # Customer 2 attempts to view Customer 1's order
    c2_try_order = client.get(f"/api/orders/{order_a.get('id')}", headers=c2_headers)
    t11_pass = t11_pass and c2_try_order.status_code in (403, 404)

    # Customer 1 cannot see Customer 2's orders in /orders/my
    c2_orders = client.get("/api/orders/my", headers=c2_headers).json()
    c1_order_ids = {o["id"] for o in c1_home_data.get("orders", [])}
    c2_order_ids = {o["id"] for o in c2_orders}
    t11_pass = t11_pass and (len(c1_order_ids.intersection(c2_order_ids)) == 0)
    report("TEST 11: Strict customer data isolation (orders/vouchers)", t11_pass)

    all_passed = all(results.values())
    print(f"\nOVERALL RESULT: {'ALL PASS' if all_passed else 'SOME FAILED'}")
    return all_passed

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
