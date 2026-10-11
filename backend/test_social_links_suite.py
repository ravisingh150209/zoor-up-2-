"""
ZOOR UP Social Media & Contact Links Comprehensive Test Suite
Tests:
1. Normalization & validation of Instagram, Facebook, WhatsApp, Website, YouTube, LinkedIn.
2. Saving links via PUT /api/business/social-links.
3. Persistence check via GET /api/business/social-links and GET /api/business/profile.
4. Rejection of invalid URLs and phone numbers (HTTP 400).
5. Removal/clearing of individual and all links.
6. Multi-business tenant isolation (Business 1 vs Business 2).
7. Authorization controls (unauthorized customer cannot modify links).
8. Public storefront integration via GET /api/public/menu/{slug} and GET /api/public/business/{id}/social-links.
"""
import sys
import os
import pytest
os.environ['DEV_OTP'] = 'true'
os.environ['ENVIRONMENT'] = 'development'
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_collection, reset_mock_db

# Reset database
reset_mock_db()
client = TestClient(app)

import uuid
import random
uid = uuid.uuid4().hex[:6]
rnd = random.randint(100000, 999999)

def test_social_media_links_complete_lifecycle():
    # 1. Register Business Owner 1
    owner1_res = client.post('/api/auth/owner/register', json={
        'name': f'Alpha Store Owner {uid}',
        'email': f'alpha_{uid}@test.com',
        'phone': f'+919811{rnd}',
        'password': 'Password@123'
    })
    assert owner1_res.status_code == 200, f"Registration failed: {owner1_res.text}"
    owner1_token = owner1_res.json()['access_token']
    owner1_headers = {'Authorization': f'Bearer {owner1_token}'}

    biz1 = client.get('/api/business/profile', headers=owner1_headers).json()
    biz1_id = biz1['id']
    biz1_slug = biz1.get('slug', biz1_id)

    # 2. Register Business Owner 2
    owner2_res = client.post('/api/auth/owner/register', json={
        'name': f'Beta Store Owner {uid}',
        'email': f'beta_{uid}@test.com',
        'phone': f'+919822{rnd}',
        'password': 'Password@123'
    })
    assert owner2_res.status_code == 200, f"Registration 2 failed: {owner2_res.text}"
    owner2_token = owner2_res.json()['access_token']
    owner2_headers = {'Authorization': f'Bearer {owner2_token}'}

    biz2 = client.get('/api/business/profile', headers=owner2_headers).json()
    biz2_id = biz2['id']

    # 3. Register Customer (for authorization checks)
    cust_res = client.post('/api/auth/customer/register', json={
        'name': f'Test Customer {uid}',
        'email': f'customer_{uid}@test.com',
        'phone': f'+919833{rnd}',
        'password': 'Password@123'
    })
    assert cust_res.status_code == 200, f"Cust registration failed: {cust_res.text}"
    assert cust_res.status_code == 200
    cust_token = cust_res.json()['access_token']
    cust_headers = {'Authorization': f'Bearer {cust_token}'}

    # =========================================================
    # Test A: Save Full Social Links for Business 1
    # =========================================================
    save_res = client.put('/api/business/social-links', json={
        'instagram': '@alphastore_official',
        'facebook': 'https://facebook.com/alphastorepage',
        'whatsapp': '+919876543210',
        'whatsapp_message': 'Hello Alpha Store! I want to order from ZOOR UP.',
        'website': 'https://alphastore.in',
        'youtube': 'https://youtube.com/@alphastore',
        'linkedin': 'https://linkedin.com/company/alphastore',
    }, headers=owner1_headers)

    assert save_res.status_code == 200, f"Failed saving social links: {save_res.text}"
    saved_data = save_res.json()
    assert saved_data['success'] is True
    assert saved_data['business_id'] == biz1_id
    
    links = saved_data['social_links']
    assert links['instagram'] == 'https://instagram.com/alphastore_official'
    assert links['facebook'] == 'https://facebook.com/alphastorepage'
    assert links['whatsapp'] == '919876543210'
    assert links['whatsapp_message'] == 'Hello Alpha Store! I want to order from ZOOR UP.'
    assert links['website'] == 'https://alphastore.in'
    assert links['youtube'] == 'https://youtube.com/@alphastore'
    assert links['linkedin'] == 'https://linkedin.com/company/alphastore'

    # =========================================================
    # Test B: Persistence Check via GET /api/business/social-links
    # =========================================================
    get_res = client.get('/api/business/social-links', headers=owner1_headers)
    assert get_res.status_code == 200
    persisted = get_res.json()['social_links']
    assert persisted['instagram'] == 'https://instagram.com/alphastore_official'
    assert persisted['whatsapp'] == '919876543210'
    assert persisted['website'] == 'https://alphastore.in'

    # Check via GET /api/business/profile
    prof_res = client.get('/api/business/profile', headers=owner1_headers)
    assert prof_res.status_code == 200
    assert prof_res.json().get('social_links') == persisted

    # =========================================================
    # Test C: Validation & Rejection of Invalid Data (HTTP 400)
    # =========================================================
    # C1: Invalid Instagram (contains spaces or disallowed symbols)
    bad_ig = client.put('/api/business/social-links', json={
        'instagram': 'invalid user with spaces!'
    }, headers=owner1_headers)
    assert bad_ig.status_code == 400
    assert "Invalid Instagram" in bad_ig.json()['detail']

    # C2: Unsafe scheme javascript:
    bad_xss = client.put('/api/business/social-links', json={
        'website': 'javascript:alert(1)'
    }, headers=owner1_headers)
    assert bad_xss.status_code == 400

    # C3: Invalid Facebook (non-Facebook domain)
    bad_fb = client.put('/api/business/social-links', json={
        'facebook': 'https://evilsite.com/fake'
    }, headers=owner1_headers)
    assert bad_fb.status_code == 400
    assert "Invalid Facebook" in bad_fb.json()['detail']

    # C4: Invalid WhatsApp phone (too short)
    bad_wa = client.put('/api/business/social-links', json={
        'whatsapp': '12345'
    }, headers=owner1_headers)
    assert bad_wa.status_code == 400
    assert "Invalid WhatsApp" in bad_wa.json()['detail']

    # =========================================================
    # Test D: Partial Edit & Removing Links
    # =========================================================
    # Remove youtube and linkedin by sending empty string or omitting
    update_res = client.put('/api/business/social-links', json={
        'instagram': 'alphastore_official',
        'facebook': 'https://facebook.com/alphastorepage',
        'whatsapp': '+919876543210',
        'whatsapp_message': '',
        'website': 'https://alphastore.in',
        'youtube': '',
        'linkedin': '',
    }, headers=owner1_headers)
    assert update_res.status_code == 200
    updated_links = update_res.json()['social_links']
    assert 'youtube' not in updated_links
    assert 'linkedin' not in updated_links
    assert updated_links['instagram'] == 'https://instagram.com/alphastore_official'

    # =========================================================
    # Test E: Multi-Business Isolation
    # =========================================================
    # Business 2 saves its own links
    save_biz2 = client.put('/api/business/social-links', json={
        'instagram': '@betacoffee',
        'whatsapp': '+919123456789',
    }, headers=owner2_headers)
    assert save_biz2.status_code == 200
    biz2_links = save_biz2.json()['social_links']
    assert biz2_links['instagram'] == 'https://instagram.com/betacoffee'
    assert biz2_links['whatsapp'] == '919123456789'
    assert 'facebook' not in biz2_links
    assert 'website' not in biz2_links

    # Business 1 re-verifies its links have NOT changed
    get_biz1 = client.get('/api/business/social-links', headers=owner1_headers).json()['social_links']
    assert get_biz1['instagram'] == 'https://instagram.com/alphastore_official'
    assert get_biz1['whatsapp'] == '919876543210'
    assert get_biz1['website'] == 'https://alphastore.in'
    assert 'betacoffee' not in str(get_biz1)

    # =========================================================
    # Test F: Authorization Protection
    # =========================================================
    # Customer cannot update business social links
    unauth_res = client.put('/api/business/social-links', json={
        'instagram': 'hacker'
    }, headers=cust_headers)
    assert unauth_res.status_code == 403

    # Unauthenticated cannot update
    anon_res = client.put('/api/business/social-links', json={
        'instagram': 'anon'
    })
    assert anon_res.status_code in (401, 403)

    # =========================================================
    # Test G: Public Storefront API Verification
    # =========================================================
    # G1: Dedicated public social-links endpoint
    pub_res = client.get(f'/api/public/business/{biz1_id}/social-links')
    assert pub_res.status_code == 200
    assert pub_res.json()['social_links']['instagram'] == 'https://instagram.com/alphastore_official'

    # G2: Public Menu endpoint contains social_links
    menu_res = client.get(f'/api/public/menu/{biz1_slug}')
    assert menu_res.status_code == 200
    menu_data = menu_res.json()
    assert 'business' in menu_data
    assert 'social_links' in menu_data['business']
    assert menu_data['business']['social_links']['instagram'] == 'https://instagram.com/alphastore_official'
    assert menu_data['business']['social_links']['whatsapp'] == '919876543210'

    print("ALL SOCIAL MEDIA LINKS TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    test_social_media_links_complete_lifecycle()
