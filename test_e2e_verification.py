"""
ZOOR UP Comprehensive End-to-End Verification Suite
Tests:
1. Direct UPI Payment Flow (Zero Razorpay, Merchant 8521893325@ybl, Safe Deep Link, Pending -> Paid verification)
2. Customer Profile Persistence & Auto-population
3. Table Reservation & 409 Conflict Prevention on Double Booking
4. Strict Multi-Tenant Customer Isolation & QR Association
"""
import uuid
import sys
import time
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection

client = TestClient(app)

def run_tests():
    print("=" * 60)
    print("RUNNING ZOOR UP E2E VERIFICATION SUITE")
    print("=" * 60)

    # ---------------------------------------------------------
    # 1. DIRECT UPI PAYMENT FLOW
    # ---------------------------------------------------------
    print("\n--- TEST 1: Direct UPI Payment Flow (Growth Plan) ---")
    users_col = get_collection("users")
    businesses_col = get_collection("businesses")
    biz_user_id = f"biz_owner_{uuid.uuid4().hex[:8]}"
    store_id = f"test_store_{uuid.uuid4().hex[:6]}"
    biz_email = f"biz_{uuid.uuid4().hex[:6]}@test.com"
    users_col.insert_one({"id": biz_user_id, "role": "business", "store_id": store_id, "email": biz_email})
    businesses_col.insert_one({"id": store_id, "owner_id": biz_user_id, "name": "Test Store 1", "status": "ACTIVE"})
    biz_token = create_access_token({"id": biz_user_id, "role": "business", "store_id": store_id})
    headers_biz = {"Authorization": f"Bearer {biz_token}"}

    # Test Plan Listing
    res = client.get("/api/subscriptions/plans")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    plans = res.json()["plans"]
    growth_plan = next(p for p in plans if p["id"].upper() == "GROWTH")
    pro_plan = next(p for p in plans if p["id"].upper() == "PRO")
    assert growth_plan["monthly"] == 799, f"Expected 799, got {growth_plan['monthly']}"
    assert pro_plan["monthly"] == 1499, f"Expected 1499, got {pro_plan['monthly']}"
    print("[PASS] Plans loaded correctly with server-enforced pricing (Growth=799, Pro=1499)")

    # Initiate UPI Payment for Growth Plan
    initiate_payload = {
        "plan_id": "growth",
        "store_id": store_id,
        "billing_interval": "monthly"
    }
    res = client.post("/api/subscriptions/payment/initiate", json=initiate_payload, headers=headers_biz)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    init_data = res.json()
    assert init_data["success"] is True
    assert init_data["amount"] == 799
    assert init_data["status"] == "pending"
    import urllib.parse
    unquoted_uri = urllib.parse.unquote(init_data["upi_uri"])
    assert "8521893325@ybl" in unquoted_uri
    assert "ZOOR UP" in unquoted_uri
    assert "am=799" in unquoted_uri
    assert "cu=INR" in unquoted_uri
    payment_id = init_data["payment_id"]
    print(f"[PASS] UPI payment initiated: {payment_id}")
    print(f"  UPI Deep Link: {init_data['upi_uri']}")

    # Check status is pending (must NOT be activated yet)
    res = client.get(f"/api/subscriptions/payment/{payment_id}", headers=headers_biz)
    assert res.status_code == 200
    assert res.json()["status"] == "pending"
    print("[PASS] Payment status correctly maintained as pending before verification")

    # Verify Payment with UTR: Business owner self-verification should be forbidden
    res_forbidden = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json={"utr": "UTR123", "independently_reconciled": True}, headers=headers_biz)
    assert res_forbidden.status_code == 403
    print("[PASS] Non-admin cannot self-verify payments (HTTP 403)")

    # Admin verifies payment with UTR
    admin_id = f"admin_{uuid.uuid4().hex[:8]}"
    users_col.insert_one({"id": admin_id, "role": "SUPER_ADMIN", "email": f"{admin_id}@test.com"})
    admin_token = create_access_token({"sub": admin_id, "role": "SUPER_ADMIN"})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    verify_payload = {
        "utr": f"UTR{int(time.time() * 1000)}",
        "independently_reconciled": True
    }
    res = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json=verify_payload, headers=admin_headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    verify_data = res.json()
    assert verify_data["success"] is True
    assert verify_data["status"] == "paid"
    assert verify_data["plan_id"] == "growth"
    print("[PASS] Payment successfully verified by Admin and plan activated")

    # Check subscription status is now ACTIVE Growth
    res = client.get("/api/subscriptions/current", headers=headers_biz)
    assert res.status_code == 200
    current_sub = res.json()["subscription"]
    assert current_sub["plan_id"] == "growth"
    assert current_sub["status"] == "ACTIVE"
    print("[PASS] Current subscription confirmed as ACTIVE Growth")

    # ---------------------------------------------------------
    # 2. CUSTOMER PROFILE PERSISTENCE & AUTO-POPULATION
    # ---------------------------------------------------------
    print("\n--- TEST 2: Customer Profile Persistence ---")
    cus_user_id = f"cus_user_{uuid.uuid4().hex[:8]}"
    cus_phone = f"+9198{int(time.time() * 100) % 100000000:08d}"
    cus_email = f"jane_{uuid.uuid4().hex[:6]}@example.com"
    users_col.insert_one({"id": cus_user_id, "role": "customer", "phone": cus_phone, "email": cus_email, "name": "Jane"})
    cus_token = create_access_token({"id": cus_user_id, "role": "customer", "phone": cus_phone})
    headers_cus = {"Authorization": f"Bearer {cus_token}"}

    # Initial Profile Retrieval (brand new customer)
    res = client.get("/api/customer/profile", headers=headers_cus)
    assert res.status_code == 200
    profile_data = res.json()
    assert profile_data["phone"] == cus_phone
    assert profile_data["points"] == 0
    assert profile_data["stamps"] == 0
    print("[PASS] Customer profile generated with clean initial state")

    # Update Customer Profile
    update_payload = {
        "name": "Jane Doe",
        "email": cus_email,
        "photo": "https://example.com/avatar.jpg",
        "dob": "1995-05-15",
        "gender": "Female",
        "address": "123 MG Road, Bengaluru",
        "bio": "Coffee & pastry enthusiast"
    }
    res = client.put("/api/customer/profile", json=update_payload, headers=headers_cus)
    assert res.status_code == 200
    updated = res.json()
    assert updated["name"] == "Jane Doe"
    assert updated["email"] == cus_email
    assert updated["address"] == "123 MG Road, Bengaluru"
    assert updated["gender"] == "Female"
    print("[PASS] Customer profile updated and returned")

    # Fetch again to ensure persistence in MongoDB collection
    res = client.get("/api/customer/profile", headers=headers_cus)
    assert res.status_code == 200
    persisted = res.json()
    assert persisted["name"] == "Jane Doe"
    assert persisted["email"] == cus_email
    assert persisted["address"] == "123 MG Road, Bengaluru"
    print("[PASS] Customer profile permanently persisted in MongoDB")

    # ---------------------------------------------------------
    # 3. TABLE RESERVATIONS & 409 CONFLICT PREVENTING OVERBOOKING
    # ---------------------------------------------------------
    print("\n--- TEST 3: Table Reservation & Overbooking Conflict Check ---")
    # Setup test table in business
    test_biz_id = f"test_cafe_{uuid.uuid4().hex[:6]}"
    businesses_col.insert_one({"id": test_biz_id, "owner_id": f"owner_{uuid.uuid4().hex[:8]}", "name": "Sunset Bistro", "status": "ACTIVE"})

    tables_col = get_collection("tables")
    test_table_id = f"tbl_{uuid.uuid4().hex[:6]}"
    tables_col.insert_one({
        "id": test_table_id,
        "business_id": test_biz_id,
        "table_number": "T-10",
        "capacity": 4,
        "location": "Window Corner",
        "status": "active"
    })

    # Customer books table (name and phone auto-populate from authenticated JWT & DB)
    booking_payload = {
        "business_id": test_biz_id,
        "table_id": test_table_id,
        "party_size": 2,
        "booking_date": "2026-10-01",
        "booking_time": "19:30",
        "notes": "Anniversary celebration"
    }
    res = client.post("/api/customer/table-reservations", json=booking_payload, headers=headers_cus)
    assert res.status_code in (200, 201), f"Expected 200/201, got {res.status_code}: {res.text}"
    booking_data = res.json().get("reservation", res.json())
    assert booking_data["customer_name"] == "Jane Doe"
    assert booking_data["customer_phone"] == cus_phone
    assert booking_data["status"] in ("pending", "confirmed")
    booking_id = booking_data["id"]
    print(f"[PASS] Table reserved successfully: {booking_id} for {booking_data['customer_name']}")

    # Try duplicate booking for same table, date and time -> MUST return 409 Conflict
    dup_payload = {
        "business_id": test_biz_id,
        "table_id": test_table_id,
        "party_size": 3,
        "booking_date": "2026-10-01",
        "booking_time": "19:30"
    }
    res_conflict = client.post("/api/customer/table-reservations", json=dup_payload, headers=headers_cus)
    assert res_conflict.status_code == 409, f"Expected 409 Conflict, got {res_conflict.status_code}"
    print("[PASS] Double booking correctly rejected with HTTP 409 Conflict")

    # Cancel reservation
    res_cancel = client.put(f"/api/customer/table-reservations/{booking_id}/cancel", headers=headers_cus)
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"
    print("[PASS] Reservation successfully cancelled")

    # ---------------------------------------------------------
    # 4. STRICT MULTI-TENANT ISOLATION & BUSINESS ASSOCIATION
    # ---------------------------------------------------------
    print("\n--- TEST 4: Multi-Tenant Customer Isolation & Association ---")
    new_cus_id = f"fresh_cus_{uuid.uuid4().hex[:8]}"
    new_cus_phone = f"+91999{int(time.time()) % 10000000:07d}"
    users_col.insert_one({"id": new_cus_id, "role": "customer", "phone": new_cus_phone})
    new_cus_token = create_access_token({"id": new_cus_id, "role": "customer", "phone": new_cus_phone})
    headers_new_cus = {"Authorization": f"Bearer {new_cus_token}"}

    # Brand new customer MUST receive empty state (no businesses, no demo leaks)
    res_home = client.get("/api/customer/home", headers=headers_new_cus)
    assert res_home.status_code == 200
    home_data = res_home.json()
    assert home_data["is_empty"] is True
    assert len(home_data["businesses"]) == 0
    assert home_data["points"] == 0
    assert home_data["stamps"] == 0
    assert len(home_data["orders"]) == 0
    assert len(home_data["visits"]) == 0
    print("[PASS] Brand new customer starts with EMPTY isolated state (no demo leaks)")

    # Connect customer to business via QR scan endpoint
    res_conn = client.post(
        "/api/customer/businesses/connect",
        json={"business_id": test_biz_id, "source": "qr_scan"},
        headers=headers_new_cus
    )
    assert res_conn.status_code == 200
    conn_data = res_conn.json()
    assert conn_data["success"] is True
    assert conn_data["business"]["id"] == test_biz_id
    print(f"[PASS] Customer connected to {test_biz_id} via QR scan")

    # Check that calling connect again is idempotent (no duplicates)
    res_conn2 = client.post(
        "/api/customer/businesses/connect",
        json={"business_id": test_biz_id, "source": "qr_scan"},
        headers=headers_new_cus
    )
    assert res_conn2.status_code == 200
    assert res_conn2.json()["already_connected"] is True
    print("[PASS] Business connection is idempotent")

    # Re-fetch customer home: now contains ONLY the connected business
    res_home2 = client.get("/api/customer/home", headers=headers_new_cus)
    assert res_home2.status_code == 200
    home_data2 = res_home2.json()
    assert home_data2["is_empty"] is False
    assert len(home_data2["businesses"]) == 1
    assert home_data2["businesses"][0]["id"] == test_biz_id
    print("[PASS] Customer home now accurately displays connected business only")

    print("\n" + "=" * 60)
    print("ALL E2E VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
