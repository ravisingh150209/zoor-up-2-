import io
import sys
import os
sys.path.insert(0, os.path.abspath("."))
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token

client = TestClient(app)

# 1. Test anonymous upload -> 401
res_anon = client.post("/api/uploads/image")
print("Anon upload status:", res_anon.status_code)
assert res_anon.status_code == 401, "Anonymous upload must be 401"

# 2. Test authenticated upload as business owner
token = create_access_token({"sub": "user_233729218a0d", "role": "BUSINESS_OWNER", "business_id": "biz_8b17f1d06981"})
headers = {"Authorization": f"Bearer {token}"}

png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82'

files = {"file": ("test_logo.png", io.BytesIO(png_bytes), "image/png")}
data = {"entity_type": "business_logo", "business_id": "biz_8b17f1d06981", "bucket": "business-logos"}

res_upload = client.post("/api/uploads/image", headers=headers, files=files, data=data)
print("Owner logo upload status:", res_upload.status_code)
print("Owner logo upload response:", res_upload.json())
assert res_upload.status_code == 200
uploaded_url = res_upload.json()["url"]
assert "storage/v1/object/public/business-logos" in uploaded_url

# 3. Test product upload
files2 = {"file": ("test_product.png", io.BytesIO(png_bytes), "image/png")}
data2 = {"entity_type": "product", "business_id": "biz_8b17f1d06981"}
res_prod = client.post("/api/uploads/image", headers=headers, files=files2, data=data2)
print("Product upload status:", res_prod.status_code)
print("Product upload response:", res_prod.json())
assert res_prod.status_code == 200
prod_url = res_prod.json()["url"]
assert "storage/v1/object/public/product-images" in prod_url

# 4. Clean up test uploads
client.request("DELETE", "/api/uploads/image", headers=headers, json={"url": uploaded_url})
client.request("DELETE", "/api/uploads/image", headers=headers, json={"url": prod_url})
print("ALL BACKEND UPLOAD TESTS PASSED!")
