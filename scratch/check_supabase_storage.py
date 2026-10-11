import os
from dotenv import load_dotenv
load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

print("SUPABASE_URL:", supabase_url)
print("Has SERVICE_ROLE_KEY:", bool(service_key))

import requests

headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}"
}

# List storage buckets
resp = requests.get(f"{supabase_url}/storage/v1/bucket", headers=headers)
print("List buckets status:", resp.status_code)
try:
    buckets = resp.json()
    print("Buckets found:", buckets)
except Exception as e:
    print("Failed to parse json:", e, resp.text)
