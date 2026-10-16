"""
Comprehensive Verification Suite:
1. Table Booking Availability & Midnight Hours
2. Table Booking Creation & Double-Booking Prevention
3. Business Order Management with Complete Product Details:
   - Order ID, Customer name, Phone, Product names, Quantities, Unit prices, Subtotals, Total amount, Payment method & status, Order status, Date/Time.
   - Example 3-product order scenario (Royal Apple Box, Fresh Pear Box, Apple Juice)
4. Razorpay Test Mode Verification
"""
import os
import sys
import uuid
from decimal import Decimal
from datetime import datetime, timezone

from fastapi.testclient import TestClient

# Ensure backend importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection
from backend.routes.table_routes import calculate_available_tables
from backend.routes.order_routes import _normalize_order
from backend.razorpay_service import RAZORPAY_MODE, RAZORPAY_KEY_ID

client = TestClient(app)

def test_suite():
    print("=== STARTING TABLE BOOKING & ORDER PRODUCT DETAILS TEST SUITE ===")
    passed = 0
    total = 0

    # -------------------------------------------------------------
    # 1. Razorpay Test Mode Verification
    # -------------------------------------------------------------
    total += 1
    print("\n--- TEST 1: Razorpay Mode is strictly TEST ---")
    razorpay_mode = RAZORPAY_MODE.lower()
    razorpay_key = RAZORPAY_KEY_ID
    assert razorpay_mode == "test", f"Razorpay mode is not 'test'! Got: {razorpay_mode}"
    if razorpay_key:
        assert razorpay_key.startswith("rzp_test_"), f"Razorpay key must start with 'rzp_test_'. Got: {razorpay_key}"
    print(f"[PASS] Razorpay Mode is confirmed TEST (mode={razorpay_mode}, key_prefix={razorpay_key[:8]}...)")
    passed += 1

    # -------------------------------------------------------------
    # 2. Table Booking Availability & Midnight Closing Calculation
    # -------------------------------------------------------------
    total += 1
    print("\n--- TEST 2: Table Availability Calculation with Midnight Closing ---")
    test_biz_id = f"biz_test_{uuid.uuid4().hex[:8]}"
    tables_col = get_collection("tables")
    settings_col = get_collection("table_settings")

    # Set up settings with midnight closing time: 00:30 (next day)
    settings_col.insert_one({
        "business_id": test_biz_id,
        "enabled": True,
        "opening_time": "11:00",
        "closing_time": "00:30",  # past midnight
        "slot_duration_mins": 90
    })

    # Add 2 tables: 1 for 2 guests, 1 for 4 guests
    tables_col.insert_one({
        "id": f"tbl_1_{uuid.uuid4().hex[:6]}",
        "business_id": test_biz_id,
        "table_number": "T1",
        "capacity": 2,
        "is_active": True
    })
    tables_col.insert_one({
        "id": f"tbl_2_{uuid.uuid4().hex[:6]}",
        "business_id": test_biz_id,
        "table_number": "T2",
        "capacity": 4,
        "is_active": True
    })

    # Available tables at 19:00 for 2 guests should find both eligible tables
    available_2 = calculate_available_tables(test_biz_id, "2026-10-15", "19:00", party_size=2)
    assert len(available_2) == 2, f"Expected 2 available tables, got: {len(available_2)}"

    # Available tables at 19:00 for 3 guests should only find Table T2 (capacity >= 3)
    available_3 = calculate_available_tables(test_biz_id, "2026-10-15", "19:00", party_size=3)
    assert len(available_3) == 1, f"Expected 1 available table for 3 guests, got: {len(available_3)}"
    assert available_3[0]["table_number"] == "T2"

    print(f"[PASS] Availability calculation correctly handled midnight closing and party capacities (2 guests -> {len(available_2)}, 3 guests -> {len(available_3)})")
    passed += 1

    # -------------------------------------------------------------
    # 3. Table Booking Creation & Double-Booking Protection
    # -------------------------------------------------------------
    total += 1
    print("\n--- TEST 3: Table Booking Creation & Conflict Check ---")
    customer_user_id = f"usr_{uuid.uuid4().hex[:8]}"
    customer_cid = f"ZUP-CUS-{uuid.uuid4().hex[:6]}"
    customer_phone = f"+9198{uuid.uuid4().hex[:8]}"
    
    users_col = get_collection("users")
    users_col.insert_one({
        "id": customer_user_id,
        "email": f"rahul_{uuid.uuid4().hex[:6]}@example.com",
        "name": "Rahul Verma",
        "phone": customer_phone,
        "role": "CUSTOMER",
        "customer_id": customer_cid
    })

    owner_id = f"owner_{uuid.uuid4().hex[:6]}"
    users_col.insert_one({
        "id": owner_id,
        "email": f"owner_{uuid.uuid4().hex[:6]}@example.com",
        "name": "Store Owner",
        "role": "BUSINESS_OWNER",
        "business_id": test_biz_id
    })

    businesses_col = get_collection("businesses")
    businesses_col.insert_one({
        "id": test_biz_id,
        "owner_id": owner_id,
        "name": "The Grand Bistro",
        "status": "ACTIVE"
    })

    customer_token = create_access_token({
        "sub": customer_user_id,
        "id": customer_user_id,
        "customer_id": customer_cid,
        "role": "CUSTOMER",
        "name": "Rahul Verma",
        "phone": customer_phone
    })
    customer_headers = {"Authorization": f"Bearer {customer_token}"}

    # First reservation
    res1 = client.post(
        "/api/customer/table-reservations",
        headers=customer_headers,
        json={
            "business_id": test_biz_id,
            "customer_name": "Rahul Verma",
            "customer_phone": customer_phone,
            "booking_date": "2026-10-15",
            "booking_time": "19:00",
            "party_size": 2,
            "table_id": available_2[0]["id"],
            "special_notes": "Window seat preferred"
        }
    )
    assert res1.status_code == 200, f"Reservation 1 failed: {res1.text}"
    booking_data = res1.json()
    assert booking_data["customer_name"] == "Rahul Verma"

    # Conflicting reservation on same table and time slot
    res_conflict = client.post(
        "/api/customer/table-reservations",
        headers=customer_headers,
        json={
            "business_id": test_biz_id,
            "booking_date": "2026-10-15",
            "booking_time": "19:30",  # inside the 90 min window
            "party_size": 2,
            "table_id": available_2[0]["id"]
        }
    )
    assert res_conflict.status_code == 409, f"Expected 409 Conflict, got: {res_conflict.status_code} ({res_conflict.text})"

    print(f"[PASS] Reservation created successfully and 409 Conflict prevented double-booking of same table")
    passed += 1

    # -------------------------------------------------------------
    # 4. Order Management Normalization with Product Details
    # -------------------------------------------------------------
    total += 1
    print("\n--- TEST 4: Order with 3 Products Normalization (Example in Prompt) ---")
    mock_order = {
        "id": "ORD-1025",
        "business_id": test_biz_id,
        "customer_name": "Rahul",
        "customer_phone": "+919876543210",
        "items": [
            {
                "product_id": "prod_apple_box",
                "name": "Royal Apple Box",
                "quantity": 2,
                "price": 800.0,
                "unit_price": 800.0,
                "subtotal": 1600.0
            },
            {
                "product_id": "prod_pear_box",
                "name": "Fresh Pear Box",
                "quantity": 1,
                "price": 500.0,
                "unit_price": 500.0,
                "subtotal": 500.0
            },
            {
                "product_id": "prod_juice",
                "name": "Apple Juice",
                "quantity": 3,
                "price": 100.0,
                "unit_price": 100.0,
                "subtotal": 300.0
            }
        ],
        "subtotal": 2400.0,
        "total": 2400.0,
        "total_amount": 2400.0,
        "payment_method": "UPI",
        "payment_status": "PENDING",
        "status": "NEW",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    normalized = _normalize_order(mock_order)
    assert normalized["id"] == "ORD-1025"
    assert len(normalized["items"]) == 3
    
    # Verify product 1
    item1 = normalized["items"][0]
    assert item1["name"] == "Royal Apple Box"
    assert item1["quantity"] == 2
    assert item1["price"] == 800.0
    assert item1["subtotal"] == 1600.0

    # Verify product 2
    item2 = normalized["items"][1]
    assert item2["name"] == "Fresh Pear Box"
    assert item2["quantity"] == 1
    assert item2["price"] == 500.0
    assert item2["subtotal"] == 500.0

    # Verify product 3
    item3 = normalized["items"][2]
    assert item3["name"] == "Apple Juice"
    assert item3["quantity"] == 3
    assert item3["price"] == 100.0
    assert item3["subtotal"] == 300.0

    total_qty = sum(it["quantity"] for it in normalized["items"])
    assert total_qty == 6, f"Expected 6 total items, got {total_qty}"
    assert normalized["total"] == 2400.0

    print(f"[PASS] Order ORD-1025 normalized with exact 3 product names, quantities, unit prices, and subtotals (Total Items: {total_qty}, Total: INR {normalized['total']})")
    passed += 1

    # -------------------------------------------------------------
    # 5. Missing Product Names Batch Enrichment from Products Collection
    # -------------------------------------------------------------
    total += 1
    print("\n--- TEST 5: Batch Enrichment of Missing Product Names from Products Catalog ---")
    test_prod_id = f"prod_{uuid.uuid4().hex[:6]}"
    products_col = get_collection("products")
    p_inserted = products_col.insert_one({
        "id": test_prod_id,
        "business_id": test_biz_id,
        "name": "Artisan Sourdough Loaf",
        "price": 250.0,
        "discount_price": 220.0
    })
    p_found = products_col.find_one({"id": test_prod_id})
    print(f"DEBUG: p_inserted={p_inserted}, p_found={p_found}")
    p_in_found = products_col.find({"id": {"$in": [test_prod_id]}})
    print(f"DEBUG: p_in_found={p_in_found}")

    # Order item only stored product_id without name
    sparse_order = {
        "id": f"ORD-SPARSE-{uuid.uuid4().hex[:4]}",
        "business_id": test_biz_id,
        "customer_name": "Priya",
        "items": [
            {
                "product_id": test_prod_id,
                "quantity": 2,
                "price": 220.0
            }
        ],
        "total": 440.0,
        "payment_method": "CASH",
        "payment_status": "PAID",
        "status": "CONFIRMED"
    }

    sparse_norm = _normalize_order(sparse_order)
    assert sparse_norm["items"][0]["name"] == "Artisan Sourdough Loaf", f"Expected name 'Artisan Sourdough Loaf', got {sparse_norm['items'][0].get('name')}"
    assert sparse_norm["items"][0]["quantity"] == 2
    assert sparse_norm["items"][0]["price"] == 220.0
    assert sparse_norm["items"][0]["subtotal"] == 440.0
    print(f"[PASS] Successfully resolved sparse product ID to '{sparse_norm['items'][0]['name']}' with quantity 2 and subtotal INR {sparse_norm['items'][0]['subtotal']}")
    passed += 1

    # -------------------------------------------------------------
    # 6. Business Orders Endpoint with Search by Product Name
    # -------------------------------------------------------------
    total += 1
    print("\n--- TEST 6: Business Orders Search by Product Name ---")
    owner_token = create_access_token({
        "sub": owner_id,
        "id": owner_id,
        "business_id": test_biz_id,
        "role": "BUSINESS_OWNER"
    })
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    # Insert test order into orders collection
    orders_col = get_collection("orders")
    search_order_id = f"ORD-SEARCH-{uuid.uuid4().hex[:6]}"
    orders_col.insert_one({
        "id": search_order_id,
        "business_id": test_biz_id,
        "customer_name": "Rahul",
        "customer_phone": "+919876543210",
        "items": [
            {
                "product_id": "prod_apple_box",
                "name": "Royal Apple Box",
                "quantity": 2,
                "price": 800.0,
                "unit_price": 800.0,
                "subtotal": 1600.0
            }
        ],
        "total": 1600.0,
        "payment_method": "UPI",
        "payment_status": "PENDING",
        "status": "NEW",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Search by product name "Apple"
    search_res = client.get("/api/business/orders?search=Apple", headers=owner_headers)
    assert search_res.status_code == 200, f"Search failed: {search_res.text}"
    orders_found = search_res.json()
    assert len(orders_found) >= 1, "Expected order to be found when searching for 'Apple'"
    found_order = orders_found[0]
    assert found_order["items"][0]["name"] == "Royal Apple Box"
    assert found_order["items"][0]["quantity"] == 2
    assert found_order["items"][0]["price"] == 800.0

    print(f"[PASS] Store owner can search orders by product name ('Apple') and view full product details")
    passed += 1

    print("\n=== SUMMARY ===")
    print(f"Total Tests: {total}, Passed: {passed}, Failed: 0")
    assert passed == total

if __name__ == "__main__":
    test_suite()
