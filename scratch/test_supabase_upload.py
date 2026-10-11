import os
import requests
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}"
}

# 1. Test uploading a 1x1 png to 'product-images'
png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82'

path = "test_biz_1/test_upload.png"
upload_url = f"{supabase_url}/storage/v1/object/product-images/{path}"

upload_headers = {
    **headers,
    "Content-Type": "image/png",
    "x-upsert": "true"
}

resp = requests.post(upload_url, headers=upload_headers, data=png_bytes)
print("Upload status:", resp.status_code, resp.text)

# 2. Public URL:
public_url = f"{supabase_url}/storage/v1/object/public/product-images/{path}"
print("Public URL:", public_url)

# 3. Test reading the public URL without auth headers:
get_resp = requests.get(public_url)
print("Public download status:", get_resp.status_code, "length:", len(get_resp.content))
