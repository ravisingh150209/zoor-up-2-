import sys
import os
os.environ['DEV_OTP'] = 'true'
os.environ['ENVIRONMENT'] = 'development'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection, reset_mock_db

# Reset test database FIRST
reset_mock_db()

client = TestClient(app)

# Create business owner 1
owner1_res = client.post('/api/auth/owner/register', json={
    'name': 'Owner One',
    'email': 'owner1@example.com',
    'phone': '+919800000001',
    'password': 'Password@123'
})
owner1_token = owner1_res.json()['access_token']
owner1_headers = {'Authorization': f'Bearer {owner1_token}'}
biz1 = client.get('/api/business/profile', headers=owner1_headers).json()
biz1_id = biz1['id']

# Create business owner 2
owner2_res = client.post('/api/auth/owner/register', json={
    'name': 'Owner Two',
    'email': 'owner2@example.com',
    'phone': '+919800000002',
    'password': 'Password@123'
})
owner2_token = owner2_res.json()['access_token']
owner2_headers = {'Authorization': f'Bearer {owner2_token}'}
biz2 = client.get('/api/business/profile', headers=owner2_headers).json()
biz2_id = biz2['id']

# Add tables to both businesses
tables_col = get_collection('tables')
tables_col.insert_one({
    'id': 'tbl_1', 'business_id': biz1_id, 'name': 'Table 1', 'table_number': 'T1',
    'capacity': 4, 'section': 'Main', 'is_active': True, 'created_at': '2026-01-01T00:00:00'
})
tables_col.insert_one({
    'id': 'tbl_2', 'business_id': biz2_id, 'name': 'Table 2', 'table_number': 'T2',
    'capacity': 4, 'section': 'Main', 'is_active': True, 'created_at': '2026-01-01T00:00:00'
})

# Create customer 1 (connected to biz1 only)
cust1_res = client.post('/api/auth/customer/register', json={
    'name': 'Customer One',
    'email': 'cust1@example.com',
    'phone': '+919800000011',
    'password': 'Password@123'
})
cust1_token = cust1_res.json()['access_token']
cust1_headers = {'Authorization': f'Bearer {cust1_token}'}
cust1_profile = cust1_res.json()['customer']
cust1_id = cust1_profile['customer_id']

# Connect customer 1 to biz1 only
cb_col = get_collection('customer_businesses')
cb_col.insert_one({
    'id': 'cb_1', 'customer_id': cust1_id, 'business_id': biz1_id,
    'status': 'active', 'source': 'qr_scan', 'created_at': '2026-01-01T00:00:00'
})

# Create customer 2 (connected to biz2 only)
cust2_res = client.post('/api/auth/customer/register', json={
    'name': 'Customer Two',
    'email': 'cust2@example.com',
    'phone': '+919800000012',
    'password': 'Password@123'
})
cust2_token = cust2_res.json()['access_token']
cust2_headers = {'Authorization': f'Bearer {cust2_token}'}
cust2_profile = cust2_res.json()['customer']
cust2_id = cust2_profile['customer_id']

cb_col.insert_one({
    'id': 'cb_2', 'customer_id': cust2_id, 'business_id': biz2_id,
    'status': 'active', 'source': 'qr_scan', 'created_at': '2026-01-01T00:00:00'
})

print("=== TABLE BOOKING BUSINESS ISOLATION TESTS ===")

# Test 1: Customer 1 should only see biz1 tables via /api/customer/tables
res1 = client.get('/api/customer/tables', headers=cust1_headers)
print(f"Customer 1 /api/customer/tables (no business_id): {res1.status_code}")
tables1 = res1.json()
print(f"  Tables returned: {len(tables1)} (expected 1)")
for t in tables1:
    print(f"  - Table: {t['name']}, Business: {t.get('business_id')}")
assert len(tables1) == 1 and tables1[0].get('business_id') == biz1_id, "Customer 1 should only see biz1 tables"

# Test 2: Customer 1 requests biz2 tables explicitly - should get 403 or empty
res1_biz2 = client.get(f'/api/customer/tables?business_id={biz2_id}', headers=cust1_headers)
print(f"Customer 1 /api/customer/tables?business_id={biz2_id}: {res1_biz2.status_code}")
tables1_biz2 = res1_biz2.json()
print(f"  Tables returned: {len(tables1_biz2)} (expected 0)")
assert len(tables1_biz2) == 0, "Customer 1 should not see biz2 tables"

# Test 3: Customer 2 should only see biz2 tables
res2 = client.get('/api/customer/tables', headers=cust2_headers)
print(f"Customer 2 /api/customer/tables (no business_id): {res2.status_code}")
tables2 = res2.json()
print(f"  Tables returned: {len(tables2)} (expected 1)")
for t in tables2:
    print(f"  - Table: {t['name']}, Business: {t.get('business_id')}")
assert len(tables2) == 1 and tables2[0].get('business_id') == biz2_id, "Customer 2 should only see biz2 tables"

# Test 4: Customer 1 tries to check availability for biz2 - should get 403
avail_res = client.get(f'/api/customer/table-availability?business_id={biz2_id}&date=2026-10-15&time=19:00&guests=2', headers=cust1_headers)
print(f"Customer 1 availability for biz2: {avail_res.status_code} (expected 403)")
assert avail_res.status_code == 403, "Customer 1 should not check availability for biz2"

# Test 5: Customer 1 tries to book at biz2 - should get 403
booking_payload = {
    'business_id': biz2_id,
    'customer_name': 'Customer One',
    'customer_phone': '+919800000011',
    'customer_email': 'cust1@example.com',
    'booking_date': '2026-10-15',
    'booking_time': '19:00',
    'guests': 2,
    'table_id': 'tbl_2',
    'notes': 'test'
}
book_res = client.post('/api/customer/table-reservations', json=booking_payload, headers=cust1_headers)
print(f"Customer 1 booking at biz2: {book_res.status_code} (expected 403)")
print(f"  Response: {book_res.text}")
assert book_res.status_code == 403, "Customer 1 should not book at biz2"

# Test 6: Customer 1 books at biz1 - should succeed
booking_payload_biz1 = {
    'business_id': biz1_id,
    'customer_name': 'Customer One',
    'customer_phone': '+919800000011',
    'customer_email': 'cust1@example.com',
    'booking_date': '2026-10-15',
    'booking_time': '19:00',
    'guests': 2,
    'table_id': 'tbl_1',
    'notes': 'test'
}
book_res_biz1 = client.post('/api/customer/table-reservations', json=booking_payload_biz1, headers=cust1_headers)
print(f"Customer 1 booking at biz1: {book_res_biz1.status_code} (expected 200)")
assert book_res_biz1.status_code == 200, "Customer 1 should book at biz1"

print("\n=== ALL TABLE BOOKING ISOLATION TESTS PASSED ===")