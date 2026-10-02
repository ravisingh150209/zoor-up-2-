"""
ZOOR UP Image Upload & Asset Management Routes
Supports secure image uploads with MIME validation, size limits,
unique filenames, path traversal prevention, and tenant isolation.
"""
import os
import uuid
import time
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from pydantic import BaseModel
from backend.auth import get_current_user
from backend.database import get_collection
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB limit
ALLOWED_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _resolve_upload_owner(current_user: dict, requested_business_id: Optional[str]):
    role = (current_user.get("role") or "").upper()
    if role == ROLE_BUSINESS_OWNER:
        businesses_col = get_collection("businesses")
        business = businesses_col.find_one({"owner_id": current_user.get("id")})
        if not business and current_user.get("business_id"):
            business = businesses_col.find_one({"id": current_user["business_id"], "owner_id": current_user.get("id")})
        if not business:
            raise HTTPException(status_code=403, detail="Business ownership could not be verified.")
        if requested_business_id and requested_business_id != business.get("id"):
            raise HTTPException(status_code=403, detail="You can only upload assets for your own business.")
        return {"owner_user_id": current_user["id"], "business_id": business["id"], "owner_role": role}
    if role == ROLE_CUSTOMER and not requested_business_id:
        return {"owner_user_id": current_user["id"], "business_id": None, "owner_role": role}
    raise HTTPException(status_code=403, detail="You are not allowed to upload assets for this business.")


def _has_valid_image_signature(content_type: str, contents: bytes) -> bool:
    if content_type in ("image/jpeg", "image/jpg"):
        return contents.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return contents.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/gif":
        return contents.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return len(contents) >= 12 and contents[:4] == b"RIFF" and contents[8:12] == b"WEBP"
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

    # 4. Generate secure unique filename (prevent path traversal)
    safe_prefix = "".join(char if char.isalnum() or char in "-_" else "_" for char in (entity_type or "img"))[:40] or "img"
    unique_name = f"{safe_prefix}_{uuid.uuid4().hex}_{int(time.time())}{original_ext}"
    destination_path = os.path.join(UPLOAD_DIR, unique_name)

    # Path traversal safety check
    if not os.path.commonpath([UPLOAD_DIR, destination_path]) == UPLOAD_DIR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid destination filename."
        )

    # 5. Write to disk
    with open(destination_path, "wb") as f:
        f.write(contents)

    get_collection("upload_assets").insert_one({
        "id": unique_name,
        "filename": unique_name,
        **owner,
        "created_at": time.time(),
    })

    public_url = f"/uploads/{unique_name}"

    return {
        "success": True,
        "url": public_url,
        "filename": unique_name,
        "size": file_size,
        "mime_type": content_type,
        "entity_type": entity_type,
        "business_id": owner["business_id"]
    }

@router.delete("/image")
def delete_image(req: DeleteImageRequest, current_user: dict = Depends(get_current_user)):
    if not req.url:
        raise HTTPException(status_code=400, detail="Image URL is required.")

    # Extract filename from URL
    filename = req.url.split("/")[-1]
    # Path traversal protection
    filename = os.path.basename(filename)
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid image URL.")

    assets_col = get_collection("upload_assets")
    asset = assets_col.find_one({"filename": filename, "owner_user_id": current_user.get("id")})
    if not asset:
        raise HTTPException(status_code=404, detail="Image not found or access denied.")

    target_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.commonpath([UPLOAD_DIR, target_path]) == UPLOAD_DIR:
        raise HTTPException(status_code=400, detail="Security violation: Path traversal detected.")

    if os.path.exists(target_path):
        try:
            os.remove(target_path)
        except OSError:
            raise HTTPException(status_code=500, detail="Failed to remove the image.")
    assets_col.delete_one({"filename": filename, "owner_user_id": current_user.get("id")})

    return {
        "success": True,
        "message": "Image removed successfully",
        "url": req.url
    }
