import os
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82'

bucket = "business-logos"
file_path = "test_biz_1/logo_test.png"
url = f"{supabase_url}/storage/v1/object/{bucket}/{file_path}"

req = urllib.request.Request(url, data=png_bytes, method="POST")
req.add_header("apikey", service_key)
req.add_header("Authorization", f"Bearer {service_key}")
req.add_header("Content-Type", "image/png")
req.add_header("x-upsert", "true")

try:
    with urllib.request.urlopen(req) as resp:
        print("Status code:", resp.status)
        resp_data = resp.read().decode("utf-8")
        print("Response:", resp_data)
        public_url = f"{supabase_url}/storage/v1/object/public/{bucket}/{file_path}"
        print("Public URL:", public_url)

        # Verify public access
        with urllib.request.urlopen(public_url) as pub_resp:
            print("Public access code:", pub_resp.status)
            print("Downloaded bytes:", len(pub_resp.read()))
except urllib.error.HTTPError as e:
    print("HTTPError:", e.code, e.read().decode("utf-8"))
except Exception as e:
    print("Error:", e)
