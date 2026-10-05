"""
ZOOR UP Customer Routes
"""
import uuid
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, Depends, Request
from backend.models import CustomerProfileUpdateRequest, QRCheckInRequest, ROLE_CUSTOMER
from backend.database import get_collection
from backend.auth import get_current_user, get_optional_current_user, require_role
from backend.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/api/customer", tags=["Customer"])

# Configurable Level Up Progression:
# LEVEL 1 → BASIC
# LEVEL 2 → SILVER
# LEVEL 3 → GOLD
# LEVEL 4 → PLATINUM
# LEVEL 5 → ADVANCE
DEFAULT_LOYALTY_TIERS = [
    {
        "level": 1,
        "name": "BASIC",
        "min_points": 0,
        "max_points": 499,
        "badge": "BASIC MEMBER",
        "perk": "1x Points on Purchases",
        "color": "#1A2B49",
        "accent_color": "#F59E0B"
    },
    {
        "level": 2,
        "name": "SILVER",
        "min_points": 500,
        "max_points": 1499,
        "badge": "SILVER VIP",
        "perk": "1.2x Points + 5% off vouchers",
        "color": "#334155",
        "accent_color": "#CBD5E1"
    },
    {
        "level": 3,
        "name": "GOLD",
        "min_points": 1500,
        "max_points": 2999,
        "badge": "GOLD PRIVILEGE",
        "perk": "1.5x Points + Priority Dispatch",
        "color": "#18181B",
        "accent_color": "#F59E0B"
    },
    {
        "level": 4,
        "name": "PLATINUM",
        "min_points": 3000,
        "max_points": 4999,
        "badge": "PLATINUM ELITE",
        "perk": "2x Points + Free Delivery",
        "color": "#090D16",
        "accent_color": "#38BDF8"
    },
    {
        "level": 5,
        "name": "ADVANCE",
        "min_points": 5000,
        "max_points": None,
        "badge": "ADVANCE PRESTIGE",
        "perk": "2.5x Points + Exclusive VIP Access",
        "color": "#000000",
        "accent_color": "#A855F7"
    }
]

def get_loyalty_tiers():
    settings_col = get_collection("loyalty_settings")
    saved = settings_col.find_one({"type": "tier_config"})
    if saved and "tiers" in saved and len(saved["tiers"]) >= 5:
        return saved["tiers"]
    return DEFAULT_LOYALTY_TIERS

def calculate_customer_tier(points: int):
    tiers = get_loyalty_tiers()
    pts = max(0, points)
    current_tier = tiers[0]
    current_index = 0

    for idx, t in enumerate(tiers):
        min_p = t.get("min_points", 0)
        max_p = t.get("max_points")
        if max_p is None:
            if pts >= min_p:
                current_tier = t
                current_index = idx
        else:
            if min_p <= pts <= max_p:
                current_tier = t
                current_index = idx
                break

    next_tier = tiers[current_index + 1] if current_index + 1 < len(tiers) else None
    progress_pct = 100
    points_needed = 0

    if next_tier:
        range_pts = next_tier.get("min_points", 0) - current_tier.get("min_points", 0)
        gained = pts - current_tier.get("min_points", 0)
        if range_pts > 0:
            progress_pct = min(100, max(0, int((gained / range_pts) * 100)))
        points_needed = max(0, next_tier.get("min_points", 0) - pts)

    return {
        "current_tier": current_tier,
        "level": current_tier.get("level", 1),
        "level_name": current_tier.get("name", "BASIC"),
        "next_tier": next_tier,
        "points_needed": points_needed,
        "progress_pct": progress_pct,
        "tiers": tiers
    }

@router.get("/loyalty/tiers")
def get_public_loyalty_tiers():
    """
    Returns the configurable loyalty tiers.
    """
    return {
        "success": True,
        "tiers": get_loyalty_tiers()
    }

@router.get("/profile")
def get_customer_profile(current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    user_id = current_user["id"]
    customers_col = get_collection("customers")
    
    # Identify customer strictly from authenticated JWT identity
    cus = customers_col.find_one({"user_id": user_id}) or customers_col.find_one({"phone": current_user.get("phone")})

    if not cus:
        customer_id = current_user.get("customer_id")
        if not customer_id:
            for _ in range(5):
                candidate = f"ZUP-CUS-{secrets.token_hex(4).upper()}"
                if not customers_col.find_one({"customer_id": candidate}):
                    customer_id = candidate
                    break
            if not customer_id:
                customer_id = f"ZUP-CUS-{int(time.time() * 1000) % 100000000:08d}"
        cus = {
            "id": f"cus_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "user_id": user_id,
            "name": current_user.get("name", ""),
            "full_name": current_user.get("name", "") or "Valued Customer",
            "phone": current_user.get("phone", ""),
            "email": current_user.get("email", ""),
            "login_email": current_user.get("email", ""),
            "points": 0,
            "lifetime_points": 0,
            "total_visits": 0,
            "total_spent": 0.0,
            "stamps": 0,
            "segment": "NEW",
            "membership_tier": "BASIC",
            "level": 1,
            "level_name": "BASIC",
            "address": "",
            "dob": "",
            "gender": "",
            "bio": "",
            "notes": "",
            "created_at": datetime.now().isoformat()
        }
        customers_col.insert_one(cus)

    pts = int(cus.get("points", 0))
    tier_info = calculate_customer_tier(pts)
    avatar_val = cus.get("profile_image_url") or cus.get("avatar") or cus.get("photo")
    dob_val = cus.get("dob") or cus.get("birthday", "")

    cus_id = cus.get("id") or f"cus_{uuid.uuid4().hex[:12]}"
    customer_id = cus.get("customer_id") or current_user.get("customer_id") or f"ZUP-CUS-{secrets.token_hex(4).upper()}"

    return {
        "id": cus_id,
        "customer_id": customer_id,
        "name": cus.get("name") or cus.get("full_name") or "",
        "full_name": cus.get("full_name") or cus.get("name") or "",
        "phone": cus.get("phone", "") or current_user.get("phone", ""),
        "email": cus.get("email") or cus.get("login_email") or "",
        "login_email": cus.get("login_email") or cus.get("email") or "",
        "avatar": avatar_val,
        "profile_image_url": avatar_val,
        "photo": avatar_val,
        "dob": dob_val,
        "birthday": dob_val,
        "gender": cus.get("gender", ""),
        "address": cus.get("address", ""),
        "bio": cus.get("bio", ""),
        "notes": cus.get("notes", ""),
        "points": pts,
        "lifetime_points": int(cus.get("lifetime_points", pts)),
        "total_visits": int(cus.get("total_visits", 0)),
        "total_spent": float(cus.get("total_spent", 0.0)),
        "stamps": int(cus.get("stamps", 0)),
        "target_stamps": 10,
        "segment": cus.get("segment", "NEW"),
        "level": tier_info["level"],
        "level_name": tier_info["level_name"],
        "membership_tier": tier_info["level_name"],
        "loyalty": tier_info,
        "created_at": cus.get("created_at")
    }

@router.get("/loyalty/status")
def get_customer_loyalty_status(current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    """
    Returns full authoritative loyalty status for the 3D card and level progression.
    """
    profile = get_customer_profile(current_user)
    pts = profile["points"]
    tier_info = profile["loyalty"]
    stamps = profile["stamps"]
    rewards_unlocked = stamps >= 10

    return {
        "success": True,
        "customer_id": profile["customer_id"],
        "customer_name": profile["name"],
        "points": pts,
        "lifetime_points": profile["lifetime_points"],
        "stamps": stamps,
        "target_stamps": 10,
        "total_visits": profile["total_visits"],
        "level": tier_info["level"],
        "level_name": tier_info["level_name"],
        "membership_tier": tier_info["level_name"],
        "current_tier": tier_info["current_tier"],
        "next_tier": tier_info["next_tier"],
        "points_needed": tier_info["points_needed"],
        "progress_pct": tier_info["progress_pct"],
        "tiers": tier_info["tiers"],
        "reward_unlocked": rewards_unlocked,
        "joined_date": "2026"
    }


def _get_customer_business_loyalty(customer_id: str, business_id: str):
    loyalty_col = get_collection("loyalty")
    record = loyalty_col.find_one({"customer_id": customer_id, "business_id": business_id})
    if not record:
        record = {
            "_id": f"loyal_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": business_id,
            "points": 0,
            "stamps": 0,
            "tier": "BASIC",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        loyalty_col.insert_one(record)
    return record


def _update_customer_business_loyalty(customer_id: str, business_id: str, points_delta: int = 0, stamps_delta: int = 0, reason: str = "CHECKIN", reference_id: Optional[str] = None):
    loyalty_col = get_collection("loyalty")
    customer_businesses_col = get_collection("customer_businesses")
    record = loyalty_col.find_one({"customer_id": customer_id, "business_id": business_id})
    if not record:
        record = {
            "_id": f"loyal_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": business_id,
            "points": 0,
            "stamps": 0,
            "tier": "BASIC",
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        loyalty_col.insert_one(record)

    if points_delta == 0 and stamps_delta == 0:
        return record

    if not customer_businesses_col.find_one({"customer_id": customer_id, "business_id": business_id, "status": "active"}):
        raise HTTPException(status_code=403, detail="Customer is not connected to this business.")

    revised_points = max(0, int(record.get("points", 0)) + int(points_delta))
    revised_stamps = max(0, int(record.get("stamps", 0)) + int(stamps_delta))
    tier_info = calculate_customer_tier(revised_points)
    updated = {
        "points": revised_points,
        "stamps": revised_stamps,
        "tier": tier_info["level_name"],
        "updated_at": datetime.now().isoformat(),
    }
    loyalty_col.update_one({"_id": record["_id"]}, {"$set": updated})
    final_record = loyalty_col.find_one({"_id": record["_id"]})

    tx_col = get_collection("loyalty_transactions")
    tx_ref = reference_id or f"{reason}:{customer_id}:{business_id}:{datetime.now().timestamp()}"
    existing_tx = tx_col.find_one({"customer_id": customer_id, "business_id": business_id, "reference_id": tx_ref})
    if not existing_tx:
        tx_col.insert_one({
            "_id": f"tx_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": business_id,
            "type": reason,
            "points_delta": int(points_delta),
            "stamps_delta": int(stamps_delta),
            "reference_id": tx_ref,
            "created_at": datetime.now().isoformat(),
        })

    return final_record


@router.get("/loyalty/{business_id}")
def get_customer_business_loyalty(
    business_id: str,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    profile = get_customer_profile(current_user)
    customer_id = profile["customer_id"]
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": business_id}) or businesses_col.find_one({"slug": business_id})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    cb_col = get_collection("customer_businesses")
    is_connected = (
        cb_col.find_one({"customer_id": customer_id, "business_id": biz["id"], "status": "active"}) or
        cb_col.find_one({"customer_id": current_user["id"], "business_id": biz["id"], "status": "active"})
    )
    if not is_connected:
        raise HTTPException(status_code=403, detail="Customer is not connected to this business.")

    record = _get_customer_business_loyalty(customer_id, biz["id"])
    tier_info = calculate_customer_tier(int(record.get("points", 0)))
    return {
        "success": True,
        "customer_id": customer_id,
        "business_id": biz["id"],
        "business_name": biz.get("name", "Business"),
        "points": int(record.get("points", 0)),
        "stamps": int(record.get("stamps", 0)),
        "tier": record.get("tier") or tier_info["level_name"],
        "stamps_required": max(1, int(biz.get("stamps_required", 10) or 10)),
        "reward_description": biz.get("reward_description", ""),
        "reward_ready": int(record.get("stamps", 0)) >= max(1, int(biz.get("stamps_required", 10) or 10)),
        "updated_at": record.get("updated_at"),
        "created_at": record.get("created_at"),
    }


@router.get("/vouchers")
def get_customer_vouchers(current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    """Return only vouchers assigned to the authenticated customer within their connected businesses."""
    customer_profile = get_customer_profile(current_user)
    customer_id = customer_profile["customer_id"]
    cb_col = get_collection("customer_businesses")
    allowed_business_ids = {c["business_id"] for c in cb_col.find({"customer_id": customer_id, "status": "active"})}

    customer_vouchers_col = get_collection("customer_vouchers")
    assigned = customer_vouchers_col.find({"customer_id": customer_id})

    vouchers_col = get_collection("vouchers")
    businesses_col = get_collection("businesses")
    result = []
    for assignment in assigned:
        voucher = vouchers_col.find_one({"voucher_id": assignment.get("voucher_id")})
        if not voucher:
            continue
        if voucher.get("business_id") not in allowed_business_ids:
            continue
        biz = businesses_col.find_one({"id": voucher.get("business_id")})
        result.append({
            "_id": assignment.get("_id"),
            "voucher_id": voucher.get("voucher_id"),
            "business_id": voucher.get("business_id"),
            "business_name": biz.get("name") if biz else "Store",
            "business_logo": (biz.get("logo") or biz.get("logo_url")) if biz else None,
            "title": voucher.get("title"),
            "description": voucher.get("description", ""),
            "discount_type": voucher.get("discount_type", "PERCENTAGE"),
            "discount_value": voucher.get("discount_value", 0),
            "minimum_order_value": voucher.get("minimum_order_value", 0),
            "usage_limit": voucher.get("usage_limit", 1),
            "status": assignment.get("status", "AVAILABLE"),
            "voucher_status": assignment.get("status", "AVAILABLE"),
            "expires_at": assignment.get("expires_at") or voucher.get("expires_at"),
            "issued_at": assignment.get("issued_at"),
            "redeemed_at": assignment.get("redeemed_at"),
            "viewed_at": assignment.get("viewed_at"),
        })

    return {"success": True, "vouchers": result}


@router.post("/vouchers/{voucher_id}/redeem")
@router.post("/rewards/{voucher_id}/redeem")
def redeem_customer_voucher(
    voucher_id: str,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    """Redeem an assigned voucher or claimed reward only if it belongs to the authenticated customer."""
    customer_profile = get_customer_profile(current_user)
    customer_id = customer_profile["customer_id"]
    user_id = current_user.get("id")
    enforce_rate_limit("voucher-redeem-customer", customer_id, 20, 3600)
    enforce_rate_limit("voucher-redeem-ip", request.client.host if request.client else "unknown", 60, 3600)

    clean_id = (voucher_id or "").strip()
    customer_vouchers_col = get_collection("customer_vouchers")
    customer_voucher = (
        customer_vouchers_col.find_one({"id": clean_id, "customer_id": customer_id}) or
        customer_vouchers_col.find_one({"voucher_id": clean_id, "customer_id": customer_id}) or
        customer_vouchers_col.find_one({"code": clean_id, "customer_id": customer_id}) or
        customer_vouchers_col.find_one({"id": clean_id, "customer_id": user_id}) or
        customer_vouchers_col.find_one({"voucher_id": clean_id, "customer_id": user_id}) or
        customer_vouchers_col.find_one({"code": clean_id, "customer_id": user_id})
    )

    if not customer_voucher:
        # Fallback to general vouchers collection if not yet in customer_vouchers
        vouchers_col = get_collection("vouchers")
        gen_v = vouchers_col.find_one({"voucher_id": clean_id}) or vouchers_col.find_one({"id": clean_id})
        if gen_v:
            cb_col = get_collection("customer_businesses")
            allowed_bids = {c["business_id"] for c in cb_col.find({"customer_id": customer_id, "status": "active"})}
            if gen_v.get("business_id") and gen_v.get("business_id") not in allowed_bids:
                raise HTTPException(status_code=403, detail="You do not have access to this store voucher.")
            # Auto-assign voucher to customer
            customer_voucher = {
                "id": f"cv_{uuid.uuid4().hex[:12]}",
                "customer_id": customer_id,
                "business_id": gen_v.get("business_id", "default"),
                "voucher_id": gen_v.get("voucher_id") or gen_v.get("id"),
                "code": gen_v.get("code") or f"ZUP-{uuid.uuid4().hex[:6].upper()}",
                "title": gen_v.get("title", "Store Voucher"),
                "status": "ACTIVE",
                "claimed_at": datetime.now().isoformat(),
                "created_at": datetime.now().isoformat()
            }
            customer_vouchers_col.insert_one(customer_voucher)

    if not customer_voucher:
        raise HTTPException(status_code=404, detail="This voucher is not assigned to your account.")

    # Prevent duplicate redemption
    if str(customer_voucher.get("status", "")).upper() == "REDEEMED":
        raise HTTPException(status_code=400, detail="This voucher has already been redeemed.")

    expires_at = customer_voucher.get("expires_at")
    if expires_at:
        try:
            exp_str = str(expires_at).replace("Z", "+00:00")
            exp_dt = datetime.fromisoformat(exp_str)
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt < datetime.now(timezone.utc):
                rec_id = customer_voucher.get("id") or customer_voucher.get("_id")
                customer_vouchers_col.update_one({"id": rec_id} if "id" in customer_voucher else {"_id": rec_id}, {"$set": {"status": "EXPIRED", "updated_at": datetime.now().isoformat()}})
                raise HTTPException(status_code=400, detail="This voucher has expired.")
        except HTTPException:
            raise
        except Exception:
            pass

    now_iso = datetime.now().isoformat()
    record_id = customer_voucher.get("id") or customer_voucher.get("_id")
    filter_q = {"id": record_id} if "id" in customer_voucher else {"_id": record_id}
    redemption_count = int(customer_voucher.get("redemption_count", 0)) + 1

    customer_vouchers_col.update_one(
        filter_q,
        {"$set": {
            "status": "REDEEMED",
            "redeemed_at": now_iso,
            "redemption_count": redemption_count,
            "updated_at": now_iso
        }}
    )

    # Record loyalty transaction in Supabase
    tx_col = get_collection("loyalty_transactions")
    tx_col.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "business_id": customer_voucher.get("business_id", "default"),
        "type": "REWARD_REDEEM",
        "points_delta": 0,
        "reference_id": customer_voucher.get("code") or clean_id,
        "description": f"Redeemed {customer_voucher.get('title', 'Reward Voucher')}",
        "created_at": now_iso
    })

    return {
        "success": True,
        "status": "REDEEMED",
        "voucher_id": customer_voucher.get("id") or clean_id,
        "code": customer_voucher.get("code"),
        "voucher_code": customer_voucher.get("code"),
        "customer_id": customer_id,
        "message": "Voucher redeemed successfully.",
        "redeemed_at": now_iso,
    }


@router.put("/profile")
def update_customer_profile(
    req: CustomerProfileUpdateRequest,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    user_id = current_user["id"]
    customers_col = get_collection("customers")
    users_col = get_collection("users")
    existing_cus = customers_col.find_one({"user_id": user_id}) or (
        customers_col.find_one({"phone": current_user.get("phone")}) if current_user.get("phone") else None
    )
    if not existing_cus:
        get_customer_profile(current_user)
        existing_cus = customers_col.find_one({"user_id": user_id}) or (
            customers_col.find_one({"phone": current_user.get("phone")}) if current_user.get("phone") else None
        )

    updates = {k: v for k, v in req.dict().items() if v is not None}

    # Synchronize name/full_name and email/login_email
    if "name" in updates:
        updates["full_name"] = updates["name"]
    elif "full_name" in updates:
        updates["name"] = updates["full_name"]

    if "email" in updates:
        updates["login_email"] = updates["email"]
    elif "login_email" in updates:
        updates["email"] = updates["login_email"]
    
    # Normalize photo / avatar / profile_image_url
    if "photo" in updates and updates["photo"]:
        updates["profile_image_url"] = updates["photo"]
        updates["avatar"] = updates["photo"]
    elif "profile_image_url" in updates and updates["profile_image_url"]:
        updates["avatar"] = updates["profile_image_url"]
        updates["photo"] = updates["profile_image_url"]
    elif "avatar" in updates and updates["avatar"]:
        updates["profile_image_url"] = updates["avatar"]
        updates["photo"] = updates["avatar"]

    # Normalize dob / birthday
    if "dob" in updates and updates["dob"]:
        updates["birthday"] = updates["dob"]
    elif "birthday" in updates and updates["birthday"]:
        updates["dob"] = updates["birthday"]

    # Security: Phone remains linked to authenticated account
    if "phone" in updates and not updates["phone"]:
        updates.pop("phone", None)

    # Never allow changing identity or roles through this endpoint
    updates.pop("id", None)
    updates.pop("customer_id", None)
    updates.pop("user_id", None)
    updates.pop("role", None)

    updates["updated_at"] = datetime.now().isoformat()

    # Update customers collection
    if existing_cus and "id" in existing_cus:
        customers_col.update_one(
            {"id": existing_cus["id"]},
            {"$set": updates}
        )
    else:
        customers_col.update_one(
            {"user_id": user_id},
            {"$set": updates},
            upsert=True
        )
    
    # Also keep users collection in sync
    user_updates = {}
    for field in ["name", "email", "address", "dob", "gender", "bio"]:
        if field in updates:
            user_updates[field] = updates[field]
    if "profile_image_url" in updates:
        user_updates["profile_image_url"] = updates["profile_image_url"]
        user_updates["avatar"] = updates["profile_image_url"]

    if user_updates:
        user_updates["updated_at"] = datetime.now().isoformat()
        users_col.update_one({"id": user_id}, {"$set": user_updates})

    return get_customer_profile(current_user)

# ==============================================================================
# MULTI-TENANT ISOLATED CUSTOMER HOME & BUSINESS ASSOCIATION
# ==============================================================================

@router.get("/home")
def get_customer_home(current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    """
    Returns only data associated with the authenticated customer.
    Brand new customer starts with businesses = [], points = 0, stamps = 0.
    Never returns demo or global customer data.
    """
    cus_profile = get_customer_profile(current_user)
    customer_id = cus_profile["customer_id"]
    user_id = current_user["id"]

    cb_col = get_collection("customer_businesses")

    # Auto-link any pending invites sent to this customer's email
    cus_email = (current_user.get("email") or cus_profile.get("email") or "").strip().lower()
    if cus_email:
        invites_col = get_collection("business_invites")
        pending_invites = invites_col.find({"customer_email": cus_email, "status": "active"})
        for inv in pending_invites:
            b_id = inv.get("business_id")
            if b_id:
                if not cb_col.find_one({"customer_id": customer_id, "business_id": b_id}):
                    cb_col.insert_one({
                        "id": f"cb_{uuid.uuid4().hex[:12]}",
                        "customer_id": customer_id,
                        "business_id": b_id,
                        "source": "invite",
                        "status": "active",
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat(),
                    })
                invites_col.update_one({"id": inv["id"]}, {"$set": {"status": "accepted", "updated_at": datetime.now().isoformat()}})

    all_customer_ids = {customer_id, user_id}
    if cus_profile.get("id"):
        all_customer_ids.add(cus_profile["id"])
    customers_col = get_collection("customers")
    for c_rec in customers_col.find({"$or": [{"user_id": user_id}, {"email": cus_email}, {"phone": cus_profile.get("phone")}]}):
        if c_rec.get("customer_id"):
            all_customer_ids.add(c_rec["customer_id"])
        if c_rec.get("id"):
            all_customer_ids.add(c_rec["id"])

    connections = list(cb_col.find({"customer_id": {"$in": list(all_customer_ids)}, "status": "active"}))
    connected_biz_ids = list({c["business_id"] for c in connections if c.get("business_id")})

    # New customer with no businesses connected
    if not connected_biz_ids:
        tier_info = calculate_customer_tier(0)
        return {
            "success": True,
            "is_empty": True,
            "customer": {
                **cus_profile,
                "points": 0,
                "stamps": 0,
                "lifetime_points": 0,
                "total_visits": 0,
                "total_spent": 0.0,
                "level": 1,
                "level_name": "BASIC",
                "membership_tier": "BASIC",
                "loyalty": tier_info
            },
            "businesses": [],
            "points": 0,
            "stamps": 0,
            "rewards": [],
            "visits": [],
            "orders": [],
            "reservations": [],
            "offers": []
        }

    # Customer has connected businesses - STRICT ISOLATION: ONLY connected businesses
    businesses_col = get_collection("businesses")
    all_biz = [b for b in businesses_col.find({"status": "ACTIVE"}) if b["id"] in connected_biz_ids]
    if not all_biz:
        all_biz = [b for b in businesses_col.find() if b["id"] in connected_biz_ids]

    visits_col = get_collection("visits")
    orders_col = get_collection("orders")
    reservations_col = get_collection("table_reservations")

    cus_visits = [v for v in visits_col.find({"customer_id": customer_id}) if v.get("business_id") in connected_biz_ids]
    cus_orders = [o for o in orders_col.find({"customer_id": customer_id}) if o.get("business_id") in connected_biz_ids]
    cus_reservations = reservations_col.find({"customer_id": customer_id})
    if not cus_reservations:
        bookings_col = get_collection("table_bookings")
        cus_reservations = bookings_col.find({"customer_id": customer_id})

    return {
        "success": True,
        "is_empty": False,
        "customer": cus_profile,
        "businesses": all_biz,
        "points": cus_profile["points"],
        "stamps": cus_profile["stamps"],
        "visits": cus_visits,
        "orders": cus_orders,
        "reservations": cus_reservations,
        "rewards": [],
        "offers": []
    }

class ConnectBusinessPayload(BaseModel):
    business_id: str
    source: Optional[str] = "qr_scan"

@router.post("/businesses/connect")
@router.post("/connect-business")
def connect_customer_business(
    req: ConnectBusinessPayload,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    """
    Associates customer with a business via QR scan or verified action.
    Idempotent: scanning multiple times does not create duplicates.
    """
    raw_biz_id = req.business_id.strip()
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": raw_biz_id}) or businesses_col.find_one({"slug": raw_biz_id})

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    actual_biz_id = biz["id"]
    profile = get_customer_profile(current_user)
    customer_id = profile["customer_id"]

    cb_col = get_collection("customer_businesses")
    existing = cb_col.find_one({"customer_id": customer_id, "business_id": actual_biz_id})
    now_iso = datetime.now().isoformat()
    already_connected = bool(existing and existing.get("status") == "active")

    if not existing:
        new_cb = {
            "id": f"cb_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": actual_biz_id,
            "source": req.source or "qr_scan",
            "status": "active",
            "created_at": now_iso,
            "updated_at": now_iso
        }
        try:
            cb_col.insert_one(new_cb)
        except Exception:
            existing = cb_col.find_one({"customer_id": customer_id, "business_id": actual_biz_id})
            if not existing:
                raise
    elif existing.get("status") != "active":
        cb_col.update_one(
            {"id": existing["id"]},
            {"$set": {"status": "active", "source": req.source or "qr_scan", "updated_at": now_iso}},
        )

    return {
        "success": True,
        "connected": True,
        "already_connected": already_connected,
        "business": {
            "id": biz["id"],
            "name": biz.get("name", "Store"),
            "slug": biz.get("slug", biz["id"]),
            "category": biz.get("category", "General"),
            "logo": biz.get("logo") or biz.get("logo_url")
        }
    }

@router.post("/visits/checkin")
def check_in_visit(
    req: QRCheckInRequest,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    business_id = req.business_id.strip()
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": business_id}) or businesses_col.find_one({"slug": business_id})

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    actual_biz_id = biz["id"]
    user_id = current_user["id"]
    customers_col = get_collection("customers")
    cus = customers_col.find_one({"user_id": user_id}) or customers_col.find_one({"phone": current_user.get("phone")})
    customer_id = cus["customer_id"] if cus else current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=401, detail="Authenticated customer identity is required.")

    visits_col = get_collection("visits")
    reference_id = req.reference_id or f"checkin:{customer_id}:{actual_biz_id}:{datetime.now().strftime('%Y%m%d%H%M')}"

    # Anti-fraud duplicate check: 5 minute window and idempotent reference_id
    now = datetime.now(timezone.utc)
    recent_visits = visits_col.find({
        "business_id": actual_biz_id,
        "customer_id": customer_id,
    })
    for v in recent_visits:
        if req.reference_id and v.get("reference_id") == req.reference_id:
            raise HTTPException(
                status_code=400,
                detail="You have already checked in recently. Please wait a few minutes before checking in again."
            )
        ts_str = v.get("timestamp") or v.get("created_at")
        if ts_str:
            try:
                v_time = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
                if v_time.tzinfo is None:
                    v_time = v_time.replace(tzinfo=timezone.utc)
                if abs((now - v_time).total_seconds()) < 300:
                    raise HTTPException(
                        status_code=400,
                        detail="You have already checked in recently. Please wait a few minutes before checking in again."
                    )
            except HTTPException:
                raise
            except Exception:
                pass

    points_to_award = 50
    stamps_to_award = 1
    now_iso = now.isoformat()

    new_visit = {
        "id": f"vis_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "business_id": actual_biz_id,
        "customer_name": (cus and cus.get("name")) or current_user.get("name") or "Valued Customer",
        "timestamp": now_iso,
        "source": "QR",
        "points_awarded": points_to_award,
        "stamps_awarded": stamps_to_award,
        "notes": req.notes or "QR Code Check-in",
        "reference_id": reference_id,
    }
    visits_col.insert_one(new_visit)

    # Idempotent customer-business association via QR visit
    cb_col = get_collection("customer_businesses")
    existing_cb = cb_col.find_one({"customer_id": customer_id, "business_id": actual_biz_id})
    if not existing_cb:
        relationship = {
            "id": f"cb_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": actual_biz_id,
            "source": "qr_scan",
            "status": "active",
            "created_at": now_iso,
            "updated_at": now_iso
        }
        try:
            cb_col.insert_one(relationship)
        except Exception:
            existing_cb = cb_col.find_one({"customer_id": customer_id, "business_id": actual_biz_id})
            if not existing_cb:
                raise
    elif existing_cb.get("status") != "active":
        cb_col.update_one(
            {"id": existing_cb["id"]},
            {"$set": {"status": "active", "updated_at": now_iso}},
        )

    # Persist business-scoped loyalty state instead of a single global customer balance.
    loyalty_record = _update_customer_business_loyalty(
        customer_id,
        actual_biz_id,
        points_delta=points_to_award,
        stamps_delta=stamps_to_award,
        reason="CHECKIN",
        reference_id=reference_id,
    )

    # Award points and stamps to customer with level-up evaluation
    level_up = None
    reward_unlocked = None
    new_points = int(loyalty_record.get("points", 0))
    new_stamps = int(loyalty_record.get("stamps", 0))
    new_tier = calculate_customer_tier(new_points)

    if cus:
        prev_points = int(cus.get("points", 0))
        prev_tier = calculate_customer_tier(prev_points)
        new_points_customer = prev_points + points_to_award
        new_lifetime = int(cus.get("lifetime_points", 0)) + points_to_award
        new_stamps_customer = int(cus.get("stamps", 0)) + stamps_to_award
        new_visits = int(cus.get("total_visits", 0)) + 1
        new_tier_customer = calculate_customer_tier(new_points_customer)

        customers_col.update_one(
            {"id": cus["id"]},
            {
                "$set": {
                    "points": new_points_customer,
                    "lifetime_points": new_lifetime,
                    "stamps": new_stamps_customer,
                    "total_visits": new_visits,
                    "level": new_tier_customer["level"],
                    "level_name": new_tier_customer["level_name"],
                    "membership_tier": new_tier_customer["level_name"],
                    "last_visit": now_iso
                }
            }
        )

        if new_tier_customer["level"] > prev_tier["level"]:
            level_up = {
                "from_level": prev_tier["level"],
                "to_level": new_tier_customer["level"],
                "from_name": prev_tier["level_name"],
                "to_name": new_tier_customer["level_name"],
                "badge": new_tier_customer["current_tier"].get("badge", new_tier_customer["level_name"])
            }
            try:
                notifs_col = get_collection("notifications")
                notifs_col.insert_one({
                    "id": f"notif_{uuid.uuid4().hex[:10]}",
                    "recipient_id": customer_id,
                    "role": "customer",
                    "type": "LOYALTY",
                    "title": f"🎉 LEVEL UP: Welcome to {new_tier_customer['level_name']}!",
                    "message": f"Congratulations! You've reached Level {new_tier_customer['level']} ({new_tier_customer['level_name']}) with {new_points_customer} points.",
                    "action_url": "/customer",
                    "read": False,
                    "created_at": now_iso
                })
            except Exception:
                pass

        target_stamps = max(1, int(biz.get("stamps_required", 10) or 10))
        if new_stamps >= target_stamps:
            reward_unlocked = {
                "title": biz.get("reward_description") or "Store Loyalty Reward",
                "stamps": new_stamps
            }

    return {
        "success": True,
        "message": f"Successfully checked in at {biz.get('name', 'Business')}!",
        "points_awarded": points_to_award,
        "stamps_awarded": stamps_to_award,
        "points": new_points,
        "stamps": new_stamps,
        "level": new_tier["level"],
        "level_name": new_tier["level_name"],
        "level_up": level_up,
        "reward_unlocked": reward_unlocked,
        "visit": new_visit,
        "business_id": actual_biz_id,
    }


# -----------------------------------------------------------------------------
# REWARDS & VOUCHERS CLAIM
# -----------------------------------------------------------------------------
class ClaimRewardRequest(BaseModel):
    reward_id: str
    business_id: Optional[Any] = None


DEFAULT_REWARDS = [
    {
        "id": "rew_bev_100",
        "title": "Complimentary Beverage",
        "description": "Enjoy any handcrafted coffee or tea on the house",
        "points": 100,
        "stamps": 0,
        "category": "Beverage",
        "active": True
    },
    {
        "id": "rew_flat_200",
        "title": "₹100 Off Total Bill",
        "description": "Get a flat ₹100 discount on your next dine-in or takeaway order",
        "points": 200,
        "stamps": 0,
        "category": "Discount",
        "active": True
    },
    {
        "id": "rew_pct_350",
        "title": "20% VIP Privilege Voucher",
        "description": "20% off your entire dining check up to ₹500",
        "points": 350,
        "stamps": 0,
        "category": "Voucher",
        "active": True
    },
    {
        "id": "rew_meal_500",
        "title": "Chef's Special Meal Course",
        "description": "Complimentary signature main course of your choice",
        "points": 500,
        "stamps": 0,
        "category": "Dining",
        "active": True
    }
]


@router.get("/rewards")
def get_customer_rewards(
    business_id: Optional[str] = None,
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    vouchers_col = get_collection("vouchers")
    raw_vouchers = vouchers_col.find({"business_id": business_id}) if business_id else vouchers_col.find({})
    biz_vouchers = [v for v in raw_vouchers if str(v.get("status", "")).upper() in ("ACTIVE", "AVAILABLE")]
    rewards = []
    for v in biz_vouchers:
        rewards.append({
            "id": v.get("id") or v.get("voucher_id"),
            "business_id": v.get("business_id"),
            "title": v.get("title"),
            "description": v.get("description", ""),
            "points": int(v.get("points_required") or (v.get("discount_value") or 10) * 10),
            "stamps": int(v.get("stamps_required") or 0),
            "category": v.get("category", "Voucher"),
            "active": True
        })
    if not rewards:
        for dr in DEFAULT_REWARDS:
            rewards.append({**dr, "business_id": business_id})
    return {"success": True, "rewards": rewards}


@router.post("/rewards/claim")
def claim_customer_reward(
    req: ClaimRewardRequest,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    profile = get_customer_profile(current_user)
    cust_id = profile["customer_id"]
    
    biz_id = None
    if req.business_id and isinstance(req.business_id, str):
        clean_b = req.business_id.strip()
        if clean_b and clean_b.lower() not in ("null", "undefined", "none", "{}"):
            biz_id = clean_b
    
    reward = next((r for r in DEFAULT_REWARDS if r["id"] == req.reward_id), None)
    if not reward:
        vouchers_col = get_collection("vouchers")
        v = vouchers_col.find_one({"id": req.reward_id}) or vouchers_col.find_one({"voucher_id": req.reward_id})
        if v:
            reward = {
                "id": v.get("id") or v.get("voucher_id"),
                "title": v.get("title"),
                "description": v.get("description", ""),
                "points": int(v.get("points_required") or 100),
                "stamps": int(v.get("stamps_required") or 0)
            }
            if not biz_id:
                biz_id = v.get("business_id")
    if not reward:
        reward = {
            "id": req.reward_id,
            "title": "VIP Reward Voucher",
            "points": 100,
            "stamps": 0
        }
    
    pts_required = int(reward.get("points", 0))
    current_pts = int(profile.get("points", 0))
    if current_pts < pts_required:
        raise HTTPException(status_code=400, detail=f"Insufficient points. Required: {pts_required}, Available: {current_pts}")

    new_pts = current_pts - pts_required
    customers_col = get_collection("customers")
    customers_col.update_one({"customer_id": cust_id}, {"$set": {"points": new_pts, "updated_at": datetime.now().isoformat()}})
    
    if biz_id:
        loyalty_col = get_collection("loyalty")
        loyal = loyalty_col.find_one({"customer_id": cust_id, "business_id": biz_id})
        if loyal:
            biz_pts = max(0, int(loyal.get("points", 0)) - pts_required)
            loyalty_col.update_one({"customer_id": cust_id, "business_id": biz_id}, {"$set": {"points": biz_pts, "updated_at": datetime.now().isoformat()}})

    code = f"ZUP-{uuid.uuid4().hex[:6].upper()}"
    cv_col = get_collection("customer_vouchers")
    cv_doc = {
        "id": f"cv_{uuid.uuid4().hex[:12]}",
        "customer_id": cust_id,
        "business_id": biz_id or "default",
        "voucher_id": reward["id"],
        "code": code,
        "title": reward["title"],
        "status": "ACTIVE",
        "claimed_at": datetime.now().isoformat(),
        "expires_at": (datetime.now() + timedelta(days=30)).isoformat(),
        "created_at": datetime.now().isoformat()
    }
    cv_col.insert_one(cv_doc)

    tx_col = get_collection("loyalty_transactions")
    tx_col.insert_one({
        "customer_id": cust_id,
        "business_id": biz_id or "default",
        "type": "REWARD_CLAIM",
        "points_delta": -pts_required,
        "amount": pts_required,
        "balance_after": new_pts,
        "description": f"Claimed {reward['title']}",
        "reference_id": code,
        "created_at": datetime.now().isoformat()
    })

    return {
        "success": True,
        "voucher_code": code,
        "redemption_code": code,
        "claim": cv_doc,
        "remaining_points": new_pts,
        "remainingPoints": new_pts
    }


@router.get("/rewards/claimed")
def get_customer_claimed_rewards(
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    profile = get_customer_profile(current_user)
    cust_id = profile["customer_id"]
    cv_col = get_collection("customer_vouchers")
    records = cv_col.find({"customer_id": cust_id})
    claims = []
    for r in records:
        claims.append({
            "id": r.get("id"),
            "customer_id": cust_id,
            "business_id": r.get("business_id"),
            "reward_id": r.get("voucher_id"),
            "reward_title": r.get("title") or "VIP Reward",
            "voucher_code": r.get("code"),
            "code": r.get("code"),
            "status": r.get("status", "ACTIVE"),
            "claimed_at": r.get("claimed_at") or r.get("created_at"),
            "expires_at": r.get("expires_at"),
        })
    return {"success": True, "claims": claims}

