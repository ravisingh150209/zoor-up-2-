"""
ZOOR UP QR Code Resolution, Public Menu & Product Catalog Routes
Handles authoritative QR resolution, public digital menus, business isolation,
and product catalog management.
"""
import re
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from backend.models import (
    QRResolveRequest,
    QRConnectRequest,
    ProductCreateRequest,
    ProductUpdateRequest,
    BusinessInviteCreateRequest,
    BusinessInviteAcceptRequest,
    ROLE_BUSINESS_OWNER,
    ROLE_SUPER_ADMIN,
    ROLE_CUSTOMER
)
from backend.database import get_collection
from backend.auth import get_current_user, get_optional_current_user, require_role

BUSINESS_MANAGEMENT_ROLES = [
    ROLE_BUSINESS_OWNER,
    ROLE_SUPER_ADMIN,
    "business",
    "BUSINESS",
    "BUSINESS_OWNER",
    "admin",
    "ADMIN",
    "SUPER_ADMIN",
    "STAFF",
    "staff"
]

router = APIRouter(prefix="/api", tags=["QR, Public Menu & Catalog"])


def _assert_business_access(current_user: dict, business_id: str):
    role = (current_user.get("role") or "").upper()
    if role == ROLE_SUPER_ADMIN:
        return
    biz = get_collection("businesses").find_one({"id": business_id})
    if not biz:
        raise HTTPException(status_code=403, detail="You do not have permission to manage this business.")
    if role in (ROLE_BUSINESS_OWNER, "BUSINESS") and biz.get("owner_id") == current_user.get("id"):
        return
    if role == "STAFF" and current_user.get("business_id") == business_id:
        permissions = current_user.get("permissions") or []
        allowed = (isinstance(permissions, list) and "products" in [str(item).lower() for item in permissions]) or (
            isinstance(permissions, dict) and bool(permissions.get("products"))
        )
        if allowed:
            return
    else:
        raise HTTPException(status_code=403, detail="You do not have permission to manage this business.")
    raise HTTPException(status_code=403, detail="Product permission is required for this business.")


# =============================================================
# 1. PUBLIC DIRECTORY / RESTAURANT & BUSINESS LISTING
# =============================================================

@router.get("/public/businesses")
def get_public_businesses():
    """
    Returns public list of active registered businesses/dining partners.
    No authentication required.
    """
    businesses_col = get_collection("businesses")
    all_biz = businesses_col.find({"status": "ACTIVE"})
    if not all_biz:
        all_biz = businesses_col.find()

    result = []
    for b in all_biz:
        result.append({
            "id": b["id"],
            "name": b.get("name", "Store"),
            "slug": b.get("slug", b["id"]),
            "category": b.get("category", "General"),
            "city": b.get("city", "Mumbai"),
            "state": b.get("state", "Maharashtra"),
            "address": b.get("address", ""),
            "logo": b.get("logo") or b.get("logo_url"),
            "logo_url": b.get("logo") or b.get("logo_url"),
            "cover_image": b.get("cover_image") or b.get("cover_photo_url"),
            "cover_photo_url": b.get("cover_image") or b.get("cover_photo_url"),
            "upi_id": b.get("upi_id", ""),
            "stamps_required": int(b.get("stamps_required", 10) or 10),
            "reward_description": b.get("reward_description", ""),
            "menu_enabled": b.get("menu_enabled", True)
        })
    return result


# =============================================================
# 2. STANDARDIZED QR PARSING & RESOLUTION ENGINE
# =============================================================

def parse_qr_code(qr_data: str) -> Dict[str, Any]:
    """
    Parses any ZOOR UP QR code format into a standardized structure:
    Supports:
    1. Standard HTTPS: https://app.zoorup.com/b/{id}, https://zoor-up-9b3a3.web.app/b/{id}
       Subtypes: /b/{id}/menu, /b/{id}/join, /b/{id}/checkin, /b/{id}/table/{table_id}
    2. Legacy URLs: /menu/{id}, /m/{id}, /checkin/{id}, /loyalty/{id}
    3. Native Scheme: zoorup://b/{id}, zoorup://menu/{id}, zoorup://checkin/{id}, zoorup://table/{id}/{tbl}
    4. JSON Payloads: {"v": 1, "type": "business", "business_id": "..."}
    5. Customer Universal Passes: /customer/{id} or ZUP-CUS-...
    6. Raw IDs, Slugs & Query Parameters: ?business_id=...
    """
    if not qr_data or not isinstance(qr_data, str):
        return {"valid": False, "error": "QR data is empty or invalid."}

    clean = qr_data.strip()
    if not clean:
        return {"valid": False, "error": "QR data is empty."}

    # 1. JSON payload
    if clean.startswith("{") and clean.endswith("}"):
        try:
            import json
            payload = json.loads(clean)
            b_id = payload.get("business_id") or payload.get("businessId") or payload.get("id")
            raw_type = (payload.get("type") or "business").lower()
            if raw_type in ["druto_business_checkin", "zoorup_business_checkin", "checkin"]:
                q_type = "checkin"
            elif raw_type in ["store", "storefront", "business"]:
                q_type = "business"
            elif raw_type in ["loyalty", "join"]:
                q_type = "join"
            elif raw_type == "menu":
                q_type = "menu"
            elif raw_type == "table":
                q_type = "table"
            else:
                q_type = "business"

            return {
                "valid": bool(b_id),
                "business_identifier": str(b_id).strip() if b_id else None,
                "type": q_type,
                "table_id": payload.get("table_id") or payload.get("tableId"),
                "version": payload.get("v", 1)
            }
        except Exception:
            pass

    # 2. Customer Universal Pass QR: /customer/{customer_id} or ZUP-CUS-...
    m_cus = re.search(r"(?:https?://[^/]+)?/customer/([a-zA-Z0-9_-]+)", clean, re.IGNORECASE)
    if m_cus or clean.startswith("ZUP-CUS-"):
        cus_id = m_cus.group(1) if m_cus else clean
        return {
            "valid": True,
            "type": "customer",
            "customer_id": cus_id
        }

    # 3. New Standard HTTPS format: /b/{business_id}/...
    # Table direct: /b/{id}/table/{table_id}
    m_b_tbl = re.search(r"(?:https?://[^/]+)?/b/([a-zA-Z0-9_-]+)/table/([a-zA-Z0-9_-]+)", clean, re.IGNORECASE)
    if m_b_tbl:
        return {
            "valid": True,
            "business_identifier": m_b_tbl.group(1),
            "type": "table",
            "table_id": m_b_tbl.group(2)
        }

    # Subroutes: /b/{id}/(menu|join|checkin|loyalty)
    m_b_sub = re.search(r"(?:https?://[^/]+)?/b/([a-zA-Z0-9_-]+)/(menu|join|checkin|loyalty)", clean, re.IGNORECASE)
    if m_b_sub:
        raw_type = m_b_sub.group(2).lower()
        q_type = "join" if raw_type == "loyalty" else raw_type
        return {
            "valid": True,
            "business_identifier": m_b_sub.group(1),
            "type": q_type
        }

    # Base Storefront: /b/{id}
    m_b = re.search(r"(?:https?://[^/]+)?/b/([a-zA-Z0-9_-]+)", clean, re.IGNORECASE)
    if m_b:
        return {
            "valid": True,
            "business_identifier": m_b.group(1),
            "type": "business"
        }

    # 4. Legacy URL Patterns:
    # /menu/{id} or /m/{id}
    m_menu = re.search(r"(?:https?://[^/]+)?/(?:menu|m)/([a-zA-Z0-9_-]+)", clean, re.IGNORECASE)
    if m_menu:
        return {
            "valid": True,
            "business_identifier": m_menu.group(1),
            "type": "menu"
        }

    # /checkin/{id}
    m_chk = re.search(r"(?:https?://[^/]+)?/checkin/([a-zA-Z0-9_-]+)", clean, re.IGNORECASE)
    if m_chk:
        return {
            "valid": True,
            "business_identifier": m_chk.group(1),
            "type": "checkin"
        }

    # /loyalty/{id} or /join/{token or business_id}
    m_loy = re.search(r"(?:https?://[^/]+)?/(?:loyalty|join)/([a-zA-Z0-9_-]+)", clean, re.IGNORECASE)
    if m_loy:
        token_value = m_loy.group(1)
        return {
            "valid": True,
            "business_identifier": token_value,
            "type": "join",
            "invite_token": token_value if clean.lower().startswith("https://") and "/join/" in clean.lower() else None
        }

    # 5. Native Scheme Deep Links: zoorup://...
    if clean.startswith("zoorup://"):
        path = clean[9:].strip("/")
        parts = path.split("/")
        if len(parts) >= 1:
            lead = parts[0].lower()
            if lead == "b" and len(parts) >= 2:
                b_id = parts[1]
                sub = parts[2].lower() if len(parts) >= 3 else "business"
                tbl = parts[3] if len(parts) >= 4 and sub == "table" else None
                return {"valid": True, "business_identifier": b_id, "type": sub, "table_id": tbl}
            elif lead == "table" and len(parts) >= 3:
                return {"valid": True, "business_identifier": parts[1], "type": "table", "table_id": parts[2]}
            elif lead in ["menu", "checkin", "loyalty", "join"] and len(parts) >= 2:
                q_type = "join" if lead == "loyalty" else lead
                return {"valid": True, "business_identifier": parts[1], "type": q_type, "invite_token": parts[1] if lead == "join" else None}
            else:
                return {"valid": True, "business_identifier": parts[0], "type": "business"}

    # 6. Query Parameters: ?business_id=... plus invite_token=...
    if "invite_token=" in clean:
        m_inv = re.search(r'invite_token=([a-zA-Z0-9_-]+)', clean)
        if m_inv:
            return {"valid": True, "business_identifier": m_inv.group(1), "type": "join", "invite_token": m_inv.group(1)}

    if "business_id=" in clean:
        m_bid = re.search(r'business_id=([a-zA-Z0-9_-]+)', clean)
        if m_bid:
            m_t = re.search(r'type=([a-zA-Z0-9_-]+)', clean)
            m_tbl = re.search(r'table_id=([a-zA-Z0-9_-]+)', clean)
            return {
                "valid": True,
                "business_identifier": m_bid.group(1),
                "type": m_t.group(1).lower() if m_t else "business",
                "table_id": m_tbl.group(1) if m_tbl else None
            }

    # 7. Raw identifier fallback
    return {
        "valid": True,
        "business_identifier": clean,
        "type": "business"
    }


def find_business_by_identifier(raw_identifier: str, businesses_col):
    """
    Robust identifier resolution for public menus, storefronts, and QR scans.
    Returns (business_dict, is_active_bool).
    """
    if not raw_identifier:
        return None, False

    clean = raw_identifier.strip()
    if not clean:
        return None, False

    candidates = [clean]
    if clean.lower().startswith("store-"):
        candidates.append(clean[6:])
    else:
        candidates.append(f"store-{clean}")

    biz = None
    for cand in candidates:
        biz = (
            businesses_col.find_one({"slug": cand}) or
            businesses_col.find_one({"id": cand}) or
            businesses_col.find_one({"business_id": cand})
        )
        if biz:
            break

    if not biz:
        # Case-insensitive full search fallback
        all_biz = businesses_col.find()
        clean_lower = clean.lower()
        stripped_lower = clean[6:].lower() if clean.lower().startswith("store-") else clean_lower

        for b in all_biz:
            b_slug = (b.get("slug") or "").lower()
            b_id = (b.get("id") or "").lower()
            b_biz_id = (b.get("business_id") or "").lower()
            if (
                b_slug in [clean_lower, stripped_lower] or
                b_id in [clean_lower, stripped_lower] or
                b_biz_id in [clean_lower, stripped_lower]
            ):
                biz = b
                break

    if not biz:
        return None, False

    # Check active status
    status_str = (biz.get("status") or "ACTIVE").upper()
    is_deleted = bool(biz.get("is_deleted", False))
    is_active = (status_str not in ["INACTIVE", "SUSPENDED", "DELETED"]) and not is_deleted

    return biz, is_active


def _normalize_qr_type_name(qr_type: Optional[str]) -> str:
    """Return the API-facing type label expected by consumers."""
    normalized = (qr_type or "business").strip().lower()
    if normalized in ["menu"]:
        return "MENU"
    if normalized in ["checkin"]:
        return "CHECKIN"
    if normalized in ["join", "loyalty"]:
        return "LOYALTY"
    if normalized in ["customer"]:
        return "CUSTOMER"
    if normalized in ["table"]:
        return "TABLE"
    return "BUSINESS"


def _build_qr_destination(biz_slug: str, qr_type: str, table_id: Optional[str] = None) -> tuple:
    """Returns (canonical_path, full_web_url)"""
    q_type = (qr_type or "business").strip().lower()
    if q_type == "menu":
        path = f"/b/{biz_slug}/menu"
    elif q_type in ["join", "loyalty"]:
        path = f"/b/{biz_slug}/join"
    elif q_type == "checkin":
        path = f"/b/{biz_slug}/checkin"
    elif q_type == "table" and table_id:
        path = f"/b/{biz_slug}/table/{table_id}"
    else:
        path = f"/b/{biz_slug}"

    web_url = f"https://zoor-up-9b3a3.web.app{path}"
    return path, web_url


def _link_customer_to_business(customer_id: str, business_id: str, source: str = "qr_scan") -> tuple:
    """
    Idempotently links authenticated customer to a business.
    Enforces unique constraint on (customer_id, business_id).
    Returns (already_connected: bool, relationship_record: dict).
    """
    cb_col = get_collection("customer_businesses")
    existing = cb_col.find_one({"customer_id": customer_id, "business_id": business_id})
    if existing:
        if existing.get("status") == "active":
            return True, existing
        cb_col.update_one(
            {"id": existing["id"]},
            {"$set": {"status": "active", "source": source, "updated_at": datetime.now().isoformat()}},
        )
        return False, cb_col.find_one({"id": existing["id"]})

    now_iso = datetime.now().isoformat()
    new_cb = {
        "id": f"cb_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "business_id": business_id,
        "source": source,
        "status": "active",
        "created_at": now_iso,
        "updated_at": now_iso
    }
    try:
        cb_col.insert_one(new_cb)
        return False, new_cb
    except Exception:
        existing = cb_col.find_one({"customer_id": customer_id, "business_id": business_id})
        if existing:
            return True, existing
        raise


def _hash_invite_token(raw_token: str) -> str:
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


@router.post("/qr/invite/create")
def create_business_customer_invite(
    req: BusinessInviteCreateRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_SUPER_ADMIN]))
):
    """Create a short-lived invite link for an invited customer to join a business."""
    business_id = (req.business_id or "").strip()
    if not business_id:
        raise HTTPException(status_code=400, detail="Business ID is required.")

    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": business_id}) or businesses_col.find_one({"slug": business_id})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN and biz.get("owner_id") != current_user.get("id"):
        raise HTTPException(status_code=403, detail="You can only create invites for your own business.")

    invite_col = get_collection("business_invites")
    email = (req.email or "").strip().lower()
    if email:
        existing = invite_col.find_one({
            "business_id": biz["id"],
            "customer_email": email,
            "status": "active"
        })
        if existing:
            expires_at = existing.get("expires_at") or (datetime.now() + timedelta(hours=req.expires_hours or 48)).isoformat()
            return {
                "success": True,
                "invite_token": existing.get("invite_token"),
                "business_id": biz["id"],
                "business_slug": biz.get("slug", biz["id"]),
                "business_name": biz.get("name", "Partner Store"),
                "destination": f"/b/{biz.get('slug', biz['id'])}/join",
                "expires_at": expires_at,
                "already_exists": True,
            }

    invite_token = secrets.token_urlsafe(24)
    now = datetime.now()
    expires_at = (now + timedelta(hours=max(1, int(req.expires_hours or 48)))).isoformat()
    invite_doc = {
        "id": f"invite_{uuid.uuid4().hex[:12]}",
        "business_id": biz["id"],
        "customer_email": email,
        "customer_name": (req.name or "Customer").strip() or "Customer",
        "customer_id": req.customer_id or None,
        "invited_by_user_id": current_user.get("id"),
        "token": invite_token,
        "invite_token": invite_token,
        "token_hash": _hash_invite_token(invite_token),
        "status": "active",
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "used_at": None,
        "used_by_customer_id": None,
    }
    invite_col.insert_one(invite_doc)
    return {
        "success": True,
        "invite_token": invite_token,
        "business_id": biz["id"],
        "business_slug": biz.get("slug", biz["id"]),
        "business_name": biz.get("name", "Partner Store"),
        "destination": f"/b/{biz.get('slug', biz['id'])}/join",
        "expires_at": expires_at,
        "qr_url": f"https://app.zoorup.com/join/{invite_token}",
        "already_exists": False,
    }


@router.post("/qr/invite/accept")
def accept_business_customer_invite(
    req: BusinessInviteAcceptRequest,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    """Accept a valid invite link for a customer and connect them to the business."""
    token = (req.invite_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Invite token is required.")

    invite_col = get_collection("business_invites")
    invite = invite_col.find_one({"token_hash": _hash_invite_token(token)})
    if not invite:
        raise HTTPException(status_code=404, detail="This invite link is invalid or has already been used.")

    expires_at = invite.get("expires_at")
    if expires_at:
        try:
            exp_str = str(expires_at).replace("Z", "+00:00")
            exp_dt = datetime.fromisoformat(exp_str)
            now_dt = datetime.now(timezone.utc) if exp_dt.tzinfo else datetime.now()
            if exp_dt < now_dt:
                invite_col.update_one({"id": invite["id"]}, {"$set": {"status": "expired", "updated_at": datetime.now().isoformat()}})
                raise HTTPException(status_code=410, detail="This invite link has expired.")
        except HTTPException:
            raise
        except Exception:
            pass

    if invite.get("status") not in [None, "active"]:
        raise HTTPException(status_code=400, detail="This invite link is no longer active.")

    if invite.get("customer_email"):
        invited_email = (invite.get("customer_email") or "").lower()
        current_email = (current_user.get("email") or "").lower()
        if invited_email and invited_email != current_email:
            raise HTTPException(status_code=403, detail="This invite is intended for a different customer account.")

    business_id = invite.get("business_id")
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": business_id})
    if not biz:
        raise HTTPException(status_code=404, detail="The business linked to this invite no longer exists.")

    customer_id = current_user.get("customer_id") or current_user.get("id")
    already_connected, record = _link_customer_to_business(customer_id, business_id, "invite")
    now = datetime.now().isoformat()
    invite_col.update_one(
        {"id": invite["id"]},
        {"$set": {"status": "used", "used_by_customer_id": customer_id, "used_at": now, "customer_email": (current_user.get("email") or invite.get("customer_email")), "updated_at": now}}
    )

    return {
        "success": True,
        "already_connected": already_connected,
        "business_id": business_id,
        "business_slug": biz.get("slug", business_id),
        "business_name": biz.get("name", "Partner Store"),
        "customer_id": customer_id,
        "invite_id": invite.get("id"),
        "connected_record": record,
    }


# =============================================================
# 3. GET /api/qr/resolve — QUERY PARAMETER & TOKEN RESOLVER
# =============================================================

@router.get("/qr/resolve")
def resolve_qr_get(
    business_id: Optional[str] = None,
    type: Optional[str] = None,
    table_id: Optional[str] = None,
    token: Optional[str] = None,
    url: Optional[str] = None,
    qr_data: Optional[str] = None,
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    """
    Authoritative GET resolver for ZOOR UP QR codes.
    Validates QR format, business existence, and active status.
    Returns destination and business profile without exposing secrets.
    """
    raw_input = qr_data or url or token or business_id
    if not raw_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired ZOOR UP QR code."
        )

    parsed = parse_qr_code(raw_input)
    b_id = parsed.get("business_identifier") or business_id
    q_type = type or parsed.get("type") or "business"
    tbl_id = table_id or parsed.get("table_id")

    invite_token = parsed.get("invite_token")
    if invite_token:
        invite_col = get_collection("business_invites")
        invite = invite_col.find_one({"invite_token": invite_token}) or invite_col.find_one({"token_hash": _hash_invite_token(invite_token)})
        if not invite:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid or expired invite link.")
        if invite.get("status") not in [None, "active"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This invite link is no longer active.")
        business_id = invite.get("business_id")
        if not business_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite does not include a valid business.")
        businesses_col = get_collection("businesses")
        biz = businesses_col.find_one({"id": business_id}) or businesses_col.find_one({"slug": business_id})
        if not biz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The business for this invite no longer exists.")
        biz_id = biz["id"]
        biz_slug = biz.get("slug", biz_id)
        destination, web_url = _build_qr_destination(biz_slug, "join", tbl_id)
        return {
            "valid": True,
            "success": True,
            "business_id": biz_id,
            "business_slug": biz_slug,
            "business_name": biz.get("name", "Store"),
            "type": "JOIN",
            "invite_token": invite_token,
            "destination": destination,
            "target_url": destination,
            "web_url": web_url,
            "already_connected": bool(current_user and current_user.get("role") in ["customer", ROLE_CUSTOMER] and _link_customer_to_business(current_user.get("customer_id") or current_user.get("id"), biz_id, "invite")[0])
        }

    if not b_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired ZOOR UP QR code."
        )

    businesses_col = get_collection("businesses")
    biz, is_active = find_business_by_identifier(b_id, businesses_col)

    if not biz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired ZOOR UP QR code."
        )

    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This business is currently inactive or unavailable."
        )

    biz_id = biz["id"]
    biz_slug = biz.get("slug", biz_id)
    destination, web_url = _build_qr_destination(biz_slug, q_type, tbl_id)

    # If customer is authenticated, idempotently connect them
    already_connected = False
    if current_user and current_user.get("role") in ["customer", ROLE_CUSTOMER]:
        c_id = current_user.get("customer_id") or current_user.get("id")
        already_connected, _ = _link_customer_to_business(c_id, biz_id, "qr_scan")

    logo_url = biz.get("logo") or biz.get("logo_url") or ""
    cover_url = biz.get("cover_image") or biz.get("cover_photo_url") or ""

    return {
        "valid": True,
        "success": True,
        "business_id": biz_id,
        "business_slug": biz_slug,
        "business_name": biz.get("name", "Store"),
        "business_logo": logo_url,
        "cover_image": cover_url,
        "category": biz.get("category", "General"),
        "address": biz.get("address", ""),
        "phone": biz.get("phone", ""),
        "upi_id": biz.get("upi_id", ""),
        "type": _normalize_qr_type_name(q_type),
        "table_id": tbl_id,
        "destination": destination,
        "target_url": destination,
        "web_url": web_url,
        "already_connected": already_connected,
        "menu_enabled": biz.get("menu_enabled", True)
    }


# =============================================================
# 4. POST /api/qr/resolve — PAYLOAD SCAN RESOLVER
# =============================================================

@router.post("/qr/resolve")
def resolve_qr(
    req: QRResolveRequest,
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    """
    Authoritative POST backend QR code resolver for mobile and camera scans.
    Recognizes all QR versions, standard HTTPS formats, and legacy links.
    Returns authoritative target destination and business details.
    """
    qr_data = (req.qr_data or "").strip()
    if not qr_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QR data is required."
        )

    parsed = parse_qr_code(qr_data)
    if not parsed.get("valid"):
        return {
            "valid": False,
            "success": False,
            "error": "Invalid or expired ZOOR UP QR code."
        }

    # Handle customer universal pass
    if parsed.get("type") == "customer":
        cus_id = parsed.get("customer_id")
        return {
            "valid": True,
            "success": True,
            "type": "CUSTOMER",
            "customer_id": cus_id,
            "destination": f"/customer/{cus_id}",
            "target_url": f"/customer/{cus_id}"
        }

    invite_token = parsed.get("invite_token")
    if invite_token:
        invite_col = get_collection("business_invites")
        invite = invite_col.find_one({"invite_token": invite_token}) or invite_col.find_one({"token_hash": _hash_invite_token(invite_token)})
        if not invite:
            return {"valid": False, "success": False, "error": "Invalid or expired invite link."}
        if invite.get("status") not in [None, "active"]:
            return {"valid": False, "success": False, "error": "This invite link is no longer active."}
        biz = get_collection("businesses").find_one({"id": invite.get("business_id")})
        if not biz:
            return {"valid": False, "success": False, "error": "The business for this invite no longer exists."}
        destination, web_url = _build_qr_destination(biz.get("slug", biz["id"]), "join")
        return {
            "valid": True,
            "success": True,
            "business_id": biz["id"],
            "business_slug": biz.get("slug", biz["id"]),
            "business_name": biz.get("name", "Partner Store"),
            "type": "JOIN",
            "invite_token": invite_token,
            "destination": destination,
            "target_url": destination,
            "web_url": web_url
        }

    b_id = parsed.get("business_identifier")
    if not b_id:
        return {
            "valid": False,
            "success": False,
            "error": "Invalid or expired ZOOR UP QR code."
        }

    businesses_col = get_collection("businesses")
    biz, is_active = find_business_by_identifier(b_id, businesses_col)

    if not biz:
        return {
            "valid": False,
            "success": False,
            "error": "Business not found. Please verify the QR code."
        }

    if not is_active:
        return {
            "valid": False,
            "success": False,
            "error": "This business is currently inactive or unavailable."
        }

    biz_id = biz["id"]
    biz_slug = biz.get("slug", biz_id)
    q_type = parsed.get("type", "business")
    tbl_id = parsed.get("table_id")
    destination, web_url = _build_qr_destination(biz_slug, q_type, tbl_id)

    # Idempotent customer connection if authenticated
    already_connected = False
    if current_user and current_user.get("role") in ["customer", ROLE_CUSTOMER]:
        c_id = current_user.get("customer_id") or current_user.get("id")
        already_connected, _ = _link_customer_to_business(c_id, biz_id, "qr_scan")

    logo_url = biz.get("logo") or biz.get("logo_url") or ""
    cover_url = biz.get("cover_image") or biz.get("cover_photo_url") or ""

    return {
        "valid": True,
        "success": True,
        "business_id": biz_id,
        "business_slug": biz_slug,
        "business_name": biz.get("name", "Store"),
        "business_logo": logo_url,
        "cover_image": cover_url,
        "category": biz.get("category", "General"),
        "address": biz.get("address", ""),
        "phone": biz.get("phone", ""),
        "upi_id": biz.get("upi_id", ""),
        "type": _normalize_qr_type_name(q_type),
        "table_id": tbl_id,
        "destination": destination,
        "target_url": destination,
        "web_url": web_url,
        "already_connected": already_connected,
        "menu_enabled": biz.get("menu_enabled", True)
    }


# =============================================================
# 5. POST /api/qr/connect — EXPLICIT CUSTOMER BUSINESS CONNECTION
# =============================================================

@router.post("/qr/connect")
def connect_customer_qr(
    req: QRConnectRequest,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    """
    Connects authenticated customer strictly to the scanned business.
    Prevents duplicates using customer_id + business_id uniqueness.
    Prevents duplicate check-in visits within 5 minutes.
    """
    customer_id = current_user.get("customer_id") or current_user.get("id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Customer identity could not be verified.")

    businesses_col = get_collection("businesses")
    biz, is_active = find_business_by_identifier(req.business_id, businesses_col)

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    if not is_active:
        raise HTTPException(status_code=400, detail="This business is currently inactive.")

    biz_id = biz["id"]
    biz_name = biz.get("name", "Store")
    biz_slug = biz.get("slug", biz_id)

    # 1. Enforce unique connection (customer_id, business_id)
    already_connected, _ = _link_customer_to_business(customer_id, biz_id, req.source or "qr_scan")

    # 2. If check-in flow, record visit with duplicate rate-limiting (5 minutes)
    already_checked_in = False
    stamps_awarded = 0
    points_awarded = 0

    if (req.type or "").lower() == "checkin":
        visits_col = get_collection("visits")
        # Check visits in last 5 minutes (300 seconds)
        recent_visits = visits_col.find({"customer_id": customer_id, "business_id": biz_id})
        now = datetime.now(timezone.utc)
        for v in recent_visits:
            ts_str = v.get("timestamp") or v.get("created_at")
            if ts_str:
                try:
                    v_time = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                    if v_time.tzinfo is None:
                        v_time = v_time.replace(tzinfo=timezone.utc)
                    if abs((now - v_time).total_seconds()) < 300:
                        already_checked_in = True
                        break
                except Exception:
                    pass

        if not already_checked_in:
            visits_col.insert_one({
                "id": f"vis_{uuid.uuid4().hex[:12]}",
                "customer_id": customer_id,
                "business_id": biz_id,
                "source": "qr_scan",
                "table_id": req.table_id or None,
                "timestamp": now.isoformat(),
                "created_at": now.isoformat(),
                "status": "confirmed"
            })
            stamps_awarded = 1
            points_awarded = 50

            # Update customer stamps & points in customer record
            customers_col = get_collection("customers")
            customers_col.update_one(
                {"customer_id": customer_id},
                {
                    "$inc": {"stamps": 1, "points": 50, "total_visits": 1},
                    "$set": {"last_visit": now.isoformat()}
                }
            )

    destination, web_url = _build_qr_destination(biz_slug, req.type or "business", req.table_id)

    msg = (
        f"You're already connected to {biz_name}."
        if already_connected
        else f"Successfully connected to {biz_name}!"
    )

    return {
        "success": True,
        "already_connected": already_connected,
        "already_checked_in": already_checked_in,
        "stamps_awarded": stamps_awarded,
        "points_awarded": points_awarded,
        "message": msg,
        "customer_id": customer_id,
        "business_id": biz_id,
        "business_slug": biz_slug,
        "business_name": biz_name,
        "type": req.type or "business",
        "destination": destination,
        "web_url": web_url
    }


# =============================================================
# 3. PUBLIC DIGITAL MENU ENDPOINT (STRICT BUSINESS ISOLATION)
# =============================================================

@router.get("/public/menu/{business_identifier}")
@router.get("/public/b/{business_identifier}")
def get_public_menu(business_identifier: str):
    """
    Public digital storefront and menu resolution.
    Finds business by slug, id, or normalized format, checks if active, enforces business_id isolation,
    and returns branding, categories, products, and available tables for dine-in.
    Does NOT require customer login.
    """
    businesses_col = get_collection("businesses")
    biz, is_active = find_business_by_identifier(business_identifier, businesses_col)

    if not biz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found. Please verify the QR code or link."
        )

    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This business is currently inactive or unavailable."
        )

    biz_id = biz["id"]
    menu_enabled = bool(biz.get("menu_enabled", True))

    # Ensure biz has permanent slug
    if not biz.get("slug"):
        from backend.routes.auth_routes import generate_unique_business_slug
        slug = generate_unique_business_slug(biz.get("name") or "Store", biz_id, businesses_col)
        businesses_col.update_one({"id": biz_id}, {"$set": {"slug": slug}})
        biz["slug"] = slug

    biz_slug = biz.get("slug", biz_id)

    # Fetch products STRICTLY scoped to this business_id
    products_col = get_collection("products")
    raw_products = products_col.find({"business_id": biz_id})

    # Normalize products and extract categories
    normalized_items = []
    categories_set = set()

    for p in raw_products:
        cat = p.get("category", "General") or "General"
        categories_set.add(cat)
        img = p.get("image_url") or p.get("image") or None
        is_active = p.get("active") if p.get("active") is not None else p.get("available", True)

        normalized_items.append({
            "id": p["id"],
            "name": p.get("name", "Menu Item"),
            "description": p.get("description", ""),
            "price": float(p.get("price", 0)),
            "discount_price": float(p.get("discount_price") or p.get("price", 0)),
            "image": img,
            "image_url": img,
            "available": bool(is_active),
            "active": bool(is_active),
            "category": cat,
            "type": p.get("type", "product"),
            "stock": p.get("stock", 50),
            "business_id": biz_id
        })

    categories_list = [{"id": "ALL", "name": "All Items"}] + [
        {"id": c, "name": c} for c in sorted(categories_set)
    ]

    # Fetch active tables for dine-in selection
    tables_col = get_collection("tables")
    raw_tables = tables_col.find({"business_id": biz_id, "is_active": True})
    tables = [
        {
            "id": t["id"],
            "table_number": t.get("table_number") or t.get("name", "Table"),
            "name": t.get("name") or t.get("table_number", "Table"),
            "capacity": t.get("capacity", 4),
            "location": t.get("location", "Main Dining")
        }
        for t in raw_tables
    ]

    logo_url = biz.get("logo") or biz.get("logo_url") or None
    cover_url = biz.get("cover_image") or biz.get("cover_photo_url") or None

    return {
        "success": True,
        "id": biz_id,
        "name": biz.get("name", "Partner Store"),
        "slug": biz_slug,
        "catalog": normalized_items,
        "business": {
            "id": biz_id,
            "business_id": biz_id,
            "name": biz.get("name", "Partner Store"),
            "slug": biz_slug,
            "category": biz.get("category", "Dining & Retail"),
            "description": biz.get("description", ""),
            "address": biz.get("address", ""),
            "city": biz.get("city", "Mumbai"),
            "phone": biz.get("phone", ""),
            "logo": logo_url,
            "logo_url": logo_url,
            "cover_image": cover_url,
            "cover_photo_url": cover_url,
            "upi_id": biz.get("upi_id", ""),
            "stamps_required": int(biz.get("stamps_required", 10) or 10),
            "reward_description": biz.get("reward_description", ""),
            "menu_enabled": menu_enabled
        },
        "menu": {
            "enabled": menu_enabled,
            "categories": categories_list,
            "items": normalized_items
        },
        "categories": categories_list,
        "items": normalized_items,
        "products": normalized_items,
        "tables": tables
    }


# =============================================================
# 4. BUSINESS PRODUCTS & CATALOG CRUD (AUTHENTICATED)
# =============================================================

@router.get("/business/{business_id}/products")
def get_business_products(
    business_id: str,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """
    Returns all catalog items for a business.
    """
    _assert_business_access(current_user, business_id)
    products_col = get_collection("products")
    products = products_col.find({"business_id": business_id})
    return products

@router.post("/business/{business_id}/products")
def create_business_product(
    business_id: str,
    req: ProductCreateRequest,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """
    Creates a new product/menu item for the specified business.
    """
    _assert_business_access(current_user, business_id)
    products_col = get_collection("products")
    product_id = f"prod_{uuid.uuid4().hex[:10]}"
    now_iso = datetime.now().isoformat()

    active_img = req.image_url or req.image or None

    new_prod = {
        "id": product_id,
        "business_id": business_id,
        "name": req.name.strip(),
        "category": req.category.strip() if req.category else "General",
        "price": float(req.price),
        "discount_price": float(req.discount_price if req.discount_price is not None else req.price),
        "description": req.description or "",
        "type": req.type or "product",
        "image": active_img,
        "image_url": active_img,
        "stock": req.stock if req.stock is not None else 50,
        "sku": req.sku or f"SKU-{uuid.uuid4().hex[:6].upper()}",
        "barcode": req.barcode or f"{int(datetime.now().timestamp())}",
        "active": req.active if req.active is not None else True,
        "created_at": now_iso,
        "updated_at": now_iso
    }

    products_col.insert_one(new_prod)
    return new_prod

@router.put("/business/{business_id}/products/{product_id}")
def update_business_product(
    business_id: str,
    product_id: str,
    req: ProductUpdateRequest,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """
    Updates an existing product/menu item.
    """
    _assert_business_access(current_user, business_id)
    products_col = get_collection("products")
    existing = products_col.find_one({"id": product_id, "business_id": business_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found.")

    updates = {k: v for k, v in req.dict().items() if v is not None}
    if "image_url" in updates and not updates.get("image"):
        updates["image"] = updates["image_url"]
    elif "image" in updates and not updates.get("image_url"):
        updates["image_url"] = updates["image"]

    updates["updated_at"] = datetime.now().isoformat()
    products_col.update_one({"id": product_id}, {"$set": updates})

    return products_col.find_one({"id": product_id})

@router.delete("/business/{business_id}/products/{product_id}")
def delete_business_product(
    business_id: str,
    product_id: str,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """
    Deletes a product/menu item.
    """
    _assert_business_access(current_user, business_id)
    products_col = get_collection("products")
    existing = products_col.find_one({"id": product_id, "business_id": business_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found.")

    products_col.delete_one({"id": product_id})
    return {"success": True, "message": f"Product '{existing.get('name')}' deleted successfully."}
