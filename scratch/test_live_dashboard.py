import urllib.request, urllib.error, json, time, random

API_BASE = 'https://zoor-up-2.onrender.com'

rand_suffix = random.randint(10000, 99999)
owner_data = {
    'name': f'Dashboard Test Cafe {rand_suffix}',
    'owner_name': f'Owner {rand_suffix}',
    'email': f'dash_test_{rand_suffix}@zoorup-test.com',
    'phone': f'99{rand_suffix:08d}',
    'password': 'Password123!'
}

print('=== 1. OWNER REGISTER ===')
req = urllib.request.Request(
    f'{API_BASE}/api/auth/owner/register',
    data=json.dumps(owner_data).encode(),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json'}
)
try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode())
    token = data.get('access_token')
    biz_id = data.get('business', {}).get('id')
    print('Register HTTP status:', res.status)
    print('Token obtained:', bool(token))
    print('Business ID:', biz_id)
except urllib.error.HTTPError as e:
    print('Register failed:', e.code, e.read().decode())
    exit(1)

# 2. Test GET /api/business/dashboard
print('\n=== 2. TEST GET /api/business/dashboard ===')
req_dash = urllib.request.Request(
    f'{API_BASE}/api/business/dashboard',
    headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
)
try:
    res_dash = urllib.request.urlopen(req_dash)
    print('Dashboard HTTP status:', res_dash.status)
    dash_data = json.loads(res_dash.read().decode())
    print('Dashboard data keys:', list(dash_data.keys()))
    print('Stats:', dash_data.get('stats'))
except urllib.error.HTTPError as e:
    print('Dashboard request FAILED HTTP:', e.code)
    print('Response:', e.read().decode())
except Exception as e:
    print('Dashboard request FAILED error:', e)

# 3. Test GET /api/orders
print('\n=== 3. TEST GET /api/orders ===')
req_orders = urllib.request.Request(
    f'{API_BASE}/api/orders?business_id={biz_id}',
    headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
)
try:
    res_orders = urllib.request.urlopen(req_orders)
    print('Orders HTTP status:', res_orders.status)
    orders_data = json.loads(res_orders.read().decode())
    print('Orders count:', len(orders_data) if isinstance(orders_data, list) else orders_data)
except urllib.error.HTTPError as e:
    print('Orders request FAILED HTTP:', e.code)
    print('Response:', e.read().decode())
except Exception as e:
    print('Orders request FAILED error:', e)
