"""
ZOOR UP Image Upload & Asset Management Routes
Supports secure image uploads to Supabase Storage with MIME validation, size limits,
unique filenames, path traversal prevention, and tenant isolation.
"""
import os
import uuid
import time
from datetime import datetime
import urllib.request
import urllib.error
import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from pydantic import BaseModel
from backend.auth import get_current_user
from backend.database import get_collection
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER

logger = logging.getLogger("zoorup.uploads")
router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"}

ALLOWED_STORAGE_BUCKETS = {
    "business-logos",
    "business-covers",
    "product-images",
    "customer-avatars",
    "staff-avatars",
    "business-gallery",
    "offer-images",
    "reward-images",
}

ENTITY_BUCKET_MAP = {
    "business_logo": "business-logos",
    "logo": "business-logos",
    "store_logo": "business-logos",
    "business_cover": "business-covers",
    "cover": "business-covers",
    "banner": "business-covers",
    "cover_photo": "business-covers",
    "product": "product-images",
    "product_image": "product-images",
    "category": "product-images",
    "category_image": "product-images",
    "menu_item": "product-images",
    "service": "product-images",
    "customer": "customer-avatars",
    "customer_profile": "customer-avatars",
    "customer_avatar": "customer-avatars",
    "avatar": "customer-avatars",
    "staff": "staff-avatars",
    "staff_avatar": "staff-avatars",
    "gallery": "business-gallery",
    "business_gallery": "business-gallery",
    "offer": "offer-images",
    "voucher": "offer-images",
    "reward": "reward-images",
}


def _resolve_target_bucket(requested_bucket: Optional[str], entity_type: Optional[str]) -> str:
    if requested_bucket and requested_bucket.strip() in ALLOWED_STORAGE_BUCKETS:
        return requested_bucket.strip()
    clean_entity = (entity_type or "").strip().lower()
    return ENTITY_BUCKET_MAP.get(clean_entity, "product-images")


def _upload_to_supabase_storage(bucket: str, storage_path: str, data: bytes, content_type: str) -> str:
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not supabase_url or not service_role_key:
        raise HTTPException(
            status_code=500,
            detail="Supabase Storage credentials not configured on server."
        )

    clean_bucket = bucket.strip().strip("/")
    clean_path = storage_path.strip().strip("/")
    upload_url = f"{supabase_url}/storage/v1/object/{clean_bucket}/{clean_path}"

    req = urllib.request.Request(upload_url, data=data, method="POST")
    req.add_header("apikey", service_role_key)
    req.add_header("Authorization", f"Bearer {service_role_key}")
    req.add_header("Content-Type", content_type)
    req.add_header("x-upsert", "true")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status in (200, 201):
                return f"{supabase_url}/storage/v1/object/public/{clean_bucket}/{clean_path}"
            raise HTTPException(status_code=500, detail=f"Storage service returned status {resp.status}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        logger.error("Supabase Storage upload HTTP error: %s (%s)", e.code, err_body)
        raise HTTPException(status_code=500, detail=f"Storage upload error: {err_body or e.reason}")
    except Exception as e:
        logger.error("Supabase Storage upload failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Storage connection failed: {str(e)}")


def _delete_from_supabase_storage(bucket: str, storage_path: str) -> bool:
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not supabase_url or not service_role_key:
        return False

    clean_bucket = bucket.strip().strip("/")
    clean_path = storage_path.strip().strip("/")
    delete_url = f"{supabase_url}/storage/v1/object/{clean_bucket}/{clean_path}"

    req = urllib.request.Request(delete_url, method="DELETE")
    req.add_header("apikey", service_role_key)
    req.add_header("Authorization", f"Bearer {service_role_key}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        logger.warning("Supabase Storage delete failed: %s", e)
        return False


def _resolve_upload_owner(current_user: dict, requested_business_id: Optional[str]):
    role = (current_user.get("role") or "").upper()
    user_id = current_user.get("id")

    if role in ("SUPER_ADMIN", "ADMIN"):
        return {
            "owner_user_id": user_id,
            "business_id": requested_business_id or current_user.get("business_id"),
            "owner_role": role,
        }

    if role == ROLE_BUSINESS_OWNER:
        businesses_col = get_collection("businesses")
        business = businesses_col.find_one({"owner_id": user_id})
        if not business and current_user.get("business_id"):
            business = businesses_col.find_one({"id": current_user["business_id"]})
        if not business and requested_business_id:
            business = businesses_col.find_one({"id": requested_business_id, "owner_id": user_id})

        if business:
            biz_id = business["id"]
            if requested_business_id and requested_business_id != biz_id:
                raise HTTPException(status_code=403, detail="You can only upload assets for your own business.")
            return {"owner_user_id": user_id, "business_id": biz_id, "owner_role": role}

        # If business record not yet finalized (e.g. initial onboarding before business creation):
        assigned_biz = requested_business_id or current_user.get("business_id") or f"biz_{user_id[-8:]}"
        return {"owner_user_id": user_id, "business_id": assigned_biz, "owner_role": role}

    if role == "STAFF":
        biz_id = current_user.get("business_id")
        if not biz_id:
            raise HTTPException(status_code=403, detail="Staff account is not linked to a business.")
        if requested_business_id and requested_business_id != biz_id:
            raise HTTPException(status_code=403, detail="Staff cannot upload to another business.")
        return {"owner_user_id": user_id, "business_id": biz_id, "owner_role": role}

    if role == ROLE_CUSTOMER:
        return {"owner_user_id": user_id, "business_id": None, "owner_role": role}

    return {"owner_user_id": user_id, "business_id": requested_business_id, "owner_role": role}


def _has_valid_image_signature(content_type: str, contents: bytes) -> bool:
    if content_type in ("image/jpeg", "image/jpg"):
        return contents.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return contents.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/gif":
        return contents.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return len(contents) >= 12 and contents[:4] == b"RIFF" and contents[8:12] == b"WEBP"
    if content_type == "image/svg+xml":
        header = contents[:512].lower().strip()
        return b"<svg" in header or b"<?xml" in header
    return False


class DeleteImageRequest(BaseModel):
    url: str
    business_id: Optional[str] = None
    user_id: Optional[str] = None


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    entity_type: Optional[str] = Form("general"),
    business_id: Optional[str] = Form(None),
    bucket: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    owner = _resolve_upload_owner(current_user, business_id)

    # 1. Validate content type / MIME
    content_type = file.content_type.lower() if file.content_type else ""
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type '{content_type}'. Only JPEG, PNG, WEBP, GIF, and SVG are allowed."
        )

    # 2. Extract and validate extension
    original_ext = os.path.splitext(file.filename or "")[1].lower()
    if original_ext not in ALLOWED_EXTENSIONS:
        original_ext = ALLOWED_MIME_TYPES[content_type]

    # 3. Read content and validate size
    contents = await file.read(MAX_FILE_SIZE + 1)
    file_size = len(contents)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty."
        )

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds the maximum size of 10MB."
        )
    if not _has_valid_image_signature(content_type, contents):
        raise HTTPException(status_code=400, detail="File content does not match a supported image type.")

    # 4. Resolve target bucket and secure path
    target_bucket = _resolve_target_bucket(bucket, entity_type)
    folder = owner["business_id"] or owner["owner_user_id"] or "shared"
    safe_prefix = "".join(char if char.isalnum() or char in "-_" else "_" for char in (entity_type or "img"))[:40] or "img"
    unique_name = f"{safe_prefix}_{uuid.uuid4().hex[:12]}_{int(time.time())}{original_ext}"
    storage_path = f"{folder}/{unique_name}"

    # 5. Upload directly to Supabase Storage
    public_url = _upload_to_supabase_storage(target_bucket, storage_path, contents, content_type)

    # 6. Record metadata in Supabase PostgreSQL
    try:
        now_iso = datetime.now().isoformat()
        get_collection("upload_assets").insert_one({
            "id": unique_name,
            "filename": unique_name,
            "file_url": public_url,
            "file_type": content_type,
            "size_bytes": file_size,
            "user_id": owner.get("owner_user_id"),
            "business_id": owner.get("business_id"),
            "created_at": now_iso,
            "uploaded_at": now_iso,
        })
    except Exception as db_err:
        logger.warning("Could not persist upload_assets record in DB: %s", db_err)

    return {
        "success": True,
        "url": public_url,
        "filename": unique_name,
        "size": file_size,
        "mime_type": content_type,
        "entity_type": entity_type,
        "business_id": owner["business_id"],
        "bucket": target_bucket,
        "path": storage_path,
    }


@router.delete("/image")
def delete_image(req: DeleteImageRequest, current_user: dict = Depends(get_current_user)):
    if not req.url:
        raise HTTPException(status_code=400, detail="Image URL is required.")

    user_id = current_user.get("id")
    assets_col = get_collection("upload_assets")
    asset = assets_col.find_one({"public_url": req.url, "owner_user_id": user_id})
    if not asset:
        filename = os.path.basename(req.url.split("?")[0])
        asset = assets_col.find_one({"filename": filename, "owner_user_id": user_id})

    if asset:
        target_bucket = asset.get("bucket") or "product-images"
        storage_path = asset.get("storage_path") or f"{asset.get('business_id', user_id)}/{asset.get('filename')}"
        _delete_from_supabase_storage(target_bucket, storage_path)
        assets_col.delete_one({"_id": asset.get("_id") or asset.get("id")})
    elif "/storage/v1/object/public/" in req.url:
        parts = req.url.split("/storage/v1/object/public/")[-1].split("/", 1)
        if len(parts) == 2:
            target_bucket, storage_path = parts[0], parts[1]
            _delete_from_supabase_storage(target_bucket, storage_path)

    return {
        "success": True,
        "message": "Image removed successfully",
        "url": req.url,
    }
