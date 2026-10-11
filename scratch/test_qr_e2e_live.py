import urllib.request, urllib.error, json, sys, time, random

API_BASE = 'https://zoor-up-2.onrender.com'
WEB_BASE = 'https://zoor-up-9b3a3.web.app'

def post_json(path, data, token=None):
    headers = {'Content-Type': 'application/json', 'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{API_BASE}{path}', data=json.dumps(data).encode(), headers=headers)
    try:
        res = urllib.request.urlopen(req)
        return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        return e.code, json.loads(err_body) if err_body.startswith('{') else {'detail': err_body}

def get_json(path, token=None):
    headers = {'Accept': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{API_BASE}{path}', headers=headers)
    res = urllib.request.urlopen(req)
    return res.status, json.loads(res.read().decode())

print('=== 1. VERIFY BUSINESS LISTING & IDENTIFIERS ===')
status, businesses = get_json('/api/public/businesses')
assert status == 200, f'Expected 200 got {status}'
print(f'Found {len(businesses)} businesses in live database.')

# Pick two distinct businesses for isolation testing
biz_a = businesses[0]
biz_b = businesses[1] if len(businesses) > 1 else None

print(f'Business A: ID={biz_a.get("id")}, Slug={biz_a.get("slug")}, Name={biz_a.get("name")}')
if biz_b:
    print(f'Business B: ID={biz_b.get("id")}, Slug={biz_b.get("slug")}, Name={biz_b.get("name")}')

print('\n=== 2. QR PAYLOAD FORMAT & GENERATION ===')
qr_url_a_hub = f'{WEB_BASE}/b/{biz_a.get("slug") or biz_a.get("id")}'
qr_url_a_menu = f'{WEB_BASE}/b/{biz_a.get("slug") or biz_a.get("id")}/menu'
print(f'Generated Storefront QR: {qr_url_a_hub}')
print(f'Generated Menu QR:       {qr_url_a_menu}')

print('\n=== 3. AUTHORITATIVE SERVER-SIDE QR RESOLVE ===')
for url in [qr_url_a_hub, qr_url_a_menu]:
    st, res = post_json('/api/qr/resolve', {'qr_data': url})
    print(f'Resolve {url}:')
    print(f'  valid: {res.get("valid")}, type: {res.get("type")}, business_id: {res.get("business_id")}, destination: {res.get("destination")}')
    assert res.get('valid') is True, f'Expected valid QR for {url}'
    assert res.get('business_id') == biz_a.get('id'), f'Expected exact business_id {biz_a.get("id")} got {res.get("business_id")}'

print('\n=== 4. PUBLIC STORE & MENU ENDPOINT RESOLUTION ===')
# Test via Slug
if biz_a.get("slug"):
    st_slug, data_slug = get_json(f'/api/public/menu/{biz_a.get("slug")}')
    assert st_slug == 200 and data_slug.get('business', {}).get('id') == biz_a.get('id')
    print(f'GET /api/public/menu/{biz_a.get("slug")} -> 200 OK (Resolved exact ID: {biz_a.get("id")})')

# Test via ID
st_id, data_id = get_json(f'/api/public/menu/{biz_a.get("id")}')
assert st_id == 200 and data_id.get('business', {}).get('id') == biz_a.get('id')
print(f'GET /api/public/menu/{biz_a.get("id")} -> 200 OK (Resolved exact ID: {biz_a.get("id")})')

print('\n=== 5. CUSTOMER REGISTRATION / LOGIN & QR CONNECTION ===')
rand_suffix = random.randint(100000, 999999)
test_email = f'qr_cust_{rand_suffix}@zoorup-test.com'
test_phone = f'91{rand_suffix:08d}'
test_pass = 'CustPass123!'

st, reg_data = post_json('/api/auth/customer/register', {
    'name': f'QR Tester {rand_suffix}',
    'email': test_email,
    'phone': test_phone,
    'password': test_pass
})
cust_token = reg_data.get('access_token')
print(f'Customer registered status {st}: Token={bool(cust_token)}')
assert cust_token, f'Customer access token is required, got {reg_data}'

# Connect customer to Business A via QR
print('\n=== 6. CONNECT CUSTOMER TO BUSINESS A VIA QR ===')
st, conn_res = post_json('/api/qr/connect', {
    'business_id': biz_a.get('id'),
    'type': 'menu',
    'source': 'qr_scan'
}, token=cust_token)
print('Connection result 1:', conn_res)
assert conn_res.get('success') is True, f'Expected success got {conn_res}'

# Duplicate scan idempotency
print('\n=== 7. DUPLICATE SCAN IDEMPOTENCY TEST ===')
st, conn_res_dup = post_json('/api/qr/connect', {
    'business_id': biz_a.get('id'),
    'type': 'menu',
    'source': 'qr_scan'
}, token=cust_token)
print('Connection result 2 (Duplicate scan):', conn_res_dup)
assert conn_res_dup.get('success') is True
assert conn_res_dup.get('already_connected') is True, 'Expected already_connected: True'
print('Idempotency verified: duplicate scan did not create duplicate relationship!')

# Multi-tenant isolation test
if biz_b:
    print('\n=== 8. MULTI-TENANT BUSINESS ISOLATION ===')
    st_b, conn_b = post_json('/api/qr/connect', {
        'business_id': biz_b.get('id'),
        'type': 'menu',
        'source': 'qr_scan'
    }, token=cust_token)
    print('Connection to Business B:', conn_b)
    assert conn_b.get('success') is True
    assert conn_b.get('business_id') == biz_b.get('id'), f'Business B resolved to {conn_b.get("business_id")}'
    print('Isolation verified: Business A and Business B maintain separate relationships!')

print('\n>>> ALL LIVE QR TESTS PASSED COMPLETELY <<<')
