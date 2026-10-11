import sys
sys.path.insert(0, '.')
import uuid
from backend.database import get_collection
from backend.auth import hash_password

def create_owner():
    email = "upload_live_v2@zoorup.com"
    pwd = "Password123!"
    hashed = hash_password(pwd)
    user_id = f"user_{uuid.uuid4().hex[:10]}"
    biz_id = f"biz_{uuid.uuid4().hex[:10]}"
    
    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    
    # Clean if exists
    existing = users_col.find_one({"email": email})
    if existing:
        users_col.delete_one({"email": email})
    existing_biz = biz_col.find_one({"email": email})
    if existing_biz:
        biz_col.delete_one({"email": email})
    
    users_col.insert_one({
        "id": user_id,
        "email": email,
        "password_hash": hashed,
        "role": "BUSINESS_OWNER",
        "name": "E2E Upload Owner",
        "business_id": biz_id,
        "business_name": "E2E Upload Store",
        "phone": "9899990001",
        "onboarding_completed": True,
        "created_at": "2026-10-03T10:00:00Z"
    })
    
    biz_col.insert_one({
        "id": biz_id,
        "owner_id": user_id,
        "name": "E2E Upload Store",
        "slug": f"e2e-upload-store-{uuid.uuid4().hex[:4]}",
        "email": email,
        "phone": "9899990001",
        "category": "Retail & Fashion",
        "description": "Store for verifying production image uploads",
        "address": "456 Market Lane",
        "city": "Mumbai",
        "state": "Maharashtra",
        "postal_code": "400001",
        "onboarding_completed": True,
        "onboarding_step": 10,
        "subscription_plan": "PRO",
        "status": "ACTIVE",
        "created_at": "2026-10-03T10:00:00Z"
    })
    print(f"Created owner: {email} / {pwd}, biz: {biz_id}")

if __name__ == "__main__":
    create_owner()
