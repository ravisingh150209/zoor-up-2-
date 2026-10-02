"""
ZOOR UP Staff Authentication & Management Routes
Provides real backend user creation, server-side RBAC permissions, and staff login.
"""
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from backend.database import get_collection
from backend.models import ROLE_BUSINESS_OWNER
from backend.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role
)

router = APIRouter(tags=["Staff Management & Auth"])


class StaffLoginRequest(BaseModel):
    email: str
    password: str


class StaffCreateRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    role: Optional[str] = "Staff Member"
    permissions: Optional[List[str]] = ["dashboard", "orders", "billing"]
    password: Optional[str] = None
    profile_image_url: Optional[str] = None
    avatar: Optional[str] = None


class StaffUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    permissions: Optional[List[str]] = None
    status: Optional[str] = None
    profile_image_url: Optional[str] = None
    password: Optional[str] = None


def _get_business_for_user(current_user: dict) -> dict:
    biz_col = get_collection("businesses")
    biz_id = current_user.get("business_id")
    if not biz_id:
        biz = biz_col.find_one({"owner_id": current_user["id"]})
        if biz:
            return biz
        raise HTTPException(status_code=404, detail="No business associated with this account.")
    biz = biz_col.find_one({"id": biz_id}) or biz_col.find_one({"owner_id": current_user["id"]})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")
    return biz


# -----------------------------------------------------------------------------
# 1. STAFF LOGIN ENDPOINT
# -----------------------------------------------------------------------------
@router.post("/api/auth/staff/login")
def login_staff(req: StaffLoginRequest):
    users_col = get_collection("users")
    email = req.email.strip().lower()

    user = users_col.find_one({"email": email, "role": "STAFF"})
    if not user:
        user = users_col.find_one({"phone": req.email.strip(), "role": "STAFF"})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid staff credentials.")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Staff account is disabled. Contact your manager.")

    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid staff credentials.")

    biz_id = user.get("business_id")
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": biz_id}) if biz_id else None

    token = create_access_token({
        "sub": user["id"],
        "role": "STAFF",
        "business_id": biz_id,
        "permissions": user.get("permissions", [])
    })

    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    return {
        "success": True,
        "access_token": token,
        "token": token,
        "token_type": "bearer",
        "user": user_safe,
        "business": biz,
        "permissions": user.get("permissions", [])
    }


# -----------------------------------------------------------------------------
# 2. BUSINESS STAFF CRUD
# -----------------------------------------------------------------------------
@router.get("/api/business/staff")
def list_business_staff(current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]

    staff_col = get_collection("store_staff")
    staff_list = staff_col.find({"business_id": biz_id})
    if not staff_list:
        # Also check store_id
        staff_list = staff_col.find({"store_id": biz_id})
    return {"staff": staff_list}


@router.post("/api/business/staff")
def create_business_staff(req: StaffCreateRequest, current_user: dict = Depends(get_current_user)):
    # Verify manager permission
    role = (current_user.get("role") or "").upper()
    if role not in ["SUPER_ADMIN", "ADMIN", "BUSINESS", "BUSINESS_OWNER"]:
        user_perms = current_user.get("permissions") or []
        if "staff" not in user_perms and "admin" not in user_perms:
            raise HTTPException(status_code=403, detail="Permission denied. Only owners or staff managers can create staff.")

    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]

    users_col = get_collection("users")
    staff_col = get_collection("store_staff")
    email = req.email.strip().lower()

    if users_col.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user_id = f"user_staff_{uuid.uuid4().hex[:12]}"
    staff_id = f"stf_{uuid.uuid4().hex[:12]}"
    plain_password = req.password or f"ZoorUp@{uuid.uuid4().hex[:6]}"
    hashed_pw = hash_password(plain_password)
    now_iso = datetime.now().isoformat()
    avatar = req.profile_image_url or req.avatar

    # Create real user account
    user_doc = {
        "id": user_id,
        "name": req.name,
        "email": email,
        "phone": req.phone or "",
        "password_hash": hashed_pw,
        "role": "STAFF",
        "business_id": biz_id,
        "permissions": req.permissions or ["dashboard", "orders", "billing"],
        "is_active": True,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    users_col.insert_one(user_doc)

    # Create staff record
    staff_doc = {
        "id": staff_id,
        "business_id": biz_id,
        "store_id": biz_id,
        "user_id": user_id,
        "name": req.name,
        "email": email,
        "phone": req.phone or "",
        "role": req.role or "Staff Member",
        "permissions": req.permissions or ["dashboard", "orders", "billing"],
        "status": "ACTIVE",
        "is_active": True,
        "profile_image_url": avatar,
        "avatar": avatar,
        "joined_date": datetime.now().strftime("%Y-%m-%d"),
        "created_at": now_iso,
        "updated_at": now_iso
    }
    staff_col.insert_one(staff_doc)

    return {
        "success": True,
        "staff": staff_doc,
        "default_password": plain_password if not req.password else None
    }


@router.patch("/api/business/staff/{staff_id}")
def update_business_staff(staff_id: str, req: StaffUpdateRequest, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    staff_col = get_collection("store_staff")
    users_col = get_collection("users")

    staff = staff_col.find_one({"id": staff_id, "business_id": biz_id}) or staff_col.find_one({"id": staff_id, "store_id": biz_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")

    updates = {}
    user_updates = {}
    if req.name is not None:
        updates["name"] = req.name
        user_updates["name"] = req.name
    if req.role is not None:
        updates["role"] = req.role
    if req.phone is not None:
        updates["phone"] = req.phone
        user_updates["phone"] = req.phone
    if req.permissions is not None:
        updates["permissions"] = req.permissions
        user_updates["permissions"] = req.permissions
    if req.status is not None:
        updates["status"] = req.status
        updates["is_active"] = (req.status.upper() == "ACTIVE")
        user_updates["is_active"] = (req.status.upper() == "ACTIVE")
    if req.profile_image_url is not None:
        updates["profile_image_url"] = req.profile_image_url
        updates["avatar"] = req.profile_image_url
    if req.password is not None:
        user_updates["password_hash"] = hash_password(req.password)

    updates["updated_at"] = datetime.now().isoformat()
    staff_col.update_one({"id": staff_id}, {"$set": updates})

    if staff.get("user_id") and user_updates:
        users_col.update_one({"id": staff["user_id"]}, {"$set": user_updates})

    updated_staff = staff_col.find_one({"id": staff_id})
    return {"success": True, "staff": updated_staff}


@router.delete("/api/business/staff/{staff_id}")
def delete_business_staff(staff_id: str, current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]
    staff_col = get_collection("store_staff")
    users_col = get_collection("users")

    staff = staff_col.find_one({"id": staff_id, "business_id": biz_id}) or staff_col.find_one({"id": staff_id, "store_id": biz_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found.")

    staff_col.delete_one({"id": staff_id})
    if staff.get("user_id"):
        users_col.delete_one({"id": staff["user_id"]})

    return {"success": True, "message": "Staff member deleted successfully."}
