"""
ZOOR UP QR System Comprehensive Test Suite
Tests:
1. Standard HTTPS QR resolution (/b/{id}, /b/{id}/menu, /b/{id}/table/{tbl}, /b/{id}/checkin, /b/{id}/join)
2. JSON & legacy format resolution
3. Non-existent business safe 404 handling
4. Inactive/suspended business safe 400 handling
5. Public storefront & catalog hub (/api/public/b/{id})
6. Multi-tenant customer isolation & duplicate connection prevention (/api/qr/connect)
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
    print("=" * 65)
    print("RUNNING ZOOR UP QR SYSTEM VERIFICATION SUITE")
    print("=" * 65)

    biz_col = get_collection("businesses")
    prod_col = get_collection("products")
    cb_col = get_collection("customer_businesses")
    users_col = get_collection("users")

    # 1. SETUP TEST BUSINESSES
    active_biz_id = f"test_biz_act_{uuid.uuid4().hex[:8]}"
    active_biz_slug = f"cafe-active-{uuid.uuid4().hex[:4]}"
    active_biz = {
        "id": active_biz_id,
        "owner_id": f"owner_{uuid.uuid4().hex[:8]}",
        "slug": active_biz_slug,
        "name": "Cafe Delight",
        "status": "ACTIVE",
        "category": "Cafe",
        "city": "Mumbai",
        "upi_id": "8521893325@ybl",
        "stamps_required": 10,
        "reward_description": "Free Cappuccino"
    }
    biz_col.insert_one(active_biz)

    # Insert a product for active biz
    prod_col.insert_one({
        "id": f"prod_{uuid.uuid4().hex[:8]}",
        "business_id": active_biz_id,
        "name": "Artisan Latte",
        "price": 220,
        "is_available": True
    })

    inactive_biz_id = f"test_biz_inact_{uuid.uuid4().hex[:8]}"
    inactive_biz_slug = f"diner-suspended-{uuid.uuid4().hex[:4]}"
    inactive_biz = {
        "id": inactive_biz_id,
        "owner_id": f"owner_{uuid.uuid4().hex[:8]}",
        "slug": inactive_biz_slug,
        "name": "Suspended Diner",
        "status": "SUSPENDED"
    }
    biz_col.insert_one(inactive_biz)

    # Customers
    cus_a_id = f"cus_a_{uuid.uuid4().hex[:8]}"
    cus_b_id = f"cus_b_{uuid.uuid4().hex[:8]}"
    users_col.insert_one({"id": cus_a_id, "role": "customer", "name": "Customer Alice"})
    users_col.insert_one({"id": cus_b_id, "role": "customer", "name": "Customer Bob"})
    token_a = create_access_token({"id": cus_a_id, "role": "customer", "customer_id": cus_a_id})
    token_b = create_access_token({"id": cus_b_id, "role": "customer", "customer_id": cus_b_id})
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # -------------------------------------------------------------
    # TEST 1: GET /api/qr/resolve — Standard HTTPS URLs
    # -------------------------------------------------------------
    print("\n--- TEST 1: GET /api/qr/resolve with Standard HTTPS URLs ---")
    
    # 1.1 Storefront Hub
    hub_url = f"https://zoor-up-9b3a3.web.app/b/{active_biz_slug}"
    res = client.get(f"/api/qr/resolve?url={hub_url}")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["valid"] is True
    assert data["business_id"] == active_biz_id
    assert data["business_slug"] == active_biz_slug
    assert data["destination"] == f"/b/{active_biz_slug}"
    print("  [PASS] Storefront Hub QR (/b/{id}) resolved correctly")

    # 1.2 Menu QR
    menu_url = f"https://app.zoorup.com/b/{active_biz_id}/menu"
    res = client.get(f"/api/qr/resolve?url={menu_url}")
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["type"] == "MENU"
    assert data["destination"] == f"/b/{active_biz_slug}/menu"
    print("  [PASS] Menu QR (/b/{id}/menu) resolved correctly")

    # 1.3 Table Dine-In QR
    tbl_url = f"https://app.zoorup.com/b/{active_biz_slug}/table/T-12"
    res = client.get(f"/api/qr/resolve?url={tbl_url}")
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["type"] == "TABLE"
    assert data["table_id"] == "T-12"
    assert data["destination"] == f"/b/{active_biz_slug}/table/T-12"
    print("  [PASS] Table QR (/b/{id}/table/T-12) resolved correctly")

    # 1.4 Express Check-In QR
    checkin_url = f"https://app.zoorup.com/b/{active_biz_id}/checkin"
    res = client.get(f"/api/qr/resolve?url={checkin_url}")
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["type"] == "CHECKIN"
    assert data["destination"] == f"/b/{active_biz_slug}/checkin"
    print("  [PASS] Check-in QR (/b/{id}/checkin) resolved correctly")

    # 1.5 Loyalty / Join QR
    join_url = f"https://zoor-up-9b3a3.web.app/b/{active_biz_slug}/join"
    res = client.get(f"/api/qr/resolve?url={join_url}")
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["type"] == "LOYALTY"
    assert data["destination"] == f"/b/{active_biz_slug}/join"
    print("  [PASS] Loyalty QR (/b/{id}/join) resolved correctly")

    # -------------------------------------------------------------
    # TEST 2: POST /api/qr/resolve — JSON & Legacy Formats
    # -------------------------------------------------------------
    print("\n--- TEST 2: POST /api/qr/resolve with JSON & Legacy Formats ---")
    
    # 2.1 JSON Payload
    json_qr = f'{{"v": 1, "type": "menu", "business_id": "{active_biz_id}"}}'
    res = client.post("/api/qr/resolve", json={"qr_data": json_qr})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["type"] == "MENU"
    print("  [PASS] JSON QR payload resolved correctly")

    # 2.2 Legacy /menu/{slug}
    legacy_qr = f"https://app.zoorup.com/menu/{active_biz_slug}"
    res = client.post("/api/qr/resolve", json={"qr_data": legacy_qr})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["destination"] == f"/b/{active_biz_slug}/menu"
    print("  [PASS] Legacy /menu/ URL resolved correctly")

    # -------------------------------------------------------------
    # TEST 3: Safe Error Handling for Unknown & Inactive Businesses
    # -------------------------------------------------------------
    print("\n--- TEST 3: Safe Error Handling (No 500s or Crashes) ---")
    
    # 3.1 Non-existent Business via GET
    res = client.get("/api/qr/resolve?url=https://app.zoorup.com/b/non-existent-biz-999")
    assert res.status_code == 404, f"Expected 404, got {res.status_code}"
    assert "detail" in res.json()
    print("  [PASS] Unknown business returns safe 404 via GET")

    # 3.2 Non-existent Business via POST
    res = client.post("/api/qr/resolve", json={"qr_data": "https://app.zoorup.com/b/non-existent-biz-999"})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False
    assert "error" in data
    print("  [PASS] Unknown business returns valid=False via POST")

    # 3.3 Inactive/Suspended Business via GET
    res = client.get(f"/api/qr/resolve?url=https://app.zoorup.com/b/{inactive_biz_slug}")
    assert res.status_code == 400
    assert "inactive" in res.json()["detail"].lower()
    print("  [PASS] Suspended business returns safe 400 via GET")

    # 3.4 Inactive/Suspended Business via POST
    res = client.post("/api/qr/resolve", json={"qr_data": f"https://app.zoorup.com/b/{inactive_biz_slug}"})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False
    assert "inactive" in data["error"].lower()
    print("  [PASS] Suspended business returns valid=False via POST")

    # -------------------------------------------------------------
    # TEST 4: Public Business Hub & Catalog
    # -------------------------------------------------------------
    print("\n--- TEST 4: Public Business Hub (/api/public/b/{id}) ---")
    res = client.get(f"/api/public/b/{active_biz_slug}")
    assert res.status_code == 200
    hub_data = res.json()
    assert hub_data["id"] == active_biz_id
    assert hub_data["name"] == "Cafe Delight"
    assert len(hub_data["catalog"]) >= 1
    assert hub_data["catalog"][0]["name"] == "Artisan Latte"
    print("  [PASS] Public business hub returned store details and catalog items")

    # -------------------------------------------------------------
    # TEST 5: Customer Connection & Multi-Tenant Isolation
    # -------------------------------------------------------------
    print("\n--- TEST 5: Multi-Tenant Customer Connection & Uniqueness ---")
    
    # 5.1 Customer A connects to Business A
    connect_payload = {
        "business_id": active_biz_id,
        "type": "business",
        "source": "qr_scan"
    }
    res = client.post("/api/qr/connect", json=connect_payload, headers=headers_a)
    assert res.status_code == 200
    c_data = res.json()
    assert c_data["success"] is True
    assert c_data["business_id"] == active_biz_id
    assert c_data["customer_id"] == cus_a_id
    print("  [PASS] Customer A successfully connected to Business A")

    # 5.2 Verify Customer B is NOT connected (Multi-Tenant Isolation)
    b_conn = cb_col.find_one({"customer_id": cus_b_id, "business_id": active_biz_id})
    assert b_conn is None, "Customer B should NOT be connected to Business A!"
    print("  [PASS] Customer B is isolated and NOT attached to Business A")

    # 5.3 Duplicate Connection Prevention (Idempotent)
    res = client.post("/api/qr/connect", json=connect_payload, headers=headers_a)
    assert res.status_code == 200
    c_data2 = res.json()
    assert c_data2["success"] is True
    assert c_data2["already_connected"] is True

    # Count records in DB to ensure strictly 1 record exists
    matching = cb_col.find({"customer_id": cus_a_id, "business_id": active_biz_id})
    count = len(matching) if isinstance(matching, list) else len(list(matching))
    assert count == 1, f"Expected exactly 1 customer_business record, found {count}"
    print("  [PASS] Duplicate connection prevented: exactly 1 relationship record exists")

    # 5.4 Check-in rate-limiting (5-minute cooldown)
    checkin_payload = {
        "business_id": active_biz_id,
        "type": "checkin",
        "source": "qr_scan"
    }
    # First check-in
    res1 = client.post("/api/qr/connect", json=checkin_payload, headers=headers_a)
    assert res1.status_code == 200
    # Second check-in immediately after
    res2 = client.post("/api/qr/connect", json=checkin_payload, headers=headers_a)
    assert res2.status_code == 200
    res2_data = res2.json()
    assert res2_data["already_checked_in"] is True
    assert res2_data["stamps_awarded"] == 0
    print("  [PASS] Duplicate check-in visit rate-limiting (5 min) verified")

    print("\n" + "=" * 65)
    print("ALL ZOOR UP QR SYSTEM VERIFICATION TESTS PASSED SUCCESSFULLY! (100%)")
    print("=" * 65)

if __name__ == "__main__":
    run_tests()
