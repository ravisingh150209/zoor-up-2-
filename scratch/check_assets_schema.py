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

resp = requests.get(f"{supabase_url}/rest/v1/", headers=headers)
defs = resp.json().get('definitions', {}).get('upload_assets', {})
print("upload_assets properties:", defs.get('properties', {}).keys())
print("upload_assets required:", defs.get('required', []))
