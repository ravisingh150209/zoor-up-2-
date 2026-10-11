import os
import urllib.request
from dotenv import load_dotenv

load_dotenv()
supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

url = f"{supabase_url}/storage/v1/object/business-logos/test_biz_1/logo_test.png"
req = urllib.request.Request(url, method="DELETE")
req.add_header("apikey", service_key)
req.add_header("Authorization", f"Bearer {service_key}")

try:
    with urllib.request.urlopen(req) as resp:
        print("Delete status:", resp.status)
except Exception as e:
    print("Delete error:", e)
