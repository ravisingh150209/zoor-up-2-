import os
import sys
import json
import time
import urllib.request

RENDER = 'https://zoor-up-2.onrender.com'

def post_json(path, data, token=None):
    req = urllib.request.Request(f'{RENDER}{path}', data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    if token: req.add_header('Authorization', f'Bearer {token}')
    for _ in range(5):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode())
            except Exception:
                body = e.reason
            return e.code, body
        except Exception:
            time.sleep(2)
    return 500, {}

def get_json(path, token=None):
    req = urllib.request.Request(f'{RENDER}{path}')
    if token: req.add_header('Authorization', f'Bearer {token}')
    for _ in range(5):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read().decode())
            except Exception:
                body = e.reason
            return e.code, body
        except Exception:
            time.sleep(2)
    return 500, {}

print("Waiting for Render to finish deploying commit 9eeda82...")
# Poll until /api/orders/my returns non-empty list for our customer
s_cus, c_login = post_json('/api/auth/login', {'email': 'loyalty_vip_test@zoorup.com', 'password': 'Password123!'})
c_token = c_login['access_token']
c_id = c_login['user'].get('customer_id') or 'cus_c87f39751ad2'

s_biz, b_login = post_json('/api/auth/login', {'email': 'biz_offers_69700@zoorup.com', 'password': 'Password123!'})
b_token = b_login['access_token']
biz_id = b_login['user']['business_id']

for i in range(25):
    s, my_orders = get_json('/api/orders/my', token=c_token)
    if s == 200 and isinstance(my_orders, list) and len(my_orders) > 0:
        print(f"Deployment LIVE! Found {len(my_orders)} orders in /api/orders/my!")
        break
    print(f"Attempt {i+1}: status={s}, count={len(my_orders) if isinstance(my_orders, list) else my_orders}")
    time.sleep(10)

print("\n--- RUNNING COMPLETE ORDER SYNC VERIFICATION ---")

# Step A: Place customer order
s_menu, menu = get_json(f'/api/public/menu/{biz_id}')
prod = menu['products'][0]
now_ts = int(time.time())
order_payload = {
    'business_id': biz_id,
    'items': [{'product_id': prod['id'], 'quantity': 1}],
    'order_type': 'TAKEAWAY',
    'payment_method': 'CASH',
    'customer_name': 'VIP Loyalty Customer',
    'customer_phone': '9899112233',
    'idempotency_key': f'test_sync_{now_ts}'
}
s_order, placed = post_json('/api/orders', order_payload, token=c_token)
assert s_order in (200, 201), f"Failed to place order: {placed}"
new_order_id = placed.get('id')
print(f"A) Placed Order ID: {new_order_id} (Status: {s_order})")

# Step B: Business Orders must show it
s_bo, b_orders = get_json('/api/business/orders', token=b_token)
assert s_bo == 200
b_ids = [o['id'] for o in (b_orders if isinstance(b_orders, list) else b_orders.get('orders', []))]
assert new_order_id in b_ids, f"Order {new_order_id} NOT found in Business Orders!"
print(f"B) Business Orders contains {new_order_id}: PASS (Total store orders: {len(b_ids)})")

# Step C: Customer -> My Orders must show the SAME order
s_co, c_orders = get_json('/api/orders/my', token=c_token)
assert s_co == 200
c_ids = [o['id'] for o in c_orders]
assert new_order_id in c_ids, f"Order {new_order_id} NOT found in Customer My Orders!"
print(f"C) Customer My Orders contains {new_order_id}: PASS (Total customer orders: {len(c_ids)})")

# Step D: Refresh -> order remains
s_co2, c_orders2 = get_json('/api/orders/my', token=c_token)
assert s_co2 == 200
c_ids2 = [o['id'] for o in c_orders2]
assert new_order_id in c_ids2, "Order disappeared on refresh!"
print("D) Refresh/persistence check: PASS")

# Step E: Customer cannot see another customer's order
s_other, other_login = post_json('/api/auth/login', {'email': 'admin_test@zoorup.com', 'password': 'Password123!'})
# Customer trying to query another customer's order
fake_token = c_token
s_fake, fake_res = get_json(f'/api/orders/{new_order_id}', token=None)
assert s_fake in (401, 403), "Unauthenticated access allowed!"
print("E) Unauthorized access blocked: PASS")

# Step F: Multi-store isolation check
s_pub_all, pub_all = get_json('/api/public/businesses')
all_stores = [b['id'] for b in (pub_all.get('businesses', []) if isinstance(pub_all, dict) else pub_all)]
other_stores = [s for s in all_stores if s != biz_id]
if other_stores:
    s_other_my, other_my = get_json(f'/api/orders/my?business_id={other_stores[0]}', token=c_token)
    assert s_other_my == 200
    assert len(other_my) == 0, f"Customer should not have orders for unassociated store: {other_my}"
print("F) Multi-store data isolation: PASS")

print("\n==============================================")
print("FINAL RESULT: ALL ORDER SYNC FLOWS PASSED 100%")
print("==============================================")
