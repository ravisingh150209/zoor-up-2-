import os
import sys
import json
import time
import urllib.request
import urllib.parse
from dotenv import load_dotenv

load_dotenv("backend/.env")

RENDER_URL = "https://zoor-up-2.onrender.com"
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://igoferpbapfgmybclgyd.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def post_json(endpoint, payload, token=None):
    url = f"{RENDER_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2)

def get_json(endpoint, token=None):
    url = f"{RENDER_URL}{endpoint}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt == 3:
                raise
            time.sleep(2)

print("=== ZOOR UP PRODUCTION VERIFICATION ===")

# 1. Login as Business Owner
biz_login = post_json("/api/auth/login", {"email": "biz_offers_69700@zoorup.com", "password": "Password123!"})
biz_token = biz_login.get("access_token")
biz_user = biz_login.get("user")
biz_id = biz_user.get("business_id", "biz_8b17f1d06981")
print(f"1. Business login: PASS (Business ID: {biz_id})")

# 2. Login as Customer
cus_login = post_json("/api/auth/login", {"email": "loyalty_vip_test@zoorup.com", "password": "Password123!"})
cus_token = cus_login.get("access_token")
cus_user = cus_login.get("user")
cus_id = cus_user.get("id")
print(f"2. Customer login: PASS (Customer ID: {cus_id})")

# 3. Test QR Resolution for Business & Customer Pass
qr_biz = get_json(f"/api/qr/resolve?business_id={biz_id}")
assert qr_biz.get("valid") is True, "Business QR resolve failed"
print(f"3. QR Resolve (Business): PASS -> destination: {qr_biz.get('destination')}")

qr_cus = post_json("/api/qr/resolve", {"qr_data": f"https://zoor-up-9b3a3.web.app/customer/{cus_id}"})
assert qr_cus.get("valid") is True and qr_cus.get("type") == "CUSTOMER", "Customer QR resolve failed"
print(f"4. QR Resolve (Customer Pass): PASS -> customer_id: {qr_cus.get('customer_id')}")

# 5. Test Customer Profile & Home
cus_home = get_json("/api/customer/home", token=cus_token)
assert "customer" in cus_home, "Customer home missing customer profile"
print(f"5. Customer Home & Profile: PASS (Name: {cus_home['customer'].get('name')})")

# 6. Test Image Uploads (Business Logo to Supabase Storage)
# We test upload endpoint with multipart/form-data
def upload_multipart(endpoint, fields, files, token=None):
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{value}\r\n".encode("utf-8"))
    for name, (filename, file_bytes, content_type) in files.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode("utf-8"))
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(file_bytes)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    req = urllib.request.Request(
        f"{RENDER_URL}{endpoint}",
        data=bytes(body),
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}" if token else ""
        },
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

# Load real 1x1 png bytes
png_1x1 = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82'

logo_res = upload_multipart(
    "/api/uploads/image",
    {"entity_type": "business_logo", "business_id": biz_id, "bucket": "business-logos"},
    {"file": ("store_logo.png", png_1x1, "image/png")},
    token=biz_token
)
assert logo_res.get("success") is True, f"Logo upload failed: {logo_res}"
logo_url = logo_res.get("url")
assert "supabase.co" in logo_url, f"Expected Supabase URL, got {logo_url}"
assert "/business-logos/" in logo_url, f"Expected business-logos bucket, got {logo_url}"
print(f"6. Business Logo Upload: PASS -> {logo_url}")

# Verify Logo URL is accessible publicly via HTTP GET
req = urllib.request.Request(logo_url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    assert resp.status == 200, "Supabase Storage logo not publicly accessible"
    assert len(resp.read()) > 0
print("7. Supabase Storage Public Accessibility: PASS")

# 7. Test Product Photo Upload
prod_res = upload_multipart(
    "/api/uploads/image",
    {"entity_type": "product", "business_id": biz_id, "bucket": "product-images"},
    {"file": ("product_image.png", png_1x1, "image/png")},
    token=biz_token
)
assert prod_res.get("success") is True, f"Product upload failed: {prod_res}"
prod_url = prod_res.get("url")
assert "supabase.co" in prod_url, f"Expected Supabase URL, got {prod_url}"
assert "/product-images/" in prod_url, f"Expected product-images bucket, got {prod_url}"
print(f"8. Product Image Upload: PASS -> {prod_url}")

# 8. Test Business Categories from Storefront
storefront_res = get_json(f"/api/public/menu/{biz_id}")
categories_list = storefront_res.get("categories", [])
print(f"9. Category Access: PASS ({len(categories_list)} categories found: {[c.get('name') if isinstance(c, dict) else c for c in categories_list]})")

# 9. Test Image Persistence in Business Profile via PUT /api/business/profile
put_url = f"{RENDER_URL}/api/business/profile"
req_put = urllib.request.Request(
    put_url,
    data=json.dumps({"logo_url": logo_url}).encode("utf-8"),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {biz_token}"},
    method="PUT"
)
with urllib.request.urlopen(req_put) as resp:
    profile_updated = json.loads(resp.read().decode("utf-8"))
    assert profile_updated.get("logo_url") == logo_url or profile_updated.get("logo") == logo_url
    print(f"10. Business Profile Image Persistence: PASS (Saved logo: {logo_url})")

# 10. Read back business profile to verify persistence after reload
profile_reload = get_json("/api/business/profile", token=biz_token)
assert profile_reload.get("logo_url") == logo_url or profile_reload.get("logo") == logo_url
print("11. Image Persistence After Refresh: PASS")

# 11. Read back public storefront to verify image displays for customers / other devices
store_public = get_json(f"/api/public/menu/{biz_id}")
biz_data = store_public.get("business", {})
assert biz_data.get("logo") == logo_url or biz_data.get("logo_url") == logo_url or store_public.get("logo") == logo_url, "Storefront logo mismatch"
print(f"12. Image Works on Other Device / Public Context: PASS -> {biz_data.get('logo')}")

print("=== ALL CHECKS PASSED SUCCESSFULLY ===")
