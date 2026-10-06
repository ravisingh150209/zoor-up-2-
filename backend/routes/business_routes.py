"""
ZOOR UP Business Profile & Onboarding Routes
"""
import re
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from backend.models import (
    OnboardingStepRequest,
    OnboardingBusinessRequest,
    VoucherCreateRequest,
    VoucherUpdateRequest,
    ROLE_BUSINESS_OWNER,
    ROLE_CUSTOMER,
    ROLE_STAFF,
    ROLE_SUPER_ADMIN,
)
from backend.database import get_collection
from backend.auth import get_current_user, require_role

router = APIRouter(prefix="/api", tags=["Business & Onboarding"])

BUSINESS_PROFILE_EDITABLE_FIELDS = {
    "name", "owner_name", "phone", "email", "whatsapp", "category", "description",
    "address", "city", "state", "country", "postal_code", "opening_hours", "working_days",
    "open_time", "close_time", "delivery_available", "pickup_available", "logo", "logo_url",
    "cover_image", "cover_photo_url", "gallery", "website", "social_links", "upi_id",
    "upi_name", "upi_notes", "upi_enabled", "menu_enabled",
    "stamps_required", "reward_description",
}

ONBOARDING_STEP_FIELDS = {
    1: {"name", "description"},
    2: {"category"},
    3: {"owner_name", "designation"},
    4: {"phone", "email", "whatsapp"},
    5: {"address", "city", "state", "country", "postal_code"},
    6: {"working_days", "open_time", "close_time", "delivery_available", "pickup_available"},
    7: {"logo"},
    8: set(),
    9: {"loyalty_rate", "loyalty_welcome_bonus", "loyalty_min_redeem"},
    10: set(),
}


def _get_business_for_owner(current_user: dict):
    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"owner_id": current_user["id"]})
    if not biz and current_user.get("business_id"):
        biz = businesses_col.find_one({"id": current_user["business_id"], "owner_id": current_user["id"]})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")
    return biz


def _get_customer_record_for_user(user: dict):
    customers_col = get_collection("customers")
    return customers_col.find_one({"user_id": user["id"]}) or customers_col.find_one({"customer_id": user.get("customer_id")}) or customers_col.find_one({"phone": user.get("phone")})


def _business_stamp_target(business: dict) -> int:
    try:
        return max(1, min(1000, int(business.get("stamps_required", 10))))
    except (TypeError, ValueError):
        return 10


def _calculate_customer_rank(points: int) -> str:
    if points >= 5000:
        return "ADVANCE"
    if points >= 3000:
        return "PLATINUM"
    if points >= 1500:
        return "GOLD"
    if points >= 500:
        return "SILVER"
    return "BASIC"


@router.get("/business/dashboard")
def get_business_dashboard(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)
    business_id = biz["id"]
    orders = get_collection("orders").find({"business_id": business_id})
    products = get_collection("products").find({"business_id": business_id})
    connections = get_collection("customer_businesses").find({"business_id": business_id, "status": "active"})
    loyalty_records = get_collection("loyalty").find({"business_id": business_id})
    expenses = get_collection("expenses").find({"business_id": business_id})
    vouchers = get_collection("vouchers").find({"business_id": business_id})

    today = datetime.now().date().isoformat()
    today_orders = [order for order in orders if str(order.get("created_at", "")).startswith(today)]
    paid_orders = [order for order in orders if str(order.get("payment_status", "")).upper() == "PAID"]
    total_revenue = sum(float(order.get("total", 0) or 0) for order in paid_orders)
    total_expense = sum(float(expense.get("amount", 0) or 0) for expense in expenses)
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    chart = {day: {"sales": 0, "orders": 0} for day in day_names}
    for order in orders:
        try:
            created_at = datetime.fromisoformat(str(order.get("created_at", "")).replace("Z", "+00:00"))
            day = day_names[created_at.weekday()]
            chart[day]["orders"] += 1
            if str(order.get("payment_status", "")).upper() == "PAID":
                chart[day]["sales"] += float(order.get("total", 0) or 0)
        except (TypeError, ValueError):
            continue

    category_counts = {}
    for product in products:
        category = product.get("category") or "General"
        category_counts[category] = category_counts.get(category, 0) + 1
    colors = ["#6366f1", "#10b981", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6"]
    category_distribution = [
        {"name": category, "percentage": round(count / len(products) * 100), "color": colors[index % len(colors)]}
        for index, (category, count) in enumerate(category_counts.items())
    ] if products else []

    return {
        "business": biz,
        "stats": {
            "todaySales": sum(float(order.get("total", 0) or 0) for order in today_orders if str(order.get("payment_status", "")).upper() == "PAID"),
            "todayOrdersCount": len(today_orders),
            "totalCustomers": len({connection.get("customer_id") for connection in connections}),
            "newCustomers": sum(str(connection.get("created_at", "")).startswith(today[:7]) for connection in connections),
            "pendingOrders": sum(str(order.get("status", "")).upper() in {"NEW", "CONFIRMED", "PREPARING"} for order in orders),
            "completedOrders": sum(str(order.get("status", "")).upper() in {"COMPLETED", "DELIVERED"} for order in orders),
            "lowStockCount": sum(product.get("type") == "product" and int(product.get("stock", 0) or 0) <= 5 for product in products),
            "totalRevenue": total_revenue,
            "totalExpense": total_expense,
            "netProfit": max(0, total_revenue - total_expense),
            "totalPointsIssued": sum(int(record.get("points", 0) or 0) for record in loyalty_records),
            "activeOffersCount": sum(str(voucher.get("status", "ACTIVE")).upper() == "ACTIVE" for voucher in vouchers),
            "subscriptionPlan": biz.get("subscription_plan", "FREE"),
        },
        "charts": {
            "salesChart": [{"day": day, **chart[day]} for day in day_names],
            "categoryDistribution": category_distribution,
        },
    }


@router.get("/business/customers")
def list_connected_business_customers(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)
    target = _business_stamp_target(biz)
    connections = get_collection("customer_businesses").find({"business_id": biz["id"], "status": "active"})
    customers_col = get_collection("customers")
    loyalty_col = get_collection("loyalty")
    result = []
    for connection in connections:
        customer_id = connection.get("customer_id")
        customer = customers_col.find_one({"customer_id": customer_id}) or customers_col.find_one({"user_id": customer_id})
        if not customer:
            continue
        loyalty = loyalty_col.find_one({"customer_id": customer_id, "business_id": biz["id"]}) or {}
        stamps = int(loyalty.get("stamps", 0))
        result.append({
            "id": customer.get("id"),
            "customer_id": customer.get("customer_id"),
            "name": customer.get("name", ""),
            "email": customer.get("email", ""),
            "phone": customer.get("phone", ""),
            "business_id": biz["id"],
            "points": int(loyalty.get("points", 0)),
            "stamps": stamps,
            "rank": _calculate_customer_rank(int(loyalty.get("points", 0))),
            "stamps_required": target,
            "reward_description": biz.get("reward_description", ""),
            "reward_ready": stamps >= target,
            "connected_at": connection.get("created_at"),
            "last_visit": customer.get("last_visit"),
        })
    return {"success": True, "business_id": biz["id"], "customers": result}


class BusinessAddCustomerRequest(BaseModel):
    name: str
    email: str = None
    phone: str = None
    points: int = 50
    wallet_balance: float = 0.0
    notes: str = ""


@router.post("/business/customers")
def add_business_customer(
    req: BusinessAddCustomerRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_STAFF, ROLE_SUPER_ADMIN]))
):
    """
    Enables a business to add/register a customer and immediately creates
    an active relationship in customer_businesses and initializes loyalty.
    """
    biz = _get_business_for_owner(current_user)
    biz_id = biz["id"]
    email = (req.email or "").strip().lower()
    phone = (req.phone or "").strip()
    name = (req.name or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="Customer name is required.")
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Customer email or mobile number is required.")

    customers_col = get_collection("customers")
    users_col = get_collection("users")
    cb_col = get_collection("customer_businesses")
    loyalty_col = get_collection("loyalty")

    # 1. Check if customer already exists by email or phone
    customer = None
    if email:
        customer = customers_col.find_one({"email": email})
        if not customer:
            user_doc = users_col.find_one({"email": email})
            if user_doc:
                customer = customers_col.find_one({"user_id": user_doc["id"]}) or customers_col.find_one({"customer_id": user_doc.get("customer_id")})
    if not customer and phone:
        customer = customers_col.find_one({"phone": phone})

    now_iso = datetime.now().isoformat()
    points = max(0, int(req.points or 50))

    if not customer:
        customer_id = f"ZUP-CUS-{uuid.uuid4().hex[:6].upper()}"
        customer_record_id = f"cus_{uuid.uuid4().hex[:12]}"
        customer = {
            "id": customer_record_id,
            "customer_id": customer_id,
            "name": name,
            "email": email,
            "phone": phone,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        customers_col.insert_one(customer)
    else:
        customer_id = customer.get("customer_id") or customer.get("id")

    # 2. Idempotently create active connection in customer_businesses
    connection = cb_col.find_one({"customer_id": customer_id, "business_id": biz_id})
    if not connection:
        connection_id = f"cb_{uuid.uuid4().hex[:12]}"
        cb_col.insert_one({
            "id": connection_id,
            "customer_id": customer_id,
            "business_id": biz_id,
            "source": "business_added",
            "status": "active",
            "created_at": now_iso,
            "updated_at": now_iso,
        })
    elif connection.get("status") != "active":
        cb_col.update_one({"id": connection["id"]}, {"$set": {"status": "active", "updated_at": now_iso}})

    # 3. Initialize or update loyalty record
    loyalty_record = loyalty_col.find_one({"customer_id": customer_id, "business_id": biz_id})
    if not loyalty_record:
        loyalty_col.insert_one({
            "id": f"loyal_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": biz_id,
            "points": points,
            "stamps": 0,
            "tier": "BASIC",
            "created_at": now_iso,
            "updated_at": now_iso,
        })
    elif points > int(loyalty_record.get("points", 0)):
        loyalty_col.update_one({"id": loyalty_record["id"]}, {"$set": {"points": points, "updated_at": now_iso}})

    return {
        "success": True,
        "message": f"Customer {name} connected to {biz.get('name')}.",
        "customer": {
            "id": customer.get("id"),
            "customer_id": customer_id,
            "name": name,
            "email": email,
            "phone": phone,
            "business_id": biz_id,
            "points": points,
            "status": "active",
        }
    }


@router.get("/business/customers/lookup")
def lookup_connected_business_customer(
    email: str,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER])),
):
    biz = _get_business_for_owner(current_user)
    customer = get_collection("customers").find_one({"email": email.strip().lower()})
    if not customer:
        raise HTTPException(status_code=404, detail="Connected customer not found.")
    customer_id = customer.get("customer_id")
    connection = get_collection("customer_businesses").find_one({
        "customer_id": customer_id,
        "business_id": biz["id"],
        "status": "active",
    })
    if not connection:
        raise HTTPException(status_code=404, detail="Connected customer not found.")
    loyalty = get_collection("loyalty").find_one({"customer_id": customer_id, "business_id": biz["id"]}) or {}
    stamps = int(loyalty.get("stamps", 0))
    target = _business_stamp_target(biz)
    return {
        "id": customer.get("id"),
        "customer_id": customer_id,
        "name": customer.get("name", ""),
        "email": customer.get("email", ""),
        "points": int(loyalty.get("points", 0)),
        "stamps": stamps,
        "stamps_required": target,
        "reward_description": biz.get("reward_description", ""),
        "reward_ready": stamps >= target,
    }


@router.get("/business/customers/{customer_id}")
def get_connected_business_customer(
    customer_id: str,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER])),
):
    biz = _get_business_for_owner(current_user)
    connection = get_collection("customer_businesses").find_one({
        "customer_id": customer_id,
        "business_id": biz["id"],
        "status": "active",
    })
    customer = get_collection("customers").find_one({"customer_id": customer_id})
    if not connection or not customer:
        raise HTTPException(status_code=404, detail="Connected customer not found.")
    loyalty = get_collection("loyalty").find_one({"customer_id": customer_id, "business_id": biz["id"]}) or {}
    return {
        "id": customer.get("id"),
        "customer_id": customer_id,
        "name": customer.get("name", ""),
        "email": customer.get("email", ""),
        "phone": customer.get("phone", ""),
        "business_id": biz["id"],
        "points": int(loyalty.get("points", 0)),
        "stamps": int(loyalty.get("stamps", 0)),
        "last_visit": customer.get("last_visit"),
    }


@router.post("/business/customers/{customer_id}/loyalty/adjust")
def adjust_connected_customer_points(
    customer_id: str,
    updates: dict,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER])),
):
    biz = _get_business_for_owner(current_user)
    if not get_collection("customer_businesses").find_one({
        "customer_id": customer_id,
        "business_id": biz["id"],
        "status": "active",
    }):
        raise HTTPException(status_code=404, detail="Connected customer not found.")
    try:
        points_delta = int(updates.get("points_delta", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Points adjustment must be a whole number.") from None
    if points_delta == 0 or abs(points_delta) > 100000:
        raise HTTPException(status_code=400, detail="Points adjustment is outside the allowed range.")

    now_iso = datetime.now().isoformat()
    loyalty_col = get_collection("loyalty")
    loyalty_filter = {"customer_id": customer_id, "business_id": biz["id"]}
    if points_delta < 0:
        loyalty_filter["points"] = {"$gte": abs(points_delta)}
    adjusted = loyalty_col.update_one(
        loyalty_filter,
        {
            "$inc": {"points": points_delta},
            "$set": {"customer_id": customer_id, "business_id": biz["id"], "updated_at": now_iso},
        },
        upsert=points_delta > 0,
    )
    if adjusted is False or getattr(adjusted, "matched_count", 1) == 0:
        raise HTTPException(status_code=400, detail="Customer does not have enough points for this adjustment.")
    updated = loyalty_col.find_one({"customer_id": customer_id, "business_id": biz["id"]})

    request_id = str(updates.get("reference_id") or uuid.uuid4().hex)
    get_collection("loyalty_transactions").insert_one({
        "id": f"ltx_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "business_id": biz["id"],
        "type": "MANUAL_ADJUSTMENT",
        "points_delta": points_delta,
        "stamps_delta": 0,
        "reference_id": f"manual-adjust:{request_id}",
        "created_at": now_iso,
    })
    return {"success": True, "customer_id": customer_id, "business_id": biz["id"], "points": updated["points"]}


@router.delete("/business/customers/{customer_id}")
def disconnect_business_customer(
    customer_id: str,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER])),
):
    biz = _get_business_for_owner(current_user)
    connection = get_collection("customer_businesses").find_one({
        "customer_id": customer_id,
        "business_id": biz["id"],
        "status": "active",
    })
    if not connection:
        raise HTTPException(status_code=404, detail="Connected customer not found.")
    get_collection("customer_businesses").update_one(
        {"id": connection["id"]},
        {"$set": {"status": "disconnected", "updated_at": datetime.now().isoformat()}},
    )
    return {"success": True, "customer_id": customer_id, "business_id": biz["id"], "status": "disconnected"}


@router.post("/business/customers/{customer_id}/stamp-reward/redeem")
def redeem_connected_customer_stamp_reward(
    customer_id: str,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER])),
):
    biz = _get_business_for_owner(current_user)
    connection = get_collection("customer_businesses").find_one({
        "customer_id": customer_id,
        "business_id": biz["id"],
        "status": "active",
    })
    if not connection:
        raise HTTPException(status_code=404, detail="Connected customer not found.")

    loyalty_col = get_collection("loyalty")
    target = _business_stamp_target(biz)
    now_iso = datetime.now().isoformat()
    updated = loyalty_col.update_one(
        {"customer_id": customer_id, "business_id": biz["id"], "stamps": {"$gte": target}},
        {"$set": {"stamps": 0, "updated_at": now_iso, "last_redeemed_at": now_iso}},
    )
    if updated is False or getattr(updated, "matched_count", 1) == 0:
        raise HTTPException(status_code=400, detail="This customer does not have a reward ready to redeem.")

    reference_id = f"stamp-redeem:{uuid.uuid4().hex}"
    get_collection("loyalty_transactions").insert_one({
        "id": f"ltx_{uuid.uuid4().hex[:12]}",
        "customer_id": customer_id,
        "business_id": biz["id"],
        "type": "REWARD_REDEMPTION",
        "points_delta": 0,
        "stamps_delta": -target,
        "reference_id": reference_id,
        "created_at": now_iso,
    })
    return {
        "success": True,
        "customer_id": customer_id,
        "business_id": biz["id"],
        "stamps": 0,
        "reward_description": biz.get("reward_description", ""),
        "redeemed_at": now_iso,
    }


def _normalize_voucher_status(voucher: dict) -> str:
    if not voucher:
        return "EXPIRED"
    status_value = (voucher.get("status") or "ACTIVE").upper()
    expires_at = voucher.get("expires_at")
    if expires_at:
        try:
            from datetime import datetime
            if datetime.fromisoformat(expires_at.replace("Z", "+00:00")) < datetime.now().astimezone() if False else False:
                pass
        except Exception:
            pass
    return status_value


def generate_unique_business_slug(name: str, biz_id: str, businesses_col) -> str:
    """Creates a stable unique business slug without collisions."""
    raw_name = (name or "store").strip().lower()
    base_slug = re.sub(r'[^a-z0-9]+', '-', raw_name).strip('-')
    if not base_slug:
        base_slug = f"store-{biz_id[:8]}"

    slug = base_slug
    counter = 1
    while True:
        existing = businesses_col.find_one({"slug": slug})
        if not existing or existing.get("id") == biz_id:
            return slug
        counter += 1
        slug = f"{base_slug}-{counter}"

@router.get("/public/offers/{business_id}")
@router.get("/customer/offers/{business_id}")
def list_public_business_offers(business_id: str):
    vouchers_col = get_collection("vouchers")
    vouchers = vouchers_col.find({"business_id": business_id, "status": "ACTIVE"})
    return {"success": True, "vouchers": vouchers, "offers": vouchers}


@router.get("/business/offers")
@router.get("/business/vouchers")
def list_business_vouchers(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)
    vouchers_col = get_collection("vouchers")
    vouchers = vouchers_col.find({"business_id": biz["id"]})
    return {"success": True, "vouchers": vouchers, "offers": vouchers}


@router.post("/business/offers")
@router.post("/business/vouchers")
def create_business_voucher(
    req: VoucherCreateRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    biz = _get_business_for_owner(current_user)
    title = (req.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Voucher title is required.")

    discount_type = (req.discount_type or "PERCENTAGE").upper()
    if discount_type not in ["PERCENTAGE", "FIXED"]:
        raise HTTPException(status_code=400, detail="Discount type must be PERCENTAGE or FIXED.")

    if req.discount_value is None or req.discount_value < 0:
        raise HTTPException(status_code=400, detail="Discount value must be zero or greater.")

    if req.expires_at:
        expires_at = req.expires_at
    else:
        from datetime import timedelta
        expires_at = (datetime.now() + timedelta(days=365)).isoformat()

    voucher_id = f"vch_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now().isoformat()
    clean_title = re.sub(r'[^A-Za-z0-9]', '', title).upper()[:8]
    voucher_code = getattr(req, "code", None) or f"{clean_title or 'VCH'}-{uuid.uuid4().hex[:6].upper()}"
    voucher = {
        "_id": voucher_id,
        "voucher_id": voucher_id,
        "business_id": biz["id"],
        "code": voucher_code,
        "title": title,
        "description": req.description or "",
        "discount_type": discount_type,
        "discount_value": float(req.discount_value),
        "minimum_order_value": float(req.minimum_order_value or 0),
        "usage_limit": int(req.usage_limit or 1),
        "total_usage_limit": req.total_usage_limit,
        "start_at": req.start_at or now_iso,
        "expires_at": expires_at,
        "status": (req.status or "ACTIVE").upper(),
        "audience_type": (req.audience_type or "ALL_ELIGIBLE").upper(),
        "selected_customer_ids": req.selected_customer_ids or [],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    vouchers_col = get_collection("vouchers")
    vouchers_col.insert_one(voucher)

    customer_vouchers_col = get_collection("customer_vouchers")
    assigned_customer_ids = []
    audience = voucher["audience_type"]

    if audience == "ALL_ELIGIBLE":
        cb_col = get_collection("customer_businesses")
        eligible_customer_ids = sorted({c["customer_id"] for c in cb_col.find({"business_id": biz["id"], "status": "active"})})
        for customer_id in eligible_customer_ids:
            existing = customer_vouchers_col.find_one({"voucher_id": voucher_id, "customer_id": customer_id})
            if existing:
                continue
            customer_voucher = {
                "_id": f"cv_{uuid.uuid4().hex[:12]}",
                "voucher_id": voucher_id,
                "customer_id": customer_id,
                "business_id": biz["id"],
                "code": voucher_code,
                "title": title,
                "discount_type": discount_type,
                "discount_value": float(req.discount_value),
                "status": "AVAILABLE",
                "issued_at": now_iso,
                "viewed_at": None,
                "redeemed_at": None,
                "expires_at": expires_at,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            customer_vouchers_col.insert_one(customer_voucher)
            assigned_customer_ids.append(customer_id)
    elif audience == "SELECTED":
        allowed_customer_ids = []
        cb_col = get_collection("customer_businesses")
        for customer_id in (req.selected_customer_ids or []):
            if cb_col.find_one({"customer_id": customer_id, "business_id": biz["id"], "status": "active"}):
                allowed_customer_ids.append(customer_id)

        for customer_id in allowed_customer_ids:
            existing = customer_vouchers_col.find_one({"voucher_id": voucher_id, "customer_id": customer_id})
            if not existing:
                customer_voucher = {
                    "_id": f"cv_{uuid.uuid4().hex[:12]}",
                    "voucher_id": voucher_id,
                    "customer_id": customer_id,
                    "business_id": biz["id"],
                    "code": voucher_code,
                    "title": title,
                    "discount_type": discount_type,
                    "discount_value": float(req.discount_value),
                    "status": "AVAILABLE",
                    "issued_at": now_iso,
                    "viewed_at": None,
                    "redeemed_at": None,
                    "expires_at": expires_at,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                customer_vouchers_col.insert_one(customer_voucher)
                assigned_customer_ids.append(customer_id)

    return {"success": True, "voucher": voucher, "assigned_customer_count": len(assigned_customer_ids)}


@router.get("/business/vouchers/{voucher_id}")
def get_business_voucher(voucher_id: str, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)
    vouchers_col = get_collection("vouchers")
    voucher = vouchers_col.find_one({"voucher_id": voucher_id, "business_id": biz["id"]})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found.")
    return {"success": True, "voucher": voucher}


@router.put("/business/offers/{voucher_id}")
@router.put("/business/vouchers/{voucher_id}")
def update_business_voucher(
    voucher_id: str,
    req: VoucherUpdateRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    biz = _get_business_for_owner(current_user)
    vouchers_col = get_collection("vouchers")
    voucher = vouchers_col.find_one({"voucher_id": voucher_id, "business_id": biz["id"]}) or vouchers_col.find_one({"id": voucher_id, "business_id": biz["id"]})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found.")

    updates = {k: v for k, v in req.dict().items() if v is not None}
    if "status" in updates:
        updates["status"] = str(updates["status"]).upper()
    if "discount_type" in updates:
        updates["discount_type"] = str(updates["discount_type"]).upper()
    if "audience_type" in updates:
        updates["audience_type"] = str(updates["audience_type"]).upper()
    updates["updated_at"] = datetime.now().isoformat()
    v_id = voucher.get("voucher_id") or voucher.get("id")
    vouchers_col.update_one({"voucher_id": v_id}, {"$set": updates})
    updated = vouchers_col.find_one({"voucher_id": v_id}) or vouchers_col.find_one({"id": v_id})
    return {"success": True, "voucher": updated}


@router.delete("/business/offers/{voucher_id}")
@router.delete("/business/vouchers/{voucher_id}")
def delete_business_voucher(voucher_id: str, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)
    vouchers_col = get_collection("vouchers")
    voucher = vouchers_col.find_one({"voucher_id": voucher_id, "business_id": biz["id"]}) or vouchers_col.find_one({"id": voucher_id, "business_id": biz["id"]})
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found.")
    v_id = voucher.get("voucher_id") or voucher.get("id")
    vouchers_col.update_one({"voucher_id": v_id}, {"$set": {"status": "ARCHIVED", "updated_at": datetime.now().isoformat()}})
    return {"success": True, "voucher_id": v_id, "status": "ARCHIVED"}


@router.get("/business/profile")
def get_business_profile(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    return biz

@router.put("/business/profile")
def update_business_profile(
    updates: dict,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    businesses_col = get_collection("businesses")
    biz = _get_business_for_owner(current_user)

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    filtered_updates = {k: v for k, v in updates.items() if k in BUSINESS_PROFILE_EDITABLE_FIELDS}

    if "stamps_required" in filtered_updates:
        try:
            stamp_target = int(filtered_updates["stamps_required"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Stamps required must be a whole number.") from None
        if not 1 <= stamp_target <= 1000:
            raise HTTPException(status_code=400, detail="Stamps required must be between 1 and 1000.")
        filtered_updates["stamps_required"] = stamp_target
    if "reward_description" in filtered_updates:
        reward_description = str(filtered_updates["reward_description"] or "").strip()
        if len(reward_description) > 300:
            raise HTTPException(status_code=400, detail="Reward description must be 300 characters or fewer.")
        filtered_updates["reward_description"] = reward_description

    if "upi_id" in filtered_updates:
        raw_upi = str(filtered_updates["upi_id"] or "").strip()
        if raw_upi:
            upi_pattern = r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$"
            if not re.match(upi_pattern, raw_upi):
                raise HTTPException(
                    status_code=400,
                    detail="Please enter a valid UPI ID (e.g. yourstore@okaxis, business@upi)"
                )
            filtered_updates["upi_id"] = raw_upi
            filtered_updates["upi_enabled"] = True
        else:
            filtered_updates["upi_id"] = ""
            filtered_updates["upi_enabled"] = False
    
    # Enforce Gallery Plan Limits
    if "gallery" in filtered_updates and isinstance(filtered_updates["gallery"], list):
        plan = (biz.get("subscription_plan") or "FREE").upper()
        limits = {"PRO": 50, "GROWTH": 15, "STARTER": 5, "BASIC": 5, "FREE": 2}
        max_allowed = limits.get(plan, 2)
        if len(filtered_updates["gallery"]) > max_allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Plan {plan} allows up to {max_allowed} gallery images. You provided {len(filtered_updates['gallery'])}."
            )

    # Sync logo & cover aliases
    if "logo_url" in filtered_updates and not filtered_updates.get("logo"):
        filtered_updates["logo"] = filtered_updates["logo_url"]
    elif "logo" in filtered_updates and not filtered_updates.get("logo_url"):
        filtered_updates["logo_url"] = filtered_updates["logo"]

    if "cover_photo_url" in filtered_updates and not filtered_updates.get("cover_image"):
        filtered_updates["cover_image"] = filtered_updates["cover_photo_url"]
    elif "cover_image" in filtered_updates and not filtered_updates.get("cover_photo_url"):
        filtered_updates["cover_photo_url"] = filtered_updates["cover_image"]

    filtered_updates["updated_at"] = datetime.now().isoformat()

    businesses_col.update_one({"id": biz["id"]}, {"$set": filtered_updates})
    return businesses_col.find_one({"id": biz["id"]})


class BusinessUpiUpdateRequest(BaseModel):
    upi_id: str
    upi_name: Optional[str] = None
    upi_notes: Optional[str] = "ZOOR UP Store Payment"
    upi_enabled: Optional[bool] = None


@router.get("/business/upi")
def get_business_upi(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    biz = _get_business_for_owner(current_user)
    return {
        "success": True,
        "business_id": biz["id"],
        "upi_id": biz.get("upi_id", ""),
        "upi_name": biz.get("upi_name", biz.get("name", "")),
        "upi_notes": biz.get("upi_notes", "ZOOR UP Store Payment"),
        "upi_enabled": bool(biz.get("upi_id")),
    }


@router.put("/business/upi")
def update_business_upi(
    req: BusinessUpiUpdateRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    biz = _get_business_for_owner(current_user)
    businesses_col = get_collection("businesses")
    clean_upi = (req.upi_id or "").strip()
    if clean_upi:
        upi_regex = r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$"
        if not re.match(upi_regex, clean_upi):
            raise HTTPException(
                status_code=400,
                detail="Invalid UPI ID format. Structure must be name@bank or store@upi (e.g. storename@okaxis)"
            )
    updates = {
        "upi_id": clean_upi,
        "upi_name": (req.upi_name or biz.get("name", "Store")).strip(),
        "upi_notes": (req.upi_notes or "ZOOR UP Store Payment").strip(),
        "upi_enabled": bool(clean_upi) if req.upi_enabled is None else bool(req.upi_enabled),
        "updated_at": datetime.now().isoformat()
    }
    result = businesses_col.update_one({"id": biz["id"]}, {"$set": updates})
    if result is False or getattr(result, "matched_count", 0) == 0:
        raise HTTPException(status_code=500, detail="Failed to save UPI settings: business not found or update failed.")
    updated_biz = businesses_col.find_one({"id": biz["id"]})
    if not updated_biz:
        raise HTTPException(status_code=500, detail="Failed to verify UPI settings persistence.")
    saved_upi_id = updated_biz.get("upi_id", "")
    if clean_upi and saved_upi_id != clean_upi:
        raise HTTPException(status_code=500, detail="UPI settings not persisted correctly.")
    return {
        "success": True,
        "business_id": biz["id"],
        "upi_id": saved_upi_id,
        "upi_name": updated_biz.get("upi_name", updates["upi_name"]),
        "upi_notes": updated_biz.get("upi_notes", updates["upi_notes"]),
        "upi_enabled": bool(saved_upi_id),
        "message": "UPI settings saved successfully"
    }


@router.get("/public/business/{business_id}/upi")
@router.get("/public/store/{business_id}/upi")
def get_public_store_upi(business_id: str):
    businesses_col = get_collection("businesses")
    from backend.routes.qr_routes import find_business_by_identifier
    biz, is_active = find_business_by_identifier(business_id, businesses_col)
    if not biz:
        raise HTTPException(status_code=404, detail="Store not found.")
    return {
        "success": True,
        "business_id": biz["id"],
        "business_name": biz.get("name", "Store"),
        "upi_id": biz.get("upi_id", ""),
        "upi_name": biz.get("upi_name", biz.get("name", "Store")),
        "upi_notes": biz.get("upi_notes", "ZOOR UP Store Payment"),
        "upi_enabled": bool(biz.get("upi_id")),
    }

@router.get("/onboarding/status")
def get_onboarding_status(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    businesses_col = get_collection("businesses")
    biz = _get_business_for_owner(current_user)

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    return {
        "onboarding_completed": bool(biz.get("onboarding_completed", False)),
        "current_step": int(biz.get("onboarding_step", 1)),
        "business": biz
    }

@router.put("/onboarding/business")
def save_onboarding_business(
    req: OnboardingBusinessRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    businesses_col = get_collection("businesses")
    biz = _get_business_for_owner(current_user)

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    data = {k: v for k, v in req.dict().items() if v is not None}
    data["updated_at"] = datetime.now().isoformat()
    if data.get("name"):
        data["slug"] = generate_unique_business_slug(data["name"], biz["id"], businesses_col)

    businesses_col.update_one({"id": biz["id"]}, {"$set": data})
    return {
        "success": True,
        "business": businesses_col.find_one({"id": biz["id"]})
    }

@router.put("/onboarding/step")
def save_onboarding_step(
    req: OnboardingStepRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))
):
    businesses_col = get_collection("businesses")
    biz = _get_business_for_owner(current_user)

    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    if req.step not in ONBOARDING_STEP_FIELDS:
        raise HTTPException(status_code=400, detail="Invalid onboarding step.")
    allowed_fields = BUSINESS_PROFILE_EDITABLE_FIELDS | {
        "designation", "loyalty_rate", "loyalty_welcome_bonus", "loyalty_min_redeem"
    }
    if req.step == 10:
        allowed_fields.add("onboarding_completed")
    unexpected_fields = set(req.data) - allowed_fields
    if unexpected_fields:
        raise HTTPException(status_code=400, detail="Onboarding data contains unsupported fields.")

    step_data = dict(req.data)
    step_data["onboarding_step"] = req.step
    if req.step >= 10:
        step_data["onboarding_completed"] = True
    step_data["updated_at"] = datetime.now().isoformat()

    if step_data.get("name"):
        step_data["slug"] = generate_unique_business_slug(step_data["name"], biz["id"], businesses_col)

    businesses_col.update_one({"id": biz["id"]}, {"$set": step_data})
    
    return {
        "success": True,
        "step": req.step,
        "business": businesses_col.find_one({"id": biz["id"]})
    }

@router.get("/business/subscription")
def get_business_subscription(current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    businesses_col = get_collection("businesses")
    biz = _get_business_for_owner(current_user)
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    plan = (biz.get("subscription_plan") or "FREE").upper()
    is_free = (plan == "FREE")
    now_dt = datetime.now()
    trial_ends_at = biz.get("trial_ends_at")
    sub_status = biz.get("subscription_status", "ACTIVE" if is_free else "TRIAL")
    trial_status = biz.get("trial_status", "NOT_APPLICABLE" if is_free else "ACTIVE")
    payment_status = biz.get("payment_status", "FREE" if is_free else "TRIAL")

    is_expired = False
    trial_active = False
    days_left = 0

    if not is_free and trial_ends_at:
        try:
            trial_dt = datetime.fromisoformat(trial_ends_at.replace("Z", "+00:00"))
            if trial_dt.tzinfo:
                from datetime import timezone
                now_cmp = datetime.now(timezone.utc)
            else:
                now_cmp = now_dt
            if now_cmp >= trial_dt:
                is_expired = True
                sub_status = "EXPIRED"
                trial_status = "EXPIRED"
                payment_status = "UNPAID"
                businesses_col.update_one(
                    {"id": biz["id"]},
                    {"$set": {
                        "subscription_status": "EXPIRED",
                        "trial_status": "EXPIRED",
                        "payment_status": "UNPAID",
                        "updated_at": now_dt.isoformat()
                    }}
                )
            else:
                trial_active = (sub_status == "TRIAL" and trial_status == "ACTIVE")
                delta = trial_dt - now_cmp
                days_left = max(0, delta.days + (1 if delta.seconds > 0 else 0))
        except Exception:
            pass

    can_access_premium = (sub_status == "ACTIVE" and plan != "FREE") or (sub_status == "TRIAL" and trial_active and not is_expired)

    return {
        "store_id": biz["id"],
        "business_id": biz["id"],
        "plan": plan,
        "status": sub_status,
        "subscription_status": sub_status,
        "trial_status": trial_status,
        "trial_active": trial_active,
        "trial_days_remaining": days_left,
        "trial_started_at": biz.get("trial_started_at"),
        "trial_ends_at": trial_ends_at,
        "trial_used": bool(biz.get("trial_used", not is_free)),
        "payment_status": payment_status,
        "can_access_premium": can_access_premium,
        "server_time": now_dt.isoformat(),
    }

@router.post("/business/subscription/trial")
def update_business_trial(payload: dict, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER]))):
    businesses_col = get_collection("businesses")
    biz = _get_business_for_owner(current_user)
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")

    target_plan = (payload.get("plan_id") or "FREE").upper()
    allowed_trial_plans = {"FREE", "STARTER", "GROWTH", "PRO", "PREMIUM"}
    if target_plan not in allowed_trial_plans:
        raise HTTPException(status_code=400, detail="Invalid subscription plan.")
    now_dt = datetime.now()

    if target_plan == "FREE":
        businesses_col.update_one(
            {"id": biz["id"]},
            {"$set": {
                "subscription_plan": "FREE",
                "subscription_status": "ACTIVE",
                "trial_status": "NOT_APPLICABLE",
                "payment_status": "FREE",
                "updated_at": now_dt.isoformat()
            }}
        )
        return {"success": True, "message": "Switched to Free plan", "plan": "FREE"}

    trial_used = bool(biz.get("trial_used", False))
    if trial_used:
        trial_ends_at = biz.get("trial_ends_at")
        trial_status = biz.get("trial_status")
        trial_end_dt = datetime.fromisoformat(trial_ends_at.replace("Z", "+00:00")) if trial_ends_at else None
        
        from datetime import timezone
        now_cmp = datetime.now(timezone.utc) if (trial_end_dt and trial_end_dt.tzinfo) else now_dt

        if trial_status == "ACTIVE" and trial_end_dt and now_cmp < trial_end_dt:
            # Upgrade within trial: keep original trial_ends_at! (Rule 23)
            businesses_col.update_one(
                {"id": biz["id"]},
                {"$set": {
                    "subscription_plan": target_plan,
                    "updated_at": now_dt.isoformat()
                }}
            )
            delta = trial_end_dt - now_cmp
            days_left = max(0, delta.days + (1 if delta.seconds > 0 else 0))
            return {
                "success": True,
                "message": f"Plan changed to {target_plan} within remaining trial duration",
                "plan": target_plan,
                "trial_ends_at": trial_ends_at,
                "days_remaining": days_left
            }
        else:
            return {
                "success": False,
                "error": "Your 30-day free trial has expired. Payment is required to continue using paid features.",
                "requires_payment": True,
                "plan": target_plan
            }

    # Brand new trial
    from datetime import timedelta
    trial_ends = now_dt + timedelta(days=30)
    businesses_col.update_one(
        {"id": biz["id"]},
        {"$set": {
            "subscription_plan": target_plan,
            "subscription_status": "TRIAL",
            "trial_status": "ACTIVE",
            "trial_started_at": now_dt.isoformat(),
            "trial_ends_at": trial_ends.isoformat(),
            "trial_used": True,
            "payment_status": "TRIAL",
            "updated_at": now_dt.isoformat()
        }}
    )
    return {
        "success": True,
        "message": f"30-Day Free Trial activated for {target_plan}",
        "plan": target_plan,
        "trial_ends_at": trial_ends.isoformat(),
        "days_remaining": 30
    }
