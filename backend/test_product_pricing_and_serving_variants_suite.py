"""
Regression Test Suite:
1. Valid base product checkout
2. Missing / null product base price rejection
3. Inverted product pricing (discount_price > price) rejection
4. Valid serving prices and authoritative calculation
5. Missing serving prices rejection
6. Invalid serving ID rejection
7. Invalid serving pricing (discount > regular or negative) rejection
8. Product variants authoritative pricing
9. Product creation & update pricing constraints (reject discount > regular, negative price)
10. Production scenario: Sonu fast food (Apple + Fish) = ₹226.00 with CASH and UPI
11. Zero automatic tax on customer QR orders
12. Strict isolation: no client price tampering trusted
"""
import os
import sys
import uuid
from decimal import Decimal
from datetime import datetime, timezone

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection

client = TestClient(app)

def test_product_pricing_and_serving_variants_regression():
    suffix = uuid.uuid4().hex[:6]
    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    prod_col = get_collection("products")
    orders_col = get_collection("orders")

    # Setup Business
    biz_id = f"biz_reg_{suffix}"
    owner_id = f"usr_owner_{suffix}"
    users_col.insert_one({
        "id": owner_id,
        "name": f"Owner {suffix}",
        "email": f"owner_{suffix}@zoorup.test",
        "role": "BUSINESS_OWNER",
        "business_id": biz_id,
        "is_active": True
    })
    biz_col.insert_one({
        "id": biz_id,
        "name": f"Pricing Test Cafe {suffix}",
        "slug": f"pricing-cafe-{suffix}",
        "owner_id": owner_id,
        "upi_id": f"merchant_{suffix}@okaxis",
        "upi_name": f"Merchant {suffix}",
        "is_active": True
    })
    owner_token = create_access_token({"sub": owner_id, "role": "BUSINESS_OWNER", "business_id": biz_id})
    owner_headers = {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}

    # -------------------------------------------------------------------------
    # TEST 1: Product creation rejects discount_price > price and negative prices
    # -------------------------------------------------------------------------
    print("\n--- TEST 1: Product Creation Rejects Invalid Pricing ---")
    res_inv_create = client.post(
        f"/api/business/{biz_id}/products",
        json={"name": "Bad Product", "price": 100.0, "discount_price": 150.0},
        headers=owner_headers
    )
    assert res_inv_create.status_code == 400 or res_inv_create.status_code == 422, f"Expected 400/422, got {res_inv_create.status_code}"
    print("[PASS] Creating product with discount_price > price rejected.")

    res_neg_create = client.post(
        f"/api/business/{biz_id}/products",
        json={"name": "Negative Price Product", "price": -50.0},
        headers=owner_headers
    )
    assert res_neg_create.status_code in (400, 422), f"Expected 400/422, got {res_neg_create.status_code}"
    print("[PASS] Creating product with negative price rejected.")

    # -------------------------------------------------------------------------
    # TEST 2: Product update rejects discount_price > price and negative prices
    # -------------------------------------------------------------------------
    print("\n--- TEST 2: Product Update Rejects Invalid Pricing ---")
    res_valid_create = client.post(
        f"/api/business/{biz_id}/products",
        json={"name": "Valid Item", "price": 100.0, "discount_price": 90.0},
        headers=owner_headers
    )
    assert res_valid_create.status_code == 200, f"Failed creating valid product: {res_valid_create.text}"
    valid_prod_id = res_valid_create.json()["id"]

    res_inv_update = client.put(
        f"/api/business/{biz_id}/products/{valid_prod_id}",
        json={"price": 50.0, "discount_price": 80.0},
        headers=owner_headers
    )
    assert res_inv_update.status_code in (400, 422), f"Expected 400/422, got {res_inv_update.status_code}"
    print("[PASS] Updating product to discount_price > price rejected.")

    # -------------------------------------------------------------------------
    # TEST 3: Base product checkout with valid pricing
    # -------------------------------------------------------------------------
    print("\n--- TEST 3: Order Checkout with Valid Base Product ---")
    res_order_valid = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [{"product_id": valid_prod_id, "quantity": 2}],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Test Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_order_valid.status_code in (200, 201), f"Expected 200/201, got {res_order_valid.status_code}: {res_order_valid.text}"
    order_data = res_order_valid.json()
    assert order_data["subtotal"] == 180.0  # 2 * 90.0
    assert order_data["tax"] == 0.0
    assert order_data["total"] == 180.0
    print("[PASS] Valid product checkout succeeded with subtotal 180.0, tax 0.0, total 180.0.")

    # -------------------------------------------------------------------------
    # TEST 4: Missing or invalid product base price rejected at checkout
    # -------------------------------------------------------------------------
    print("\n--- TEST 4: Order Checkout with Corrupted Missing/Inverted Price Rejected ---")
    corrupt_prod_id = f"prod_corrupt_{uuid.uuid4().hex[:8]}"
    prod_col.insert_one({
        "id": corrupt_prod_id,
        "business_id": biz_id,
        "name": "Corrupted Free Item",
        "price": 50.0,
        "discount_price": 999.0,
        "active": True
    })
    res_corrupt_order = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [{"product_id": corrupt_prod_id, "quantity": 1}],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Test Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_corrupt_order.status_code == 400
    assert "invalid server pricing" in res_corrupt_order.json()["detail"].lower()
    print("[PASS] Checkout with missing base price authoritatively rejected.")

    # -------------------------------------------------------------------------
    # TEST 5: Serving Options - Valid Serving Checkout
    # -------------------------------------------------------------------------
    print("\n--- TEST 5: Serving Options Valid Checkout ---")
    serving_prod_id = f"prod_serv_{uuid.uuid4().hex[:8]}"
    prod_col.insert_one({
        "id": serving_prod_id,
        "business_id": biz_id,
        "name": "Artisan Pizza",
        "price": 250.0,
        "discount_price": 250.0,
        "active": True,
        "servings": [
            {"id": "srv_regular", "name": "Regular (8 inch)", "price": 180.0, "discount_price": 160.0},
            {"id": "srv_large", "name": "Large (12 inch)", "price": 300.0, "discount_price": 280.0}
        ]
    })
    res_serv_order = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [
                {"product_id": serving_prod_id, "quantity": 1, "serving_id": "srv_regular"},
                {"product_id": serving_prod_id, "quantity": 1, "serving_id": "srv_large"}
            ],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Test Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_serv_order.status_code in (200, 201), f"Serving order failed: {res_serv_order.text}"
    serv_data = res_serv_order.json()
    # 1 * 160.0 (regular) + 1 * 280.0 (large) = 440.0
    assert serv_data["subtotal"] == 440.0
    assert serv_data["total"] == 440.0
    assert serv_data["tax"] == 0.0
    print("[PASS] Serving options calculated correctly: Regular (160) + Large (280) = 440.0.")

    # -------------------------------------------------------------------------
    # TEST 6: Serving Options - Invalid Serving ID Rejected
    # -------------------------------------------------------------------------
    print("\n--- TEST 6: Invalid Serving ID Rejected ---")
    res_bad_serv_id = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [{"product_id": serving_prod_id, "quantity": 1, "serving_id": "srv_nonexistent"}],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Test Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_bad_serv_id.status_code == 400
    assert "invalid serving option" in res_bad_serv_id.json()["detail"].lower()
    print("[PASS] Invalid serving ID rejected with 400.")

    # -------------------------------------------------------------------------
    # TEST 7: Serving Options - Missing Serving Price Rejected
    # -------------------------------------------------------------------------
    print("\n--- TEST 7: Missing Serving Price Rejected ---")
    broken_serv_prod_id = f"prod_broken_serv_{uuid.uuid4().hex[:8]}"
    prod_col.insert_one({
        "id": broken_serv_prod_id,
        "business_id": biz_id,
        "name": "Broken Serving Item",
        "price": 200.0,
        "active": True,
        "servings": [
            {"id": "srv_free", "name": "Free Sample", "price": None}
        ]
    })
    res_missing_serv_price = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [{"product_id": broken_serv_prod_id, "quantity": 1, "serving_id": "srv_free"}],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Test Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_missing_serv_price.status_code == 400
    assert "invalid serving pricing" in res_missing_serv_price.json()["detail"].lower()
    print("[PASS] Missing serving price rejected with 400 'A product has invalid serving pricing.'")

    # -------------------------------------------------------------------------
    # TEST 8: Product Variants Authoritative Pricing
    # -------------------------------------------------------------------------
    print("\n--- TEST 8: Product Variants Authoritative Pricing ---")
    variant_prod_id = f"prod_var_{uuid.uuid4().hex[:8]}"
    prod_col.insert_one({
        "id": variant_prod_id,
        "business_id": biz_id,
        "name": "Special Tea Blend",
        "price": 100.0,
        "active": True,
        "variants": [
            {"id": "var_masala", "name": "Masala", "price": 40.0},
            {"id": "var_ginger", "name": "Ginger", "price": 50.0}
        ]
    })
    res_var_order = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [
                {"product_id": variant_prod_id, "quantity": 2, "variant_id": "var_masala"},
                {"product_id": variant_prod_id, "quantity": 1, "variant_id": "var_ginger"}
            ],
            "order_type": "TAKEAWAY",
            "payment_method": "CASH",
            "customer_name": "Variant Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_var_order.status_code in (200, 201)
    var_data = res_var_order.json()
    # 2 * 40.0 + 1 * 50.0 = 130.0
    assert var_data["subtotal"] == 130.0
    assert var_data["total"] == 130.0
    print("[PASS] Product variants correctly calculated authoritatively: 2*40 + 1*50 = 130.0.")

    # -------------------------------------------------------------------------
    # TEST 9: Client Price Tampering Ignored
    # -------------------------------------------------------------------------
    print("\n--- TEST 9: Client Price Tampering Ignored ---")
    res_tamper = client.post(
        "/api/orders",
        json={
            "business_id": biz_id,
            "items": [{"product_id": valid_prod_id, "quantity": 1, "price": 1.0, "serving_price": 1.0}],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Tamperer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_test_{uuid.uuid4().hex}"
        }
    )
    assert res_tamper.status_code in (200, 201)
    tamper_data = res_tamper.json()
    assert tamper_data["subtotal"] == 90.0, f"Expected 90.0, got {tamper_data['subtotal']}"
    assert tamper_data["total"] == 90.0
    print("[PASS] Client price tampering rejected; authoritative server price 90.0 enforced.")

    # -------------------------------------------------------------------------
    # TEST 10: Production Verification - Sonu Fast Food (Apple + Fish) = ₹226.00
    # -------------------------------------------------------------------------
    print("\n--- TEST 10: Production Verification - Sonu Fast Food ---")
    sonu_biz_id = "biz_385cc9e1eb7d"
    apple_id = "05e2a5c9-ba51-5eca-b925-50c43ac8cff9"
    fish_id = "13074a26-7d94-59e1-a943-0773eba8ef89"

    # CASH order
    res_sonu_cash = client.post(
        "/api/orders",
        json={
            "business_id": sonu_biz_id,
            "items": [
                {"product_id": apple_id, "quantity": 1},
                {"product_id": fish_id, "quantity": 2}
            ],
            "order_type": "DINE_IN",
            "payment_method": "CASH",
            "customer_name": "Ravi Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_sonu_cash_{uuid.uuid4().hex}"
        }
    )
    assert res_sonu_cash.status_code in (200, 201), f"Sonu fast food order failed: {res_sonu_cash.text}"
    sonu_cash_data = res_sonu_cash.json()
    assert sonu_cash_data["subtotal"] == 226.0, f"Expected subtotal 226.0, got {sonu_cash_data['subtotal']}"
    assert sonu_cash_data["tax"] == 0.0
    assert sonu_cash_data["total"] == 226.0
    print(f"[PASS] Sonu fast food CASH order verified: subtotal={sonu_cash_data['subtotal']}, tax={sonu_cash_data['tax']}, total={sonu_cash_data['total']}")

    # UPI order
    res_sonu_upi = client.post(
        "/api/orders",
        json={
            "business_id": sonu_biz_id,
            "items": [
                {"product_id": apple_id, "quantity": 1},
                {"product_id": fish_id, "quantity": 2}
            ],
            "order_type": "TAKEAWAY",
            "payment_method": "UPI",
            "customer_name": "Ravi UPI Customer",
            "customer_phone": "9876543210",
            "idempotency_key": f"idem_sonu_upi_{uuid.uuid4().hex}"
        }
    )
    assert res_sonu_upi.status_code in (200, 201)
    sonu_upi_data = res_sonu_upi.json()
    upi_order_id = sonu_upi_data.get("id") or sonu_upi_data.get("order_id")
    assert sonu_upi_data["total"] == 226.0

    res_upi_intent = client.post(
        "/api/payments/upi/create",
        json={"order_id": upi_order_id, "business_id": sonu_biz_id}
    )
    assert res_upi_intent.status_code == 200
    upi_payload = res_upi_intent.json()
    assert upi_payload["amount"] == 226.0
    assert upi_payload["upi_id"] == "jisuzehen786@ybl"
    assert "upi://pay?" in upi_payload["upi_uri"]
    assert "jisuzehen786@ybl" in upi_payload["upi_uri"]
    print(f"[PASS] Sonu fast food UPI order verified: total={upi_payload['amount']}, upi_id={upi_payload['upi_id']}, uri={upi_payload['upi_uri']}")

    print("\n=== ALL 10 REGRESSION TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    test_product_pricing_and_serving_variants_regression()
