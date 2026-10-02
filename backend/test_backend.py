"""
ZOOR UP Comprehensive Backend Verification Test Suite
"""
import sys
import os
from datetime import timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DEV_OTP"] = "true"
os.environ["ENVIRONMENT"] = "development"

from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection, reset_mock_db

DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "zoorup_db.json"))


def reset_test_database():
    """Clear both persisted and in-memory mock DB state so verification runs against a clean dataset."""
    reset_mock_db()
    try:
        if os.path.exists(DB_FILE):
            os.remove(DB_FILE)
        tmp_file = DB_FILE + ".tmp"
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
    except Exception:
        pass
    try:
        users_col = get_collection("users")
        biz_col = get_collection("businesses")
        subs_col = get_collection("subscriptions")
        cust_col = get_collection("customers")
        
        cb_col = get_collection("customer_businesses")
        orders_col = get_collection("orders")
        tables_col = get_collection("tables")
        bookings_col = get_collection("table_bookings")
        loyalty_col = get_collection("loyalty")
        vouchers_col = get_collection("vouchers")
        cv_col = get_collection("customer_vouchers")
        visits_col = get_collection("visits")
        prod_col = get_collection("products")
        pay_col = get_collection("payments")
        
        test_emails = [
            'invite.customer@example.com',
            'isolation.customer@example.com',
            'order.customer.a@example.com',
            'order.customer.b@example.com',
            'order.customer.c@example.com',
            'other-invite@example.com',
            'other_business@example.com',
            'owner_test_1@zoorup.io',
            'rate-limited-login@example.com',
            'rohan.verma@example.com',
            'same.account.device@example.com',
            'second.mobile.customer@example.com',
            'second.mobile.owner@example.com',
            'second_business@example.com',
            'second_loyalty@example.com',
            'second_owner_isolation@example.com',
            'security-admin@example.test',
            'victim@example.com',
        ]
        test_phones = [
            '+919800000001',
            '+919800000010',
            '+919800000099',
            '+919800000221',
            '+919800000222',
            '+919800000223',
            '+919810000004',
            '+919812345678',
            '+919870011223',
        ]
        
        for em in test_emails:
            for u in users_col.find({"email": em}):
                for b in biz_col.find({"owner_id": u.get("id")}):
                    bid = b.get("id")
                    if bid:
                        subs_col.delete_many({"business_id": bid})
                        cb_col.delete_many({"business_id": bid})
                        orders_col.delete_many({"business_id": bid})
                        tables_col.delete_many({"business_id": bid})
                        bookings_col.delete_many({"business_id": bid})
                        loyalty_col.delete_many({"business_id": bid})
                        vouchers_col.delete_many({"business_id": bid})
                        cv_col.delete_many({"business_id": bid})
                        visits_col.delete_many({"business_id": bid})
                        prod_col.delete_many({"business_id": bid})
                        pay_col.delete_many({"business_id": bid})
                biz_col.delete_many({"owner_id": u.get("id")})
                if u.get("store_id"):
                    subs_col.delete_many({"business_id": u.get("store_id")})
            for c in cust_col.find({"email": em}):
                cid = c.get("customer_id") or c.get("id")
                if cid:
                    cb_col.delete_many({"customer_id": cid})
                    orders_col.delete_many({"customer_id": cid})
                    bookings_col.delete_many({"customer_id": cid})
                    loyalty_col.delete_many({"customer_id": cid})
                    cv_col.delete_many({"customer_id": cid})
                    visits_col.delete_many({"customer_id": cid})
            users_col.delete_many({"email": em})
            cust_col.delete_many({"email": em})
            cust_col.delete_many({"login_email": em})
            
        for ph in test_phones:
            for u in users_col.find({"phone": ph}):
                for b in biz_col.find({"owner_id": u.get("id")}):
                    bid = b.get("id")
                    if bid:
                        subs_col.delete_many({"business_id": bid})
                        cb_col.delete_many({"business_id": bid})
                        orders_col.delete_many({"business_id": bid})
                        tables_col.delete_many({"business_id": bid})
                        bookings_col.delete_many({"business_id": bid})
                        loyalty_col.delete_many({"business_id": bid})
                        vouchers_col.delete_many({"business_id": bid})
                        cv_col.delete_many({"business_id": bid})
                        visits_col.delete_many({"business_id": bid})
                        prod_col.delete_many({"business_id": bid})
                        pay_col.delete_many({"business_id": bid})
                biz_col.delete_many({"owner_id": u.get("id")})
                if u.get("store_id"):
                    subs_col.delete_many({"business_id": u.get("store_id")})
            for c in cust_col.find({"phone": ph}):
                cid = c.get("customer_id") or c.get("id")
                if cid:
                    cb_col.delete_many({"customer_id": cid})
                    orders_col.delete_many({"customer_id": cid})
                    bookings_col.delete_many({"customer_id": cid})
                    loyalty_col.delete_many({"customer_id": cid})
                    cv_col.delete_many({"customer_id": cid})
                    visits_col.delete_many({"customer_id": cid})
            users_col.delete_many({"phone": ph})
            cust_col.delete_many({"phone": ph})
            
        biz_col.delete_many({"slug": "my-cafe"})
        users_col.delete_many({"id": "order_test_staff_no_permission"})
        users_col.delete_many({"id": "order_test_staff_table_permission"})
        users_col.delete_many({"id": "security_test_admin_user"})
        pay_col.delete_many({"verified_utr": "UTR000000009999"})
        pay_col.delete_many({"transaction_reference": "UTR000000009999"})
    except Exception:
        pass


client = TestClient(app)


def run_tests():
    reset_test_database()
    print("====================================================")
    print("STARTING ZOOR UP BACKEND API VERIFICATION SUITE")
    print("====================================================\n")

    # --- TEST 1: New Business Owner Registration ---
    print("--- TEST 1: New Business Registration (Instant ACTIVE, Empty Profile) ---")
    reg_email = "owner_test_1@zoorup.io"
    res1 = client.post("/api/auth/owner/register", json={
        "name": "",
        "owner_name": "",
        "email": reg_email,
        "phone": "",
        "password": "Password@123"
    })
    assert res1.status_code == 200, f"Registration failed: {res1.text}"
    data1 = res1.json()
    assert data1["success"] is True
    assert "access_token" in data1
    biz = data1["business"]
    assert biz["status"] == "ACTIVE", f"Expected ACTIVE, got {biz['status']}"
    assert biz["name"] == "", f"Expected empty business name, got {biz['name']}"
    assert biz["owner_name"] == "", "Owner name should be empty"
    assert biz["logo"] is None, "Logo should be null"
    assert biz["category"] == "", "Category should be empty"
    token_owner = data1["access_token"]
    print("✅ TEST 1 PASSED: Business registered instantly ACTIVE with empty profile.")

    # --- TEST 2: Duplicate Registration Rejection ---
    print("\n--- TEST 2: Duplicate Account Prevention ---")
    res2 = client.post("/api/auth/owner/register", json={
        "name": "Another Name",
        "email": reg_email,
        "password": "Password@123"
    })
    assert res2.status_code == 400, f"Expected 400, got {res2.status_code}"
    assert "already exists" in res2.json()["detail"].lower()
    print("✅ TEST 2 PASSED: Duplicate registration rejected with exact error.")

    # --- TEST 3: Business Owner Login ---
    print("\n--- TEST 3: Business Owner Login & Session ---")
    res3 = client.post("/api/auth/owner/login", json={
        "email": reg_email,
        "password": "Password@123"
    })
    assert res3.status_code == 200, f"Login failed: {res3.text}"
    data3 = res3.json()
    assert "access_token" in data3
    assert data3["business"]["status"] == "ACTIVE"
    print("✅ TEST 3 PASSED: Business Owner successfully authenticated.")

    # --- TEST 4: Onboarding Step Persistence ---
    print("\n--- TEST 4: Onboarding Data Persistence ---")
    headers_owner = {"Authorization": f"Bearer {token_owner}"}
    res4_step = client.put("/api/onboarding/step", json={
        "step": 1,
        "data": {
            "name": "My Cafe",
            "phone": "9999999999",
            "address": "Mall Road, Shimla",
            "category": "Cafe"
        }
    }, headers=headers_owner)
    assert res4_step.status_code == 200, f"Onboarding step failed: {res4_step.text}"

    # Verify status
    res4_status = client.get("/api/onboarding/status", headers=headers_owner)
    assert res4_status.status_code == 200
    biz_updated = res4_status.json()["business"]
    assert biz_updated["name"] == "My Cafe"
    assert biz_updated["phone"] == "9999999999"
    assert biz_updated["address"] == "Mall Road, Shimla"
    assert biz_updated["slug"] == "my-cafe"
    print("✅ TEST 4 PASSED: Onboarding data saved & persisted.")

    # --- TEST 5: Customer Phone OTP & Login ---
    print("\n--- TEST 5: Customer Registration via Phone OTP ---")
    phone = "+919870011223"
    res5_otp = client.post("/api/auth/otp/request", json={"phone": phone})
    assert res5_otp.status_code == 200

    res5_verify = client.post("/api/auth/otp/verify", json={"phone": phone, "code": "123456"})
    assert res5_verify.status_code == 200, f"Verify failed: {res5_verify.text}"
    data5 = res5_verify.json()
    assert data5["success"] is True
    cus = data5["customer"]
    assert cus["points"] == 0, f"Expected 0 points, got {cus['points']}"
    assert cus["stamps"] == 0, f"Expected 0 stamps, got {cus['stamps']}"
    assert cus["total_visits"] == 0, "Visits must start at 0"
    assert cus["total_spent"] == 0.0, "Spent must start at 0"
    assert cus["segment"] == "NEW", "Segment must be NEW"
    assert cus["membership_tier"] == "MEMBER", "Tier must be MEMBER"
    token_customer = data5["access_token"]
    print("✅ TEST 5 PASSED: New customer defaults verified (0 pts, 0 visits, ₹0 spent, NEW tier).")

    # --- TEST 5B: Same customer account via email/password across devices ---
    print("\n--- TEST 5B: Same email/password resolves to one server-side customer account ---")
    reg_email = "same.account.device@example.com"
    reg_phone = "+919812345678"
    reg_password = "Password@123"

    res5b_register = client.post("/api/auth/customer/register", json={
        "name": "Same Device User",
        "phone": reg_phone,
        "email": reg_email,
        "password": reg_password
    })
    assert res5b_register.status_code == 200, f"Customer register failed: {res5b_register.text}"
    customer_a = res5b_register.json()["customer"]
    user_a = res5b_register.json()["user"]

    res5b_login_a = client.post("/api/auth/customer/login", json={
        "email": reg_email,
        "password": reg_password
    })
    assert res5b_login_a.status_code == 200, f"Customer login device A failed: {res5b_login_a.text}"
    assert res5b_login_a.json()["user"]["id"] == user_a["id"], "Same email/password must map to same user ID."
    assert res5b_login_a.json()["customer"]["customer_id"] == customer_a["customer_id"], "Same email/password must map to same customer ID."

    res5b_login_b = client.post("/api/auth/customer/login", json={
        "email": reg_email,
        "password": reg_password
    })
    assert res5b_login_b.status_code == 200, f"Customer login device B failed: {res5b_login_b.text}"
    assert res5b_login_b.json()["user"]["id"] == user_a["id"], "Device B must see same user ID."
    assert res5b_login_b.json()["customer"]["customer_id"] == customer_a["customer_id"], "Device B must see same customer ID."
    print("✅ TEST 5B PASSED: Same email/password resolves to the same authenticated customer on any device.")

    # --- TEST 6: Customer Profile Retrieval and Update ---
    print("\n--- TEST 6: Customer Profile API (GET & PUT) ---")
    headers_customer = {"Authorization": f"Bearer {token_customer}"}
    res6_get = client.get("/api/customer/profile", headers=headers_customer)
    assert res6_get.status_code == 200
    prof = res6_get.json()
    assert prof["points"] == 0
    assert prof["phone"] == phone

    # Update customer profile
    res6_put = client.put("/api/customer/profile", json={
        "name": "Rohan Verma",
        "email": "rohan.verma@example.com",
        "address": "Sector 14, Chandigarh"
    }, headers=headers_customer)
    assert res6_put.status_code == 200
    updated_prof = res6_put.json()
    assert updated_prof["name"] == "Rohan Verma"
    assert updated_prof["email"] == "rohan.verma@example.com"
    assert updated_prof["address"] == "Sector 14, Chandigarh"
    print("✅ TEST 6 PASSED: Customer profile updated and persisted.")

    # --- TEST 6B: No default business fallback / JWT identity enforcement ---
    print("\n--- TEST 6B: Customer data isolation before business connection ---")
    no_conn = client.get("/api/customer/tables", headers=headers_customer)
    assert no_conn.status_code == 200, f"Customer tables request failed: {no_conn.text}"
    assert no_conn.json() == [], "Customer with no connection must not see a default business table list."

    # Create a second customer and verify request-supplied customer_id is ignored
    phone_b = "+919800000001"
    otp_b = client.post("/api/auth/otp/request", json={"phone": phone_b})
    assert otp_b.status_code == 200, f"OTP request for customer B failed: {otp_b.text}"
    verify_b = client.post("/api/auth/otp/verify", json={"phone": phone_b, "code": "123456"})
    assert verify_b.status_code == 200, f"Customer B OTP verification failed: {verify_b.text}"
    token_customer_b = verify_b.json()["access_token"]
    customer_b_id = verify_b.json()["customer"]["customer_id"]
    headers_customer_b = {"Authorization": f"Bearer {token_customer_b}"}

    attempted_booking = client.post(
        "/api/customer/table-reservations",
        json={
            "business_id": biz["id"],
            "customer_id": customer_b_id,
            "customer_name": "Customer B",
            "customer_phone": phone_b,
            "booking_date": "2026-10-10",
            "booking_time": "19:30",
            "guests": 2,
            "table_id": "not-used",
            "notes": "Should be ignored"
        },
        headers=headers_customer
    )
    # Customer A must not be able to impersonate Customer B.
    assert attempted_booking.status_code in (200, 400, 403, 404), attempted_booking.text
    if attempted_booking.status_code == 200:
        assert attempted_booking.json()["customer_id"] == prof["customer_id"], "JWT customer identity must stay authoritative."
    print("✅ TEST 6B PASSED: No default business fallback and no customer impersonation allowed.")

    # --- TEST 7: QR Code Resolution ---
    print("\n--- TEST 7: QR Code Resolution (MENU, CHECKIN, LOYALTY, CUSTOMER, INVALID) ---")
    # Menu QR
    res7_menu = client.post("/api/qr/resolve", json={"qr_data": "https://app.zoorup.com/menu/my-cafe"})
    assert res7_menu.status_code == 200
    assert res7_menu.json()["type"] == "MENU"
    assert res7_menu.json()["business_slug"] == "my-cafe"

    # Check-in QR
    res7_checkin = client.post("/api/qr/resolve", json={"qr_data": f"https://app.zoorup.com/checkin/{biz['id']}"})
    assert res7_checkin.status_code == 200
    assert res7_checkin.json()["type"] == "CHECKIN"
    assert res7_checkin.json()["business_id"] == biz["id"]

    # Loyalty QR
    res7_loyalty = client.post("/api/qr/resolve", json={"qr_data": f"https://app.zoorup.com/loyalty/{biz['id']}"})
    assert res7_loyalty.status_code == 200
    assert res7_loyalty.json()["type"] == "LOYALTY"

    # Customer QR
    res7_cus = client.post("/api/qr/resolve", json={"qr_data": f"https://app.zoorup.com/customer/{prof['customer_id']}"})
    assert res7_cus.status_code == 200
    assert res7_cus.json()["type"] == "CUSTOMER"
    assert "phone" not in res7_cus.json(), "Customer phone must NOT be exposed in public scan"
    assert "email" not in res7_cus.json(), "Customer email must NOT be exposed in public scan"

    # Invalid QR
    res7_inv = client.post("/api/qr/resolve", json={"qr_data": "https://unknown-random-qr.com/xyz"})
    assert res7_inv.status_code == 200
    assert res7_inv.json()["success"] is False
    print("✅ TEST 7 PASSED: All QR types resolved and validated server-side.")

    # --- TEST 7B: Business invite token resolves to a real business and joins customer ---
    print("\n--- TEST 7B: Business customer invite QR join flow ---")
    invite_email = "invite.customer@example.com"
    invited_customer_res = client.post(
        "/api/auth/customer/register",
        json={
            "name": "Invited Customer",
            "phone": "+919810000004",
            "email": invite_email,
            "password": "Password@123"
        }
    )
    assert invited_customer_res.status_code == 200, f"Invited customer registration failed: {invited_customer_res.text}"
    invited_login = client.post(
        "/api/auth/customer/login",
        json={"email": invite_email, "password": "Password@123"}
    )
    assert invited_login.status_code == 200, f"Invited customer login failed: {invited_login.text}"
    headers_invited_customer = {"Authorization": f"Bearer {invited_login.json()['access_token']}"}

    invite_res = client.post(
        "/api/qr/invite/create",
        json={"business_id": biz["id"], "email": invite_email, "name": "Invited Customer"},
        headers=headers_owner
    )
    assert invite_res.status_code == 200, f"Invite creation failed: {invite_res.text}"
    invite_body = invite_res.json()
    assert invite_body["success"] is True
    assert invite_body["business_id"] == biz["id"]
    assert invite_body["invite_token"]

    invite_token = invite_body["invite_token"]
    invite_qr = f"https://app.zoorup.com/join/{invite_token}"
    res7b_join = client.post("/api/qr/resolve", json={"qr_data": invite_qr}, headers=headers_invited_customer)
    assert res7b_join.status_code == 200, f"Invite QR resolution failed: {res7b_join.text}"
    join_body = res7b_join.json()
    current_biz_slug = client.get("/api/business/profile", headers=headers_owner).json()["slug"]
    assert join_body["success"] is True
    assert join_body["type"] == "JOIN" or join_body["type"] == "LOYALTY"
    assert join_body["business_id"] == biz["id"]
    assert join_body["destination"] == f"/b/{current_biz_slug}/join"

    accept_res = client.post(
        "/api/qr/invite/accept",
        json={"invite_token": invite_token},
        headers=headers_invited_customer
    )
    assert accept_res.status_code == 200, f"Invite accept failed: {accept_res.text}"
    accept_body = accept_res.json()
    assert accept_body["success"] is True
    assert accept_body["business_id"] == biz["id"]
    assert accept_body["already_connected"] in (True, False)
    print("✅ TEST 7B PASSED: Business invite QR resolves and customer can join the business securely.")

    # --- TEST 8: QR Check-in & Rewards Award ---
    print("\n--- TEST 8: QR Check-in Visit & Rewards Award ---")
    res8_checkin = client.post("/api/customer/visits/checkin", json={
        "business_id": biz["id"],
        "notes": "Table 4 Check-in"
    }, headers=headers_customer)
    assert res8_checkin.status_code == 200, f"Checkin failed: {res8_checkin.text}"
    data8 = res8_checkin.json()
    assert data8["success"] is True
    assert data8["points_awarded"] == 50
    assert data8["stamps_awarded"] == 1

    # Verify customer profile updated with awarded points and stamps
    res8_prof = client.get("/api/customer/profile", headers=headers_customer)
    prof_after = res8_prof.json()
    assert prof_after["points"] == 50, f"Expected 50 points, got {prof_after['points']}"
    assert prof_after["stamps"] == 1, f"Expected 1 stamp, got {prof_after['stamps']}"
    assert prof_after["total_visits"] == 1, f"Expected 1 visit, got {prof_after['total_visits']}"

    # Anti-fraud test: Duplicate checkin within 5 minutes must be rejected
    res8_dup = client.post("/api/customer/visits/checkin", json={
        "business_id": biz["id"]
    }, headers=headers_customer)
    assert res8_dup.status_code == 400
    assert "already checked in" in res8_dup.json()["detail"].lower()
    print("✅ TEST 8 PASSED: Check-in visit recorded, +50 pts/+1 stamp awarded, duplicate prevented.")

    # --- TEST 9: Multi-Tenant Role Isolation ---
    print("\n--- TEST 9: Role-Based Access Boundary Protection ---")
    # Customer trying to access business profile -> 403 Forbidden
    res9_forbidden_biz = client.get("/api/business/profile", headers=headers_customer)
    assert res9_forbidden_biz.status_code == 403, f"Expected 403, got {res9_forbidden_biz.status_code}"

    # Business Owner trying to access customer profile -> 403 Forbidden
    res9_forbidden_cus = client.get("/api/customer/profile", headers=headers_owner)
    assert res9_forbidden_cus.status_code == 403, f"Expected 403, got {res9_forbidden_cus.status_code}"
    print("✅ TEST 9 PASSED: Strict RBAC boundaries enforced between Customer and Business.")

    # --- TEST 9B: Business reservation ownership enforcement ---
    print("\n--- TEST 9B: Table reservation ownership and cross-business isolation ---")
    second_owner = client.post("/api/auth/owner/register", json={
        "name": "Second Business",
        "owner_name": "Second Owner",
        "email": "second_owner_isolation@example.com",
        "password": "Password@123"
    })
    assert second_owner.status_code == 200, f"Second owner registration failed: {second_owner.text}"
    second_owner_headers = {"Authorization": f"Bearer {second_owner.json()['access_token']}"}

    valid_table = client.post(
        "/api/tables",
        json={"table_number": "A1", "capacity": 4, "location": "Main Dining", "is_active": True},
        headers=headers_owner
    )
    assert valid_table.status_code == 200, f"Creating valid business table failed: {valid_table.text}"
    valid_table_id = valid_table.json()["id"]

    booking_date = "2026-10-11"
    booking_time = "19:30"
    booking_payload = {
        "business_id": biz["id"],
        "customer_name": "Isolation Customer",
        "customer_phone": "+919800000010",
        "customer_email": "isolation.customer@example.com",
        "booking_date": booking_date,
        "booking_time": booking_time,
        "guests": 2,
        "table_id": valid_table_id,
        "notes": "should be created under the real business only"
    }
    res9b_booking = client.post("/api/customer/table-reservations", json=booking_payload, headers=headers_customer)
    assert res9b_booking.status_code == 200, f"Customer booking creation failed: {res9b_booking.text}"

    reservation_id = res9b_booking.json()["id"]
    forbidden_list = client.get(f"/api/tables/reservations?business_id={biz['id']}", headers=second_owner_headers)
    assert forbidden_list.status_code in (403, 404), "Cross-business reservation list must be rejected."

    forbidden_update = client.patch(
        f"/api/tables/reservations/{reservation_id}/status",
        json={"status": "confirmed", "notes": "should fail"},
        headers=second_owner_headers
    )
    assert forbidden_update.status_code in (403, 404), "Cross-business status update must be rejected."
    print("✅ TEST 9B PASSED: Business owners cannot read or mutate reservations outside their own business.")

    # --- TEST 9C: Production-sensitive route authorization ---
    print("\n--- TEST 9C: Payment, upload, product, and scheduler authorization ---")
    anon_payment = client.post("/api/payments/upi/create", json={"amount": 1})
    assert anon_payment.status_code == 401, "Payment initiation must require authentication."
    client_amount_payment = client.post(
        "/api/payments/upi/create",
        json={"amount": 1, "business_id": biz["id"]},
        headers=headers_customer
    )
    assert client_amount_payment.status_code == 400, "A client-supplied amount without a persisted order must not create a payment."

    anon_upload = client.post(
        "/api/uploads/image",
        files={"file": ("image.png", b"not-an-image", "image/png")}
    )
    assert anon_upload.status_code == 401, "Image uploads must require authentication."

    cross_business_products = client.get(f"/api/business/{biz['id']}/products", headers=second_owner_headers)
    assert cross_business_products.status_code == 403, "Product catalog reads must verify business ownership."

    anon_customer_bookings = client.get(f"/api/tables/bookings/customer/{prof['customer_id']}")
    assert anon_customer_bookings.status_code == 401, "Legacy customer booking history must require authentication."

    owner_verify_attempt = client.post(
        "/api/subscriptions/payment/fake-payment/verify",
        json={"transaction_reference": "customer-claimed-reference"},
        headers=headers_owner
    )
    assert owner_verify_attempt.status_code == 403, "A business owner must not verify their own payment."

    owner_scheduler_attempt = client.post("/api/notifications/daily-job", headers=headers_owner)
    assert owner_scheduler_attempt.status_code == 403, "Global notification jobs must require administrator authorization."

    malformed_token = client.get("/api/customer/profile", headers={"Authorization": "Bearer malformed-token"})
    assert malformed_token.status_code == 401, "Malformed JWTs must be rejected."
    expired_token = create_access_token({"sub": "expired-test-user"}, expires_delta=timedelta(seconds=-1))
    expired_response = client.get("/api/customer/profile", headers={"Authorization": f"Bearer {expired_token}"})
    assert expired_response.status_code == 401, "Expired JWTs must be rejected."

    unsigned_google = client.post("/api/auth/google", json={"email": "victim@example.com", "google_id": "spoofed-id"})
    assert unsigned_google.status_code == 401, "Unsigned client-supplied Google identity must be rejected."

    onboarding_tamper = client.put("/api/onboarding/step", json={
        "step": 1,
        "data": {"name": "Changed", "owner_id": second_owner.json()["user"]["id"], "subscription_plan": "PREMIUM"}
    }, headers=headers_owner)
    assert onboarding_tamper.status_code == 400, "Onboarding must reject tenant/subscription identity fields."
    profile_tamper = client.put("/api/business/profile", json={
        "id": "another-business",
        "owner_id": second_owner.json()["user"]["id"],
        "subscription_plan": "PREMIUM",
        "name": "Owner Editable Name"
    }, headers=headers_owner)
    assert profile_tamper.status_code == 200
    assert profile_tamper.json()["id"] == biz["id"]
    assert profile_tamper.json()["owner_id"] == data1["user"]["id"]
    assert profile_tamper.json().get("subscription_plan") != "PREMIUM"

    unauthorized_qr_connect = client.post("/api/qr/connect", json={"business_id": biz["id"]}, headers=headers_owner)
    assert unauthorized_qr_connect.status_code == 403, "Non-customer roles must not create customer QR connections."
    cross_business_invite = client.post("/api/qr/invite/create", json={
        "business_id": second_owner.json()["business"]["id"],
        "email": "other-invite@example.com"
    }, headers=headers_owner)
    assert cross_business_invite.status_code == 403, "An owner cannot create an invite for another business."

    public_customer_qr = client.post("/api/qr/resolve", json={"qr_data": f"https://app.zoorup.com/customer/{prof['customer_id']}"})
    assert public_customer_qr.status_code == 200
    assert "customer_name" not in public_customer_qr.json(), "Public customer QR resolution must not disclose customer PII."

    # Login attempts are limited per identifier even when callers rotate request payloads/IPs.
    throttled_login = None
    for _ in range(9):
        throttled_login = client.post("/api/auth/customer/login", json={
            "email": "rate-limited-login@example.com",
            "password": "incorrect"
        })
    assert throttled_login.status_code == 429, "Repeated password login attempts must be rate limited."

    # Subscription payment is pending until a super-admin confirms independent UPI reconciliation.
    payment_start = client.post("/api/subscriptions/payment/initiate", json={
        "plan_id": "growth",
        "business_id": biz["id"],
        "price": 1
    }, headers=headers_owner)
    assert payment_start.status_code == 422, "Client-supplied plan price must be rejected."
    payment_start = client.post("/api/subscriptions/payment/initiate", json={
        "plan_id": "growth",
        "business_id": biz["id"]
    }, headers=headers_owner)
    assert payment_start.status_code == 200
    payment_id = payment_start.json()["payment_id"]
    assert payment_start.json()["amount"] == 799
    assert payment_start.json()["status"] == "pending"
    cross_business_payment = client.get(f"/api/subscriptions/payment/{payment_id}", headers=second_owner_headers)
    assert cross_business_payment.status_code == 403
    cross_business_initiation = client.post("/api/subscriptions/payment/initiate", json={
        "plan_id": "pro",
        "business_id": biz["id"]
    }, headers=second_owner_headers)
    assert cross_business_initiation.status_code == 403
    forbidden_admin_verify = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json={
        "utr": "UTR000000009999",
        "independently_reconciled": True
    }, headers=headers_owner)
    assert forbidden_admin_verify.status_code == 403

    admin_id = "security_test_admin_user"
    get_collection("users").insert_one({"id": admin_id, "role": "SUPER_ADMIN", "email": "security-admin@example.test"})
    admin_headers = {"Authorization": f"Bearer {create_access_token({'sub': admin_id})}"}
    missing_reconciliation = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json={
        "utr": "UTR000000009999"
    }, headers=admin_headers)
    assert missing_reconciliation.status_code == 400
    payment_still_pending = client.get(f"/api/subscriptions/payment/{payment_id}", headers=headers_owner)
    assert payment_still_pending.json()["status"] == "pending"
    forged_status = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json={
        "utr": "UTR000000009999",
        "status": "paid",
        "independently_reconciled": True
    }, headers=admin_headers)
    assert forged_status.status_code == 422
    reconciled = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json={
        "utr": "UTR000000009999",
        "independently_reconciled": True
    }, headers=admin_headers)
    assert reconciled.status_code == 200, f"Admin reconciliation failed: {reconciled.text}"
    duplicate_reconciliation = client.post(f"/api/subscriptions/payment/{payment_id}/verify", json={
        "utr": "UTR000000009999",
        "independently_reconciled": True
    }, headers=admin_headers)
    assert duplicate_reconciliation.status_code == 409
    assert reconciled.json()["status"] == "paid"
    print("✅ TEST 9C PASSED: Sensitive payment/upload APIs and cross-tenant routes enforce session ownership.")

    # --- TEST 9D: Server-authoritative order persistence and isolation ---
    print("\n--- TEST 9D: Server-authoritative orders, price validation, isolation, and idempotency ---")
    customer_a_res = client.post("/api/auth/customer/register", json={
        "name": "Order Customer A",
        "phone": "+919800000221",
        "email": "order.customer.a@example.com",
        "password": "Password@123"
    })
    assert customer_a_res.status_code == 200, f"Order customer A registration failed: {customer_a_res.text}"
    customer_a_headers = {"Authorization": f"Bearer {customer_a_res.json()['access_token']}"}

    customer_b_res = client.post("/api/auth/customer/register", json={
        "name": "Order Customer B",
        "phone": "+919800000222",
        "email": "order.customer.b@example.com",
        "password": "Password@123"
    })
    assert customer_b_res.status_code == 200, f"Order customer B registration failed: {customer_b_res.text}"
    customer_b_headers = {"Authorization": f"Bearer {customer_b_res.json()['access_token']}"}

    connect_customer_a = client.post("/api/customer/businesses/connect", json={"business_id": biz["id"]}, headers=customer_a_headers)
    assert connect_customer_a.status_code == 200, f"Customer A business connection failed: {connect_customer_a.text}"
    connect_customer_b = client.post("/api/customer/businesses/connect", json={"business_id": biz["id"]}, headers=customer_b_headers)
    assert connect_customer_b.status_code == 200, f"Customer B business connection failed: {connect_customer_b.text}"

    product_a_res = client.post("/api/business/{}/products".format(biz["id"]), json={
        "name": "Order Test Product A",
        "price": 150,
        "discount_price": 120,
        "active": True
    }, headers=headers_owner)
    assert product_a_res.status_code == 200, f"Business A product creation failed: {product_a_res.text}"
    product_a_id = product_a_res.json()["id"]

    product_b_res = client.post("/api/business/{}/products".format(second_owner.json()["business"]["id"]), json={
        "name": "Order Test Product B",
        "price": 75,
        "active": True
    }, headers=second_owner_headers)
    assert product_b_res.status_code == 200, f"Business B product creation failed: {product_b_res.text}"

    order_payload = {
        "business_id": biz["id"],
        "items": [{"product_id": product_a_id, "quantity": 2}],
        "order_type": "TAKEAWAY",
        "payment_method": "CASH",
        "idempotency_key": "device-attempt-order-a-0001"
    }
    created_order_res = client.post("/api/orders", json=order_payload, headers=customer_a_headers)
    assert created_order_res.status_code == 201, f"Order creation failed: {created_order_res.text}"
    created_order = created_order_res.json()
    assert created_order["customer_id"] == customer_a_res.json()["customer"]["customer_id"]
    assert created_order["business_id"] == biz["id"]
    assert created_order["items"][0]["price"] == 120.0, "Price must be loaded from the stored product, not client input."
    assert created_order["subtotal"] == 240.0
    assert created_order["tax"] == 12.0
    assert created_order["total"] == 252.0
    assert created_order["status"] == "NEW"

    duplicate_order_res = client.post("/api/orders", json=order_payload, headers=customer_a_headers)
    assert duplicate_order_res.status_code == 201
    assert duplicate_order_res.json()["id"] == created_order["id"], "Retrying with the same idempotency key must return the original order."

    price_tamper_payload = {**order_payload, "idempotency_key": "device-attempt-order-a-0002", "total": 1}
    price_tamper = client.post("/api/orders", json=price_tamper_payload, headers=customer_a_headers)
    assert price_tamper.status_code == 422, "Client totals must not be accepted as order authority."
    item_price_tamper_payload = {
        **order_payload,
        "idempotency_key": "device-attempt-order-a-0004",
        "items": [{"product_id": product_a_id, "quantity": 2, "price": 1}]
    }
    item_price_tamper = client.post("/api/orders", json=item_price_tamper_payload, headers=customer_a_headers)
    assert item_price_tamper.status_code == 422, "Client unit prices must not be accepted."
    identity_tamper_payload = {
        **order_payload,
        "idempotency_key": "device-attempt-order-a-0005",
        "customer_id": customer_b_res.json()["customer"]["customer_id"]
    }
    identity_tamper = client.post("/api/orders", json=identity_tamper_payload, headers=customer_a_headers)
    assert identity_tamper.status_code == 422, "Client customer IDs must not be accepted for order ownership."
    wrong_product_payload = {
        **order_payload,
        "idempotency_key": "device-attempt-order-a-0003",
        "items": [{"product_id": product_b_res.json()["id"], "quantity": 1}]
    }
    wrong_product = client.post("/api/orders", json=wrong_product_payload, headers=customer_a_headers)
    assert wrong_product.status_code == 400, "A customer cannot order another business's product under the selected business."

    customer_a_orders = client.get("/api/orders/my", headers=customer_a_headers)
    assert customer_a_orders.status_code == 200
    assert [item["id"] for item in customer_a_orders.json()] == [created_order["id"]]
    customer_a_detail = client.get(f"/api/orders/{created_order['id']}", headers=customer_a_headers)
    assert customer_a_detail.status_code == 200
    assert customer_a_detail.json()["customer_id"] == customer_a_res.json()["customer"]["customer_id"]
    customer_b_orders = client.get("/api/orders/my", headers=customer_b_headers)
    assert customer_b_orders.status_code == 200 and customer_b_orders.json() == []
    customer_b_detail = client.get(f"/api/orders/{created_order['id']}", headers=customer_b_headers)
    assert customer_b_detail.status_code == 404

    business_a_orders = client.get("/api/business/orders", headers=headers_owner)
    assert business_a_orders.status_code == 200
    assert [item["id"] for item in business_a_orders.json()] == [created_order["id"]]
    business_b_orders = client.get("/api/business/orders?business_id={}".format(biz["id"]), headers=second_owner_headers)
    assert business_b_orders.status_code == 200 and business_b_orders.json() == []
    business_b_detail = client.get(f"/api/business/orders/{created_order['id']}", headers=second_owner_headers)
    assert business_b_detail.status_code == 404
    customer_status_change = client.patch(
        f"/api/business/orders/{created_order['id']}/status",
        json={"status": "COMPLETED"},
        headers=customer_a_headers
    )
    assert customer_status_change.status_code == 403
    business_b_status_change = client.patch(
        f"/api/business/orders/{created_order['id']}/status",
        json={"status": "CONFIRMED"},
        headers=second_owner_headers
    )
    assert business_b_status_change.status_code == 404
    business_a_status_change = client.patch(
        f"/api/business/orders/{created_order['id']}/status",
        json={"status": "CONFIRMED"},
        headers=headers_owner
    )
    assert business_a_status_change.status_code == 200
    assert business_a_status_change.json()["status"] == "CONFIRMED"
    assert business_a_status_change.json()["payment_status"] == "PENDING", "Order status must not alter payment status."

    staff_user_id = "order_test_staff_no_permission"
    get_collection("users").insert_one({
        "id": staff_user_id,
        "role": "STAFF",
        "business_id": biz["id"],
        "permissions": ["products"]
    })
    staff_without_orders_token = create_access_token({"sub": staff_user_id})
    staff_without_orders = client.get("/api/business/orders", headers={"Authorization": f"Bearer {staff_without_orders_token}"})
    assert staff_without_orders.status_code == 403, "Staff without the orders permission must not access business orders."
    get_collection("users").update_one({"id": staff_user_id}, {"$set": {"permissions": ["orders"]}})
    staff_with_orders = client.get("/api/business/orders", headers={"Authorization": f"Bearer {staff_without_orders_token}"})
    assert staff_with_orders.status_code == 200
    assert [item["id"] for item in staff_with_orders.json()] == [created_order["id"]]

    staff_without_product_permission = client.get(
        f"/api/business/{biz['id']}/products",
        headers={"Authorization": f"Bearer {staff_without_orders_token}"}
    )
    assert staff_without_product_permission.status_code == 403
    table_staff_user_id = "order_test_staff_table_permission"
    get_collection("users").insert_one({
        "id": table_staff_user_id,
        "role": "STAFF",
        "business_id": biz["id"],
        "permissions": ["orders"]
    })
    table_staff_token = create_access_token({"sub": table_staff_user_id})
    table_staff_denied = client.get("/api/tables?business_id={}".format(biz["id"]), headers={"Authorization": f"Bearer {table_staff_token}"})
    assert table_staff_denied.status_code == 403, "Staff without table-booking permission must not manage tables."

    legacy_booking_id = res9b_booking.json()["id"]
    cross_customer_booking_history = client.get(
        f"/api/tables/bookings/customer/{customer_b_res.json()['customer']['customer_id']}",
        headers=customer_b_headers
    )
    assert cross_customer_booking_history.status_code == 200
    assert all(booking["id"] != legacy_booking_id for booking in cross_customer_booking_history.json())
    cross_customer_booking_cancel = client.post(
        f"/api/tables/bookings/{legacy_booking_id}/cancel",
        headers=customer_b_headers
    )
    assert cross_customer_booking_cancel.status_code == 403

    customer_a_relogin = client.post("/api/auth/customer/login", json={
        "email": "order.customer.a@example.com",
        "password": "Password@123"
    })
    assert customer_a_relogin.status_code == 200
    customer_a_new_session = {"Authorization": f"Bearer {customer_a_relogin.json()['access_token']}"}
    orders_after_relogin = client.get("/api/orders/my", headers=customer_a_new_session)
    assert orders_after_relogin.status_code == 200
    assert len(orders_after_relogin.json()) == 1
    assert orders_after_relogin.json()[0]["id"] == created_order["id"]

    customer_c_res = client.post("/api/auth/customer/register", json={
        "name": "Order Customer C",
        "phone": "+919800000223",
        "email": "order.customer.c@example.com",
        "password": "Password@123"
    })
    assert customer_c_res.status_code == 200
    customer_c_headers = {"Authorization": f"Bearer {customer_c_res.json()['access_token']}"}
    customer_c_orders = client.get("/api/orders/my", headers=customer_c_headers)
    assert customer_c_orders.status_code == 200 and customer_c_orders.json() == []

    for retry_index in range(9):
        duplicate_retry = client.post("/api/orders", json=order_payload, headers=customer_a_headers)
        assert duplicate_retry.status_code == 201
    rate_limited_order = client.post("/api/orders", json=order_payload, headers=customer_a_headers)
    assert rate_limited_order.status_code == 429, "Order creation must be rate limited per authenticated customer."
    print("✅ TEST 9D PASSED: Server-priced backend orders persist across login sessions and remain customer/business isolated.")

    # --- TEST 10: Voucher creation and customer visibility for eligible customers ---
    print("\n--- TEST 10: Voucher creation & customer scope isolation ---")
    voucher_payload = {
        "title": "Summer 10% Off",
        "description": "10% off for eligible connected customers",
        "discount_type": "PERCENTAGE",
        "discount_value": 10,
        "minimum_order_value": 100,
        "usage_limit": 1,
        "total_usage_limit": 100,
        "start_at": "2026-09-01T00:00:00",
        "expires_at": "2026-12-31T23:59:59",
        "audience_type": "ALL_ELIGIBLE",
        "status": "ACTIVE"
    }
    voucher_res = client.post("/api/business/vouchers", json=voucher_payload, headers=headers_owner)
    assert voucher_res.status_code == 200, f"Voucher creation failed: {voucher_res.text}"
    voucher = voucher_res.json()["voucher"]
    assert voucher["business_id"] == biz["id"]
    assert voucher["title"] == "Summer 10% Off"

    customer_vouchers = client.get("/api/customer/vouchers", headers=headers_customer)
    assert customer_vouchers.status_code == 200, f"Customer voucher fetch failed: {customer_vouchers.text}"
    customer_voucher_list = customer_vouchers.json()["vouchers"]
    assert any(v["voucher_id"] == voucher["voucher_id"] for v in customer_voucher_list), "Eligible connected customer did not receive voucher."

    # Create another customer not connected to business and ensure no voucher is visible
    new_phone = "+919800000099"
    otp_c = client.post("/api/auth/otp/request", json={"phone": new_phone})
    assert otp_c.status_code == 200
    verify_c = client.post("/api/auth/otp/verify", json={"phone": new_phone, "code": "123456"})
    assert verify_c.status_code == 200
    other_headers = {"Authorization": f"Bearer {verify_c.json()['access_token']}"}
    other_vouchers = client.get("/api/customer/vouchers", headers=other_headers)
    assert other_vouchers.status_code == 200
    assert not any(v["voucher_id"] == voucher["voucher_id"] for v in other_vouchers.json()["vouchers"]), "Unconnected customer should not see this business voucher."
    print("✅ TEST 10 PASSED: Voucher created and only eligible connected customer can view it.")

    # --- TEST 11: Voucher redemption rules and double redemption prevention ---
    print("\n--- TEST 11: Voucher redemption and expiry protection ---")
    redeem_res = client.post(f"/api/customer/vouchers/{voucher['voucher_id']}/redeem", headers=headers_customer)
    assert redeem_res.status_code == 200, f"Voucher redeem failed: {redeem_res.text}"
    redeemed = redeem_res.json()
    assert redeemed["success"] is True
    assert redeemed["status"] == "REDEEMED"

    duplicate_redeem = client.post(f"/api/customer/vouchers/{voucher['voucher_id']}/redeem", headers=headers_customer)
    assert duplicate_redeem.status_code == 400, "Single-use voucher should reject second redemption."

    expired_res = client.post(f"/api/customer/vouchers/{voucher['voucher_id']}/redeem", headers=headers_customer)
    assert expired_res.status_code == 400, "Expired or already used voucher should not be redeemable again."
    print("✅ TEST 11 PASSED: Redeem flow enforces single-use and prevents duplicate redemption.")

    # --- TEST 12: Business access isolation for voucher owner ---
    print("\n--- TEST 12: Business voucher isolation ---")
    other_biz = client.post("/api/auth/owner/register", json={
        "name": "Second Cafe",
        "owner_name": "Other Owner",
        "email": "other_business@example.com",
        "password": "Password@123"
    })
    assert other_biz.status_code == 200, f"Second business registration failed: {other_biz.text}"
    other_headers = {"Authorization": f"Bearer {other_biz.json()['access_token']}"}
    forbidden = client.post("/api/business/vouchers", json={
        "title": "Forbidden Voucher",
        "description": "should not be allowed",
        "discount_type": "FIXED",
        "discount_value": 50,
        "minimum_order_value": 200,
        "usage_limit": 1,
        "expires_at": "2026-12-31T23:59:59",
        "audience_type": "ALL_ELIGIBLE",
        "status": "ACTIVE"
    }, headers=other_headers)
    assert forbidden.status_code == 200, "Business owner should be able to create own voucher."
    tamper = client.put(f"/api/business/vouchers/{voucher['voucher_id']}", json={"title": "Tampered Title"}, headers=other_headers)
    assert tamper.status_code in (403, 404), "Cross-business voucher modification must be rejected."
    print("✅ TEST 12 PASSED: Business owners are restricted to their own vouchers.")

    # --- TEST 13: Business-scoped loyalty persistence and isolation ---
    print("\n--- TEST 13: Per-business loyalty persistence and cross-business isolation ---")
    second_business = client.post("/api/auth/owner/register", json={
        "name": "Second Loyalty Store",
        "owner_name": "Second Owner",
        "email": "second_loyalty@example.com",
        "password": "Password@123"
    })
    assert second_business.status_code == 200, f"Second business register failed: {second_business.text}"
    second_business_id = second_business.json()["business"]["id"]
    customer_login = client.post("/api/auth/customer/login", json={
        "email": "same.account.device@example.com",
        "password": "Password@123"
    })
    assert customer_login.status_code == 200, f"Persistent customer login failed: {customer_login.text}"
    customer_auth_headers = {"Authorization": f"Bearer {customer_login.json()['access_token']}"}
    customer_profile = customer_login.json()["customer"]

    connect_first = client.post("/api/customer/businesses/connect", json={"business_id": biz["id"]}, headers=customer_auth_headers)
    assert connect_first.status_code == 200, f"Connect to first business failed: {connect_first.text}"

    first_checkin = client.post("/api/customer/visits/checkin", json={
        "business_id": biz["id"],
        "notes": "Persistent customer first-business check-in"
    }, headers=customer_auth_headers)
    assert first_checkin.status_code == 200, f"First business check-in failed: {first_checkin.text}"

    connect_second = client.post("/api/customer/businesses/connect", json={"business_id": second_business_id}, headers=customer_auth_headers)
    assert connect_second.status_code == 200, f"Connect to second business failed: {connect_second.text}"

    second_checkin = client.post("/api/customer/visits/checkin", json={
        "business_id": second_business_id,
        "notes": "Second business loyalty check-in"
    }, headers=customer_auth_headers)
    assert second_checkin.status_code == 200, f"Second business check-in failed: {second_checkin.text}"

    first_loyalty = client.get(f"/api/loyalty/{biz['id']}", headers=customer_auth_headers)
    assert first_loyalty.status_code == 200, f"Get first business loyalty failed: {first_loyalty.text}"
    first_loyalty_data = first_loyalty.json()
    assert first_loyalty_data["customer_id"] == customer_profile["customer_id"]
    assert first_loyalty_data["business_id"] == biz["id"]
    assert first_loyalty_data["points"] == 50, f"Expected 50 points in first business, got {first_loyalty_data['points']}"
    assert first_loyalty_data["stamps"] == 1, f"Expected 1 stamp in first business, got {first_loyalty_data['stamps']}"

    second_loyalty = client.get(f"/api/loyalty/{second_business_id}", headers=customer_auth_headers)
    assert second_loyalty.status_code == 200, f"Get second business loyalty failed: {second_loyalty.text}"
    second_loyalty_data = second_loyalty.json()
    assert second_loyalty_data["customer_id"] == customer_profile["customer_id"]
    assert second_loyalty_data["business_id"] == second_business_id
    assert second_loyalty_data["points"] == 50, f"Expected 50 points in second business, got {second_loyalty_data['points']}"
    assert second_loyalty_data["stamps"] == 1, f"Expected 1 stamp in second business, got {second_loyalty_data['stamps']}"

    relogin = client.post("/api/auth/customer/login", json={
        "email": "same.account.device@example.com",
        "password": "Password@123"
    })
    assert relogin.status_code == 200, f"Customer re-login failed: {relogin.text}"
    reloaded_token = relogin.json()["access_token"]
    relogin_headers = {"Authorization": f"Bearer {reloaded_token}"}
    loyalty_after_login = client.get(f"/api/loyalty/{biz['id']}", headers=relogin_headers)
    assert loyalty_after_login.status_code == 200
    assert loyalty_after_login.json()["points"] == 50
    assert loyalty_after_login.json()["stamps"] == 1
    print("✅ TEST 13 PASSED: Loyalty is persisted per business and survives login refresh.")

    # --- TEST 14: Shared mobile login, CRM scope, stamp rewards, and relationship isolation ---
    print("\n--- TEST 14: Shared login, CRM scope, stamp rewards, and business isolation ---")
    shared_owner_login = client.post("/api/auth/login", json={
        "email": "owner_test_1@zoorup.io",
        "password": "Password@123",
        "role": "CUSTOMER",
    })
    assert shared_owner_login.status_code == 200
    assert shared_owner_login.json()["user"]["role"] == "BUSINESS_OWNER", "Role must come from the stored account."
    shared_owner_headers = {"Authorization": f"Bearer {shared_owner_login.json()['access_token']}"}

    second_owner_register = client.post("/api/auth/owner/register", json={
        "name": "Second Coffee Shop",
        "owner_name": "Second Owner",
        "email": "second.mobile.owner@example.com",
        "password": "Password@123",
    })
    assert second_owner_register.status_code == 200
    second_mobile_business_id = second_owner_register.json()["business"]["id"]
    second_mobile_owner_headers = {"Authorization": f"Bearer {second_owner_register.json()['access_token']}"}

    shared_customer_login = client.post("/api/auth/login", json={
        "email": "same.account.device@example.com",
        "password": "Password@123",
        "role": "BUSINESS_OWNER",
    })
    assert shared_customer_login.status_code == 200
    assert shared_customer_login.json()["user"]["role"] == "CUSTOMER", "Client role must not override stored role."
    shared_customer_headers = {"Authorization": f"Bearer {shared_customer_login.json()['access_token']}"}
    shared_customer_id = shared_customer_login.json()["customer"]["customer_id"]

    second_customer_register = client.post("/api/auth/customer/register", json={
        "name": "Customer Two",
        "email": "second.mobile.customer@example.com",
        "password": "Password@123",
    })
    assert second_customer_register.status_code == 200
    second_customer_headers = {"Authorization": f"Bearer {second_customer_register.json()['access_token']}"}
    second_customer_id = second_customer_register.json()["customer"]["customer_id"]

    set_stamp_card = client.put("/api/business/profile", json={
        "stamps_required": 1,
        "reward_description": "One free coffee",
    }, headers=shared_owner_headers)
    assert set_stamp_card.status_code == 200
    assert set_stamp_card.json()["stamps_required"] == 1
    invalid_stamp_target = client.put("/api/business/profile", json={"stamps_required": 0}, headers=shared_owner_headers)
    assert invalid_stamp_target.status_code == 400

    table_settings = client.put(
        f"/api/tables/settings?business_id={biz['id']}",
        json={"enabled": True, "slot_duration_mins": 60, "opening_time": "09:00", "closing_time": "21:00"},
        headers=shared_owner_headers,
    )
    assert table_settings.status_code == 200
    assert table_settings.json()["slot_duration_mins"] == 60
    cross_business_table_settings = client.get(
        f"/api/tables/settings?business_id={biz['id']}",
        headers=second_mobile_owner_headers,
    )
    assert cross_business_table_settings.status_code == 403

    customer_b_checkin = client.post("/api/customer/visits/checkin", json={
        "business_id": biz["id"],
    }, headers=second_customer_headers)
    assert customer_b_checkin.status_code == 200, customer_b_checkin.text
    assert customer_b_checkin.json()["reward_unlocked"]["title"] == "One free coffee"

    connect_customer_a_business_b = client.post("/api/customer/businesses/connect", json={
        "business_id": second_mobile_business_id,
    }, headers=shared_customer_headers)
    assert connect_customer_a_business_b.status_code == 200

    business_a_customers = client.get("/api/business/customers", headers=shared_owner_headers)
    assert business_a_customers.status_code == 200
    business_a_customer_ids = {item["customer_id"] for item in business_a_customers.json()["customers"]}
    assert {shared_customer_id, second_customer_id}.issubset(business_a_customer_ids)

    business_a_dashboard = client.get("/api/business/dashboard", headers=shared_owner_headers)
    assert business_a_dashboard.status_code == 200
    assert business_a_dashboard.json()["business"]["id"] == biz["id"]
    business_b_dashboard = client.get("/api/business/dashboard", headers=second_mobile_owner_headers)
    assert business_b_dashboard.status_code == 200
    assert business_b_dashboard.json()["business"]["id"] == second_mobile_business_id

    business_b_customers = client.get("/api/business/customers", headers=second_mobile_owner_headers)
    assert business_b_customers.status_code == 200
    business_b_customer_ids = {item["customer_id"] for item in business_b_customers.json()["customers"]}
    assert shared_customer_id in business_b_customer_ids
    assert second_customer_id not in business_b_customer_ids, "Business CRM must exclude unconnected customers."

    second_customer_loyalty = client.get(f"/api/loyalty/{biz['id']}", headers=second_customer_headers)
    assert second_customer_loyalty.status_code == 200
    assert second_customer_loyalty.json()["stamps"] == 1
    second_customer_other_business_loyalty = client.get(
        f"/api/loyalty/{second_mobile_business_id}", headers=second_customer_headers
    )
    assert second_customer_other_business_loyalty.status_code == 403

    customer_lookup = client.get(
        "/api/business/customers/lookup",
        params={"email": "second.mobile.customer@example.com"},
        headers=shared_owner_headers,
    )
    assert customer_lookup.status_code == 200
    assert customer_lookup.json()["customer_id"] == second_customer_id

    points_adjustment = client.post(
        f"/api/business/customers/{second_customer_id}/loyalty/adjust",
        json={"points_delta": 25},
        headers=shared_owner_headers,
    )
    assert points_adjustment.status_code == 200
    assert points_adjustment.json()["points"] == 75
    excessive_deduction = client.post(
        f"/api/business/customers/{second_customer_id}/loyalty/adjust",
        json={"points_delta": -100},
        headers=shared_owner_headers,
    )
    assert excessive_deduction.status_code == 400
    unchanged_loyalty = client.get(f"/api/loyalty/{biz['id']}", headers=second_customer_headers)
    assert unchanged_loyalty.status_code == 200
    assert unchanged_loyalty.json()["points"] == 75
    cross_business_points_adjustment = client.post(
        f"/api/business/customers/{second_customer_id}/loyalty/adjust",
        json={"points_delta": 25},
        headers=second_mobile_owner_headers,
    )
    assert cross_business_points_adjustment.status_code == 404

    redeemed_reward = client.post(
        f"/api/business/customers/{second_customer_id}/stamp-reward/redeem",
        headers=shared_owner_headers,
    )
    assert redeemed_reward.status_code == 200, redeemed_reward.text
    duplicate_reward = client.post(
        f"/api/business/customers/{second_customer_id}/stamp-reward/redeem",
        headers=shared_owner_headers,
    )
    assert duplicate_reward.status_code == 400
    cross_business_reward = client.post(
        f"/api/business/customers/{second_customer_id}/stamp-reward/redeem",
        headers=second_mobile_owner_headers,
    )
    assert cross_business_reward.status_code == 404

    relationship_count = len(get_collection("customer_businesses").find({
        "customer_id": shared_customer_id,
        "business_id": biz["id"],
    }))
    assert relationship_count == 1
    disconnect = client.delete(
        f"/api/business/customers/{shared_customer_id}",
        headers=second_mobile_owner_headers,
    )
    assert disconnect.status_code == 200
    business_b_customers_after_disconnect = client.get("/api/business/customers", headers=second_mobile_owner_headers)
    assert shared_customer_id not in {item["customer_id"] for item in business_b_customers_after_disconnect.json()["customers"]}
    reconnect = client.post(
        "/api/customer/businesses/connect",
        json={"business_id": second_mobile_business_id},
        headers=shared_customer_headers,
    )
    assert reconnect.status_code == 200
    assert reconnect.json()["already_connected"] is False
    assert len(get_collection("customer_businesses").find({
        "customer_id": shared_customer_id,
        "business_id": second_mobile_business_id,
    })) == 1
    print("✅ TEST 14 PASSED: Shared login, per-business CRM/loyalty, and one-time scoped reward redemption verified.")

    print("\n====================================================")
    print("ALL 14 BACKEND TESTS PASSED (100% SUCCESS)")
    print("====================================================")

if __name__ == "__main__":
    run_tests()
