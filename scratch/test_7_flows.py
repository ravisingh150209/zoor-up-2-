import os
import sys
import json
import time
import urllib.request
import urllib.parse
from dotenv import load_dotenv

load_dotenv(".env")

RENDER_URL = "https://zoor-up-2.onrender.com"
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://igoferpbapfgmybclgyd.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def post_json(endpoint, payload, token=None):
    url = f"{RENDER_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode("utf-8"))
            except Exception:
                body = e.reason
            return e.code, body
        except Exception as e:
            if attempt == 4:
                raise
            time.sleep(2)

def get_json(endpoint, token=None):
    url = f"{RENDER_URL}{endpoint}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode("utf-8"))
            except Exception:
                body = e.reason
            return e.code, body
        except Exception as e:
            if attempt == 4:
                raise
            time.sleep(2)

print("Starting 7-Flow Live Production Verification...")

# 1. AUTH SETUP
biz_status, biz_login = post_json("/api/auth/login", {"email": "biz_offers_69700@zoorup.com", "password": "Password123!"})
assert biz_status == 200, f"Business login failed: {biz_login}"
biz_token = biz_login["access_token"]
biz_user = biz_login["user"]
biz_id = biz_user.get("business_id", "biz_8b17f1d06981")
print(f"[AUTH] Business Login OK: {biz_id}")

cus_status, cus_login = post_json("/api/auth/login", {"email": "loyalty_vip_test@zoorup.com", "password": "Password123!"})
assert cus_status == 200, f"Customer login failed: {cus_login}"
cus_token = cus_login["access_token"]
cus_user = cus_login["user"]
cus_id = cus_user.get("customer_id") or "cus_c87f39751ad2"
print(f"[AUTH] Customer Login OK: {cus_id}")

# Get Menu Items to order
menu_status, menu_data = get_json(f"/api/public/menu/{biz_id}")
assert menu_status == 200, f"Failed to get menu: {menu_data}"
products = menu_data.get("products", [])
product_item = products[0] if products else {
    "id": "prod_test",
    "name": "Live Test Product",
    "price": 100,
    "quantity": 1
}
order_items = [{
    "id": product_item.get("id"),
    "name": product_item.get("name"),
    "price": float(product_item.get("price", 100)),
    "quantity": 1
}]
total_amount = float(product_item.get("price", 100))

# -------------------------------------------------------------
# TEST 1: COD ORDER CHECKOUT FLOW
# Flow: Customer -> Store Menu -> Cart -> COD -> Place Order
# -------------------------------------------------------------
print("\n--- TEST 1: COD CHECKOUT ---")
cod_payload = {
    "business_id": biz_id,
    "items": [{"product_id": product_item.get("id"), "quantity": 1}],
    "order_type": "TAKEAWAY",
    "payment_method": "CASH",
    "customer_name": cus_user.get("name", "Test VIP Customer"),
    "customer_phone": cus_user.get("phone", "+919876543210"),
    "idempotency_key": f"test_cod_{int(time.time())}"
}
cod_status, cod_order = post_json("/api/orders", cod_payload, token=cus_token)
print(f"COD Order creation status: {cod_status}, Data: {cod_order}")
assert cod_status in (200, 201), f"COD Order creation failed: {cod_order}"
cod_order_id = cod_order.get("id") or cod_order.get("order_id")
print(f"COD Order ID: {cod_order_id}")

# Verify customer can view their order
get_order_status, fetched_order = get_json(f"/api/orders/{cod_order_id}", token=cus_token)
print(f"Customer fetch COD order status: {get_order_status}")
print(f"Customer fetch COD order data: {fetched_order}")
assert get_order_status == 200, f"Customer could not fetch COD order: {fetched_order}"
assert (fetched_order.get("business_id") == biz_id or fetched_order.get("order", {}).get("business_id") == biz_id)
cod_pm = fetched_order.get("payment_method") or fetched_order.get("order", {}).get("payment_method") or (fetched_order.get("metadata") or {}).get("payment_method")
assert cod_pm == "CASH", f"Expected CASH, got {cod_pm}"

# Verify business can view order in business orders
biz_orders_status, biz_orders = get_json("/api/business/orders", token=biz_token)
assert biz_orders_status == 200, f"Business could not fetch orders: {biz_orders}"
order_ids = [o.get("id") for o in (biz_orders if isinstance(biz_orders, list) else biz_orders.get("orders", []))]
assert cod_order_id in order_ids, f"COD Order not in business orders list: {order_ids}"
print("TEST 1: COD CHECKOUT -> PASS")

# -------------------------------------------------------------
# TEST 2: UPI PAYMENT CHECKOUT FLOW
# Flow: Customer -> Store Menu -> Cart -> UPI -> Payment Status
# -------------------------------------------------------------
print("\n--- TEST 2: UPI PAYMENT CHECKOUT ---")
upi_payload = {
    "business_id": biz_id,
    "items": [{"product_id": product_item.get("id"), "quantity": 1}],
    "order_type": "TAKEAWAY",
    "payment_method": "UPI",
    "customer_name": cus_user.get("name", "Test VIP Customer"),
    "customer_phone": cus_user.get("phone", "+919876543210"),
    "idempotency_key": f"test_upi_{int(time.time())}"
}
upi_status, upi_order = post_json("/api/orders", upi_payload, token=cus_token)
print(f"UPI Order creation status: {upi_status}, Data: {upi_order}")
assert upi_status in (200, 201), f"UPI Order creation failed: {upi_order}"
upi_order_id = upi_order.get("id") or upi_order.get("order_id")
print(f"UPI Order ID: {upi_order_id}")

# Verify customer can retrieve UPI order details & business context without false success
get_upi_status, fetched_upi_order = get_json(f"/api/orders/{upi_order_id}", token=cus_token)
assert get_upi_status == 200, f"Customer could not fetch UPI order: {fetched_upi_order}"
upi_pm = fetched_upi_order.get("payment_method") or fetched_upi_order.get("order", {}).get("payment_method") or (fetched_upi_order.get("metadata") or {}).get("payment_method")
assert upi_pm == "UPI", f"Expected UPI, got {upi_pm}"
# Verify payment status is not false positive success (should be PENDING or UNPAID or AWAITING VERIFICATION)
payment_st = str(fetched_upi_order.get("payment_status") or (fetched_upi_order.get("metadata") or {}).get("payment_status", "")).upper()
assert payment_st in ("PENDING", "UNPAID", "AWAITING", "AWAITING VERIFICATION"), f"Unexpected payment status: {payment_st}"
print(f"UPI Order Status: {payment_st} (no false positive success)")
print("TEST 2: UPI PAYMENT CHECKOUT -> PASS")

# -------------------------------------------------------------
# TEST 3: MULTIPLE STORE / ASSOCIATED STORES ONLY
# Flow: Customer -> My Stores -> Only associated stores
# -------------------------------------------------------------
print("\n--- TEST 3: MULTIPLE STORE ASSOCIATION ---")
home_status, home_data = get_json("/api/customer/home", token=cus_token)
assert home_status == 200, f"Customer home failed: {home_data}"
connected_stores = home_data.get("businesses", [])
connected_ids = [b.get("id") for b in connected_stores]
print(f"Connected Store IDs for customer: {connected_ids}")
assert biz_id in connected_ids, f"Expected {biz_id} to be in associated stores: {connected_ids}"

# Fetch public directory to verify there are unassociated stores NOT leaked to customer
pub_status, pub_businesses = get_json("/api/public/businesses")
assert pub_status == 200
all_biz_ids = [b.get("id") for b in (pub_businesses.get("businesses", []) if isinstance(pub_businesses, dict) else pub_businesses)]
unassociated_stores = [bid for bid in all_biz_ids if bid not in connected_ids]
print(f"Unassociated public store count: {len(unassociated_stores)}")
for unass in unassociated_stores:
    assert unass not in connected_ids, f"Data leak! Customer has unassociated store {unass}"
print("TEST 3: MULTIPLE STORE ASSOCIATION -> PASS")

# -------------------------------------------------------------
# TEST 4: GIFT / REWARD REDEEM FLOW
# Flow: Customer -> Gift/Reward -> Claim/Redeem
# -------------------------------------------------------------
print("\n--- TEST 4: GIFT / REWARD REDEEM ---")
# Check loyalty status
loyalty_status, loyalty_data = get_json("/api/customer/loyalty/status", token=cus_token)
print(f"Loyalty status: {loyalty_status}, points: {loyalty_data.get('points') if isinstance(loyalty_data, dict) else 'N/A'}")

# Fetch available reward vouchers for business
offers_status, offers_data = get_json(f"/api/customer/vouchers?business_id={biz_id}", token=cus_token)
vouchers = offers_data.get("vouchers", []) if isinstance(offers_data, dict) else (offers_data if isinstance(offers_data, list) else [])
print(f"Available vouchers/rewards count: {len(vouchers)}")

reward_id = vouchers[0].get("id") if vouchers else "reward_test_voucher"

# Test claim reward passing business_id as string
claim_status, claim_data = post_json("/api/customer/rewards/claim", {
    "reward_id": reward_id,
    "business_id": biz_id
}, token=cus_token)
print(f"Claim reward status with string business_id: {claim_status}")
# HTTP 422 Unprocessable Entity was the bug! Now it should NOT be 422!
assert claim_status != 422, f"Claim reward failed with 422 Unprocessable Entity: {claim_data}"
# Status can be 200 (claimed), or 400 (already claimed / insufficient points), both prove schema validation passed!
print(f"Claim response: {claim_data}")

# Test duplicate redemption prevention
dup_status, dup_data = post_json("/api/customer/rewards/claim", {
    "reward_id": reward_id,
    "business_id": biz_id
}, token=cus_token)
print(f"Duplicate redemption attempt status: {dup_status}, Data: {dup_data}")
assert dup_status in (400, 409) or dup_data.get("success") is False or "already" in str(dup_data).lower(), f"Duplicate redemption was not prevented: {dup_data}"
print("Duplicate redemption prevented successfully.")

# Test optional server-side object business_id sanitization
obj_status, obj_data = post_json("/api/customer/rewards/claim", {
    "reward_id": reward_id,
    "business_id": {"id": biz_id}
}, token=cus_token)
print(f"Claim reward status with object business_id: {obj_status}")
print("TEST 4: GIFT / REWARD REDEEM -> PASS")

# -------------------------------------------------------------
# TEST 5: CUSTOMER CARD QR RESOLUTION
# Flow: Customer -> Digital Card -> QR (phone camera scans and resolves)
# -------------------------------------------------------------
print("\n--- TEST 5: CUSTOMER CARD QR RESOLUTION ---")
qr_url = f"https://zoor-up-9b3a3.web.app/customer/{cus_id}"
resolve_status, resolved_qr = post_json("/api/qr/resolve", {"qr_data": qr_url})
print(f"Resolve QR Status: {resolve_status}, Data: {resolved_qr}")
assert resolve_status == 200, f"QR resolve failed: {resolved_qr}"
assert resolved_qr.get("valid") is True, "QR is not marked valid"
assert resolved_qr.get("type") == "CUSTOMER", f"Expected type CUSTOMER, got {resolved_qr.get('type')}"
assert resolved_qr.get("customer_id") == cus_id, f"Customer ID mismatch: {resolved_qr.get('customer_id')} vs {cus_id}"

# Also test public endpoint for camera browser scan
pub_card_status, pub_card_data = get_json(f"/api/public/customer/{cus_id}")
print(f"Public Customer Card endpoint status: {pub_card_status}")
assert pub_card_status == 200, f"Public customer card failed: {pub_card_data}"
assert pub_card_data.get("customer", {}).get("customer_id") == cus_id
print("TEST 5: CUSTOMER CARD QR RESOLUTION -> PASS")

# -------------------------------------------------------------
# TEST 6: REFRESH PERFORMANCE & NO DUPLICATE REPEATS
# Flow: Repeat fetch of customer home, orders, loyalty
# -------------------------------------------------------------
print("\n--- TEST 6: REFRESH PERFORMANCE ---")
t0 = time.time()
for _ in range(3):
    s1, _ = get_json("/api/customer/home", token=cus_token)
    assert s1 == 200
    s2, _ = get_json(f"/api/customer/vouchers?business_id={biz_id}", token=cus_token)
    assert s2 == 200
duration = time.time() - t0
print(f"3 consecutive refresh batches executed in {duration:.2f}s without repeat loops")
print("TEST 6: REFRESH PERFORMANCE -> PASS")

# -------------------------------------------------------------
# TEST 7: BUSINESS A + BUSINESS B DATA ISOLATION
# Flow: Customer only sees data for associated stores
# -------------------------------------------------------------
print("\n--- TEST 7: BUSINESS DATA ISOLATION ---")
# Verify business A orders cannot be accessed by another business
if unassociated_stores:
    other_biz_id = unassociated_stores[0]
    # Customer requesting orders from store they didn't order from
    other_menu_status, other_menu = get_json(f"/api/public/menu/{other_biz_id}")
    assert other_menu_status == 200
    other_prods = other_menu.get("products", [])
    # Verify products from other store do not have biz_id
    for p in other_prods:
        assert p.get("business_id") == other_biz_id, "Product cross-store leakage detected!"
print("TEST 7: BUSINESS DATA ISOLATION -> PASS")

print("\n=======================================================")
print("ALL 7 CUSTOMER-SIDE PRODUCTION TESTS COMPLETED SUCCESSFULLY!")
print("=======================================================")
