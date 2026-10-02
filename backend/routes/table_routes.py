"""
ZOOR UP Table Booking & Seating Management Routes
Handles server-side availability checks, table configuration,
conflict-free booking reservations, capacity checks, and double-booking protection.

Endpoints:
Customer APIs:
- GET /api/customer/tables
- GET /api/customer/table-availability
- POST /api/customer/table-reservations (and /api/tables/bookings)
- GET /api/customer/table-reservations
- PUT /api/customer/table-reservations/{id}/cancel

Business APIs:
- GET /api/tables
- POST /api/tables
- PUT /api/tables/{id}
- DELETE /api/tables/{id}
- GET /api/tables/reservations
- PATCH /api/tables/reservations/{id}/status
"""
import uuid
import time
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, Depends, Query, Request
from backend.models import (
    TableCreateRequest,
    TableUpdateRequest,
    TableSettingsRequest,
    BookingCreateRequest,
    BookingStatusUpdateRequest,
    ROLE_BUSINESS_OWNER,
    ROLE_CUSTOMER,
    ROLE_STAFF,
    ROLE_SUPER_ADMIN
)
from backend.database import get_collection, db_instance
from backend.auth import get_current_user, get_optional_current_user, require_role
from backend.rate_limit import enforce_rate_limit

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

router = APIRouter(prefix="/api/tables", tags=["Table Booking"])
customer_table_router = APIRouter(prefix="/api/customer", tags=["Customer Table Booking"])


def _resolve_business_for_owner(current_user: dict, requested_business_id: Optional[str] = None) -> str:
    businesses_col = get_collection("businesses")
    role = (current_user.get("role") or "").upper()
    if requested_business_id:
        biz = businesses_col.find_one({"id": requested_business_id.strip()}) or businesses_col.find_one({"slug": requested_business_id.strip()})
        if not biz:
            raise HTTPException(status_code=404, detail="Business not found.")
        if role == ROLE_STAFF:
            permissions = current_user.get("permissions") or []
            allowed = (isinstance(permissions, list) and "table-booking" in [str(item).lower() for item in permissions]) or (
                isinstance(permissions, dict) and bool(permissions.get("table-booking"))
            )
            if not allowed or current_user.get("business_id") != biz.get("id"):
                raise HTTPException(status_code=403, detail="Table booking permission is required for this business.")
        elif role != ROLE_SUPER_ADMIN and biz.get("owner_id") != current_user.get("id"):
            raise HTTPException(status_code=403, detail="You do not have permission to manage this business.")
        return biz["id"]

    if role == ROLE_STAFF:
        permissions = current_user.get("permissions") or []
        allowed = (isinstance(permissions, list) and "table-booking" in [str(item).lower() for item in permissions]) or (
            isinstance(permissions, dict) and bool(permissions.get("table-booking"))
        )
        staff_business = businesses_col.find_one({"id": current_user.get("business_id")})
        if not allowed or not staff_business:
            raise HTTPException(status_code=403, detail="Table booking permission is required for this business.")
        return staff_business["id"]

    if current_user.get("business_id"):
        biz = businesses_col.find_one({"id": current_user["business_id"]})
        if biz and biz.get("owner_id") in (None, current_user.get("id")):
            return biz["id"]

    biz = businesses_col.find_one({"owner_id": current_user["id"]})
    if not biz:
        raise HTTPException(status_code=403, detail="Business ownership not found for this account.")
    return biz["id"]

def parse_time_to_minutes(time_str: str) -> int:
    try:
        parts = (time_str or "12:00").strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 12 * 60

# =============================================================
# HELPER: AVAILABILITY ENGINE
# =============================================================
def calculate_available_tables(
    business_id: str,
    date: str,
    time: str,
    party_size: int = 2
) -> List[Dict[str, Any]]:
    settings_col = get_collection("table_settings")
    settings = settings_col.find_one({"business_id": business_id}) or {
        "enabled": True,
        "slot_duration_mins": 90,
        "opening_time": "10:00",
        "closing_time": "22:30"
    }

    if not settings.get("enabled", True):
        return []

    tables_col = get_collection("tables")
    tables = tables_col.find({"business_id": business_id, "is_active": True})

    # Filter by capacity
    eligible_tables = [t for t in tables if t.get("capacity", 2) >= party_size]
    if not eligible_tables:
        return []

    slot_duration = int(settings.get("slot_duration_mins", 90))
    target_start_mins = parse_time_to_minutes(time)
    target_end_mins = target_start_mins + slot_duration

    # Check opening and closing hours
    open_mins = parse_time_to_minutes(settings.get("opening_time", "10:00"))
    close_mins = parse_time_to_minutes(settings.get("closing_time", "22:30"))
    if target_start_mins < open_mins or target_end_mins > (close_mins + 30):
        return []

    # Check existing reservations in table_reservations and table_bookings
    reservations_col = get_collection("table_reservations")
    active_reservations = reservations_col.find({
        "business_id": business_id,
        "date": date
    })
    # Also check legacy table_bookings collection
    bookings_col = get_collection("table_bookings")
    legacy_bookings = bookings_col.find({
        "business_id": business_id,
        "booking_date": date
    })

    all_active = []
    for r in active_reservations:
        status_val = (r.get("status") or "").lower()
        if status_val not in ["cancelled", "rejected", "no-show"]:
            all_active.append(r)

    for b in legacy_bookings:
        status_val = (b.get("status") or "").lower()
        if status_val not in ["cancelled", "rejected", "no-show"]:
            all_active.append(b)

    available_tables = []
    for t in eligible_tables:
        t_id = t["id"]
        conflict = False
        for r in all_active:
            if r.get("table_id") == t_id:
                r_time = r.get("time") or r.get("booking_time") or "12:00"
                r_start = parse_time_to_minutes(r_time)
                r_end = r_start + slot_duration
                if (target_start_mins < r_end) and (target_end_mins > r_start):
                    conflict = True
                    break
        if not conflict:
            available_tables.append({
                "id": t["id"],
                "name": t.get("name") or t.get("table_number") or f"Table {t['id']}",
                "table_number": t.get("name") or t.get("table_number"),
                "section": t.get("section") or t.get("location", "Main Dining"),
                "location": t.get("section") or t.get("location", "Main Dining"),
                "capacity": t.get("capacity", 2),
                "is_active": True
            })

    return available_tables

# =============================================================
# 1. CUSTOMER TABLE APIS
# =============================================================

@customer_table_router.get("/tables")
def get_customer_tables(
    business_id: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    """Returns available tables only for the authenticated customer's connected business."""
    businesses_col = get_collection("businesses")
    biz_id = None

    if current_user:
        customer_id = current_user.get("customer_id") or current_user.get("id")
        cb_col = get_collection("customer_businesses")
        cb = cb_col.find_one({"customer_id": customer_id, "status": "active"})
        if cb:
            biz_id = cb["business_id"]

    if business_id and current_user:
        requested_biz = businesses_col.find_one({"id": business_id.strip()}) or businesses_col.find_one({"slug": business_id.strip()})
        if requested_biz:
            allowed_connections = set(
                c.get("business_id") for c in get_collection("customer_businesses").find({"customer_id": current_user.get("customer_id") or current_user.get("id"), "status": "active"})
            )
            if requested_biz["id"] not in allowed_connections:
                return []
            biz_id = requested_biz["id"]

    if not biz_id:
        return []

    tables_col = get_collection("tables")
    tables = tables_col.find({"business_id": biz_id, "is_active": True})
    return [
        {
            "id": t["id"],
            "name": t.get("name") or t.get("table_number"),
            "table_number": t.get("name") or t.get("table_number"),
            "section": t.get("section") or t.get("location", "Main Dining"),
            "location": t.get("section") or t.get("location", "Main Dining"),
            "capacity": t.get("capacity", 4),
            "is_active": t.get("is_active", True)
        }
        for t in tables
    ]

@customer_table_router.get("/table-availability")
def get_customer_table_availability(
    business_id: str = Query(...),
    date: str = Query(..., description="YYYY-MM-DD"),
    time: str = Query(..., description="HH:MM"),
    guests: int = Query(2, ge=1)
):
    """Return tables available for that slot."""
    return calculate_available_tables(business_id, date, time, guests)

def handle_create_reservation(
    req: BookingCreateRequest,
    current_user: Optional[dict],
    client_ip: str = "unknown",
):
    """
    Creates a new reservation.
    Auto-populates customer identity from authenticated JWT session if omitted or empty.
    Enforces double-booking conflict (409 Conflict).
    """
    # 1. Resolve customer identity strictly from the authenticated JWT session.
    customer_id = None
    customer_name = req.customer_name
    customer_phone = req.customer_phone
    customer_email = req.customer_email or ""

    if current_user:
        customers_col = get_collection("customers")
        cus = customers_col.find_one({"user_id": current_user["id"]}) or customers_col.find_one({"phone": current_user.get("phone")})
        if cus:
            customer_id = cus.get("customer_id") or cus.get("id")
            customer_name = customer_name or cus.get("name") or current_user.get("name")
            customer_phone = customer_phone or cus.get("phone") or current_user.get("phone")
            customer_email = customer_email or cus.get("email") or current_user.get("email") or ""
        else:
            customer_id = current_user.get("customer_id") or current_user["id"]
            customer_name = customer_name or current_user.get("name")
            customer_phone = customer_phone or current_user.get("phone")
            customer_email = customer_email or current_user.get("email") or ""
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required for table booking.")

    if not customer_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Customer identity could not be verified from session.")

    enforce_rate_limit("booking-create-user", current_user.get("id"), 10, 3600)
    enforce_rate_limit("booking-create-ip", client_ip, 40, 3600)

    # Validate that customer has completed name and phone
    if not customer_name or not customer_phone or not customer_name.strip() or not customer_phone.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please complete your profile before booking."
        )

    # 2. Resolve business strictly from the authenticated customer's active relationships.
    business_id = req.business_id
    cb_col = get_collection("customer_businesses")
    resolved_connection = cb_col.find_one({"customer_id": customer_id, "status": "active"})

    if business_id:
        businesses_col = get_collection("businesses")
        biz = businesses_col.find_one({"id": business_id.strip()}) or businesses_col.find_one({"slug": business_id.strip()})
        if not biz:
            raise HTTPException(status_code=404, detail="Business partner not found.")
        allowed_business_ids = {item.get("business_id") for item in cb_col.find({"customer_id": customer_id, "status": "active"})}
        if biz["id"] not in allowed_business_ids:
            if (biz.get("status") or "").upper() == "ACTIVE":
                cb_col.insert_one({
                    "id": f"cb_{uuid.uuid4().hex[:10]}",
                    "customer_id": customer_id,
                    "business_id": biz["id"],
                    "source": "table_booking",
                    "status": "active",
                    "created_at": datetime.now().isoformat()
                })
            else:
                raise HTTPException(status_code=403, detail="This business is not connected to your account.")
        actual_biz_id = biz["id"]
    elif resolved_connection:
        actual_biz_id = resolved_connection["business_id"]
    else:
        raise HTTPException(status_code=400, detail="Connect to a business before creating a reservation.")

    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"id": actual_biz_id})
    if not biz:
        raise HTTPException(status_code=404, detail="Business partner not found.")

    # 3. Resolve Date, Time, Guests
    target_date = req.date or req.booking_date
    target_time = req.time or req.booking_time
    if not target_date or not target_time:
        raise HTTPException(status_code=400, detail="Booking date and arrival time are required.")

    guests_count = req.guests if req.guests is not None else (req.party_size if req.party_size is not None else 2)
    if guests_count < 1:
        raise HTTPException(status_code=400, detail="Number of guests must be at least 1.")

    # 4. Resolve Table & Capacity
    tables_col = get_collection("tables")
    selected_table = None
    if req.table_id:
        selected_table = tables_col.find_one({"id": req.table_id, "business_id": actual_biz_id})
        if not selected_table:
            raise HTTPException(status_code=404, detail="Selected table does not exist for this business.")
        if not selected_table.get("is_active", True):
            raise HTTPException(status_code=400, detail="Selected table is currently not active.")
        if guests_count > selected_table.get("capacity", 4):
            raise HTTPException(
                status_code=400,
                detail=f"Party size ({guests_count}) exceeds table capacity ({selected_table.get('capacity', 4)})."
            )
    else:
        # Auto-pick eligible available table
        available = calculate_available_tables(actual_biz_id, target_date, target_time, guests_count)
        if not available:
            raise HTTPException(status_code=409, detail="No tables are available for the requested time and party size.")
        selected_table = tables_col.find_one({"id": available[0]["id"]})

    # 5. Check Double-Booking Conflict (409 Conflict)
    settings_col = get_collection("table_settings")
    settings = settings_col.find_one({"business_id": actual_biz_id}) or {"slot_duration_mins": 90}
    slot_duration = int(settings.get("slot_duration_mins", 90))
    target_start_mins = parse_time_to_minutes(target_time)
    target_end_mins = target_start_mins + slot_duration

    reservations_col = get_collection("table_reservations")
    existing_reservations = reservations_col.find({"business_id": actual_biz_id, "date": target_date})
    bookings_col = get_collection("table_bookings")
    existing_bookings = bookings_col.find({"business_id": actual_biz_id, "booking_date": target_date})

    for r in list(existing_reservations) + list(existing_bookings):
        r_status = (r.get("status") or "").lower()
        if r_status in ["cancelled", "rejected", "no-show"]:
            continue
        if r.get("table_id") == selected_table["id"]:
            r_time = r.get("time") or r.get("booking_time") or "12:00"
            r_start = parse_time_to_minutes(r_time)
            r_end = r_start + slot_duration
            if (target_start_mins < r_end) and (target_end_mins > r_start):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Table is already booked for this date and time."
                )

    # 6. Create Reservation Record
    unique_suffix = f"{int(time.time() * 1000) % 100000:05d}_{secrets.token_hex(2)}"
    reservation_id = f"TR-{datetime.now().year}-{unique_suffix}"
    now_iso = datetime.now().isoformat()
    table_name = selected_table.get("name") or selected_table.get("table_number") or f"Table {selected_table['id']}"
    notes = req.notes or req.special_notes or ""

    reservation_record = {
        "id": reservation_id,
        "booking_id": reservation_id,
        "business_id": actual_biz_id,
        "business_name": biz.get("name", "Store"),
        "customer_id": customer_id,
        "customer_name": customer_name.strip(),
        "customer_phone": customer_phone.strip(),
        "customer_email": customer_email.strip(),
        "table_id": selected_table["id"],
        "table_name": table_name,
        "table_number": table_name,
        "section": selected_table.get("section") or selected_table.get("location", "Main Dining"),
        "date": target_date,
        "booking_date": target_date,
        "time": target_time,
        "booking_time": target_time,
        "time_slot": target_time,
        "guests": guests_count,
        "party_size": guests_count,
        "notes": notes,
        "special_notes": notes,
        "status": "pending",
        "created_at": now_iso,
        "updated_at": now_iso
    }

    reservations_col.insert_one(reservation_record)
    # Mirror into table_bookings only if it maps to a distinct underlying table/collection
    if getattr(bookings_col, "table_name", "b") != getattr(reservations_col, "table_name", "r"):
        try:
            bookings_col.insert_one(reservation_record)
        except Exception:
            pass

    # Send notifications
    try:
        notifs_col = get_collection("notifications")
        notifs_col.insert_one({
            "id": f"notif_{uuid.uuid4().hex[:10]}",
            "recipient_id": customer_id,
            "role": "customer",
            "type": "BOOKING",
            "title": "Reservation Confirmed",
            "message": f"Your reservation at {biz.get('name')} for {guests_count} guests on {target_date} at {target_time} is placed.",
            "action_url": "/customer/table-booking",
            "read": False,
            "created_at": now_iso
        })
    except Exception:
        pass

    return reservation_record

@customer_table_router.post("/table-reservations")
def create_customer_reservation(
    req: BookingCreateRequest,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    return handle_create_reservation(req, current_user, request.client.host if request.client else "unknown")

@router.post("/bookings")
def create_booking_legacy(
    req: BookingCreateRequest,
    request: Request,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    return handle_create_reservation(req, current_user, request.client.host if request.client else "unknown")

@customer_table_router.get("/table-reservations")
def get_customer_reservations(current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    """Returns the logged-in customer's reservations with strict customer isolation."""
    user_id = current_user["id"]
    customers_col = get_collection("customers")
    cus = customers_col.find_one({"user_id": user_id}) or customers_col.find_one({"phone": current_user.get("phone")})
    customer_id = cus["customer_id"] if cus else current_user.get("customer_id") or user_id

    reservations_col = get_collection("table_reservations")
    my_res = reservations_col.find({"customer_id": customer_id})
    if not my_res:
        bookings_col = get_collection("table_bookings")
        my_res = bookings_col.find({"customer_id": customer_id})

    # Sort descending by date and time
    return sorted(my_res, key=lambda x: (x.get("date") or x.get("booking_date", ""), x.get("time") or x.get("booking_time", "")), reverse=True)

@customer_table_router.put("/table-reservations/{reservation_id}/cancel")
def cancel_customer_reservation(
    reservation_id: str,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    """Allows customer to cancel their own reservation."""
    clean_id = reservation_id.strip()
    reservations_col = get_collection("table_reservations")
    res = reservations_col.find_one({"id": clean_id}) or reservations_col.find_one({"booking_id": clean_id})
    
    if not res:
        bookings_col = get_collection("table_bookings")
        res = bookings_col.find_one({"id": clean_id}) or bookings_col.find_one({"booking_id": clean_id})

    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    # Isolation check: customer can only cancel their own reservation
    user_id = current_user["id"]
    customers_col = get_collection("customers")
    cus = customers_col.find_one({"user_id": user_id}) or customers_col.find_one({"phone": current_user.get("phone")})
    customer_id = (cus.get("customer_id") if cus else None) or current_user.get("customer_id") or user_id

    allowed_ids = [cid for cid in [customer_id, user_id, current_user.get("phone"), (cus.get("phone") if cus else None)] if cid]
    if res.get("customer_id") not in allowed_ids and res.get("customer_phone") != current_user.get("phone"):
        raise HTTPException(status_code=403, detail="You can only cancel your own reservations.")

    now_iso = datetime.now().isoformat()
    reservations_col.update_one({"id": res["id"]}, {"$set": {"status": "cancelled", "updated_at": now_iso}})
    bookings_col = get_collection("table_bookings")
    bookings_col.update_one({"id": res["id"]}, {"$set": {"status": "CANCELLED", "updated_at": now_iso}})

    return {"success": True, "message": "Reservation cancelled successfully.", "status": "cancelled"}

# =============================================================
# 2. BUSINESS TABLE MANAGEMENT & RESERVATION DASHBOARD
# =============================================================

@router.get("")
def get_tables_business(
    business_id: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    """Business owner table list."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Business authentication required.")

    biz_id = _resolve_business_for_owner(current_user, business_id)

    tables = get_collection("tables").find({"business_id": biz_id})
    return [
        {
            "id": t["id"],
            "business_id": t.get("business_id"),
            "name": t.get("name") or t.get("table_number"),
            "table_number": t.get("name") or t.get("table_number"),
            "section": t.get("section") or t.get("location", "Main Dining"),
            "capacity": t.get("capacity", 4),
            "status": "available",
            "is_active": t.get("is_active", True),
            "created_at": t.get("created_at"),
            "updated_at": t.get("updated_at")
        }
        for t in tables
    ]

@router.post("")
def create_table_business(
    req: TableCreateRequest,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """Business owner creates a new table."""
    biz_id = _resolve_business_for_owner(current_user)

    table_num = req.table_number.strip()
    tables_col = get_collection("tables")
    existing = tables_col.find_one({"business_id": biz_id, "table_number": table_num})
    if existing:
        raise HTTPException(status_code=400, detail=f"Table '{table_num}' already exists for this business.")

    table_id = f"tbl_{uuid.uuid4().hex[:10]}"
    now_iso = datetime.now().isoformat()
    new_table = {
        "id": table_id,
        "business_id": biz_id,
        "name": table_num,
        "table_number": table_num,
        "section": req.location or "Main Dining",
        "location": req.location or "Main Dining",
        "capacity": max(1, req.capacity),
        "status": "available",
        "is_active": req.is_active,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    tables_col.insert_one(new_table)
    return new_table

@router.get("/settings")
def get_business_table_settings(
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES)),
):
    biz_id = _resolve_business_for_owner(current_user, business_id)
    return get_collection("table_settings").find_one({"business_id": biz_id}) or {
        "business_id": biz_id,
        "enabled": True,
        "slot_duration_mins": 90,
        "buffer_mins": 15,
        "opening_time": "10:00",
        "closing_time": "22:30",
        "max_party_size": 16,
        "max_advance_days": 14,
    }


@router.put("/settings")
def update_business_table_settings(
    req: TableSettingsRequest,
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES)),
):
    biz_id = _resolve_business_for_owner(current_user, business_id)
    settings_col = get_collection("table_settings")
    settings = {**req.dict(), "business_id": biz_id, "updated_at": datetime.now().isoformat()}
    settings_col.update_one({"business_id": biz_id}, {"$set": settings}, upsert=True)
    return settings_col.find_one({"business_id": biz_id})

@router.put("/{table_id}")
def update_table_business(
    table_id: str,
    req: TableUpdateRequest,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """Business owner updates a table."""
    tables_col = get_collection("tables")
    table = tables_col.find_one({"id": table_id.strip()})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    biz_id = _resolve_business_for_owner(current_user)
    if table.get("business_id") != biz_id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this table.")

    updates = {k: v for k, v in req.dict().items() if v is not None}
    if "table_number" in updates:
        updates["name"] = updates["table_number"]
    if "location" in updates:
        updates["section"] = updates["location"]
    updates["updated_at"] = datetime.now().isoformat()

    tables_col.update_one({"id": table["id"]}, {"$set": updates})
    return tables_col.find_one({"id": table["id"]})

@router.delete("/{table_id}")
def delete_table_business(
    table_id: str,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """Business owner deletes a table."""
    tables_col = get_collection("tables")
    table = tables_col.find_one({"id": table_id.strip()})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    biz_id = _resolve_business_for_owner(current_user)
    if table.get("business_id") != biz_id:
        raise HTTPException(status_code=403, detail="You do not have permission to delete this table.")

    tables_col.delete_one({"id": table["id"]})
    return {"success": True, "message": "Table deleted successfully."}


@router.get("/reservations")
def get_business_reservations(
    business_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    current_user: Optional[dict] = Depends(get_optional_current_user)
):
    """Business reservation dashboard."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Business authentication required.")

    biz_id = _resolve_business_for_owner(current_user, business_id)

    query: Dict[str, Any] = {"business_id": biz_id}
    if status and status.upper() != "ALL":
        query["status"] = status.lower()
    if date:
        query["date"] = date

    reservations_col = get_collection("table_reservations")
    results = reservations_col.find(query)
    if not results:
        bookings_col = get_collection("table_bookings")
        results = bookings_col.find(query)

    return sorted(results, key=lambda x: (x.get("date") or x.get("booking_date", ""), x.get("time") or x.get("booking_time", "")), reverse=True)

@router.patch("/reservations/{reservation_id}/status")
def update_reservation_status(
    reservation_id: str,
    req: BookingStatusUpdateRequest,
    current_user: dict = Depends(require_role(BUSINESS_MANAGEMENT_ROLES))
):
    """Business updates reservation status: confirm, cancel, complete, no-show."""
    clean_id = reservation_id.strip()
    reservations_col = get_collection("table_reservations")
    res = reservations_col.find_one({"id": clean_id}) or reservations_col.find_one({"booking_id": clean_id})
    if not res:
        bookings_col = get_collection("table_bookings")
        res = bookings_col.find_one({"id": clean_id}) or bookings_col.find_one({"booking_id": clean_id})

    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    biz_id = _resolve_business_for_owner(current_user)
    if res.get("business_id") != biz_id:
        raise HTTPException(status_code=403, detail="You can only update reservations for your own business.")

    raw_status = req.status.lower().strip()
    status_map = {
        "confirm": "confirmed",
        "confirmed": "confirmed",
        "cancel": "cancelled",
        "cancelled": "cancelled",
        "complete": "completed",
        "completed": "completed",
        "no-show": "no-show",
        "noshow": "no-show",
        "no_show": "no-show"
    }
    new_status = status_map.get(raw_status, raw_status)
    now_iso = datetime.now().isoformat()
    updates = {"status": new_status, "updated_at": now_iso}
    if req.notes:
        updates["notes"] = req.notes

    reservations_col.update_one({"id": res["id"]}, {"$set": updates})
    get_collection("table_bookings").update_one({"id": res["id"]}, {"$set": {"status": new_status.upper(), "updated_at": now_iso}})

    return reservations_col.find_one({"id": res["id"]}) or res

# =============================================================
# LEGACY / COMPATIBILITY ALIASES
# =============================================================
@router.get("/{business_id}")
def get_business_tables_legacy(business_id: str, active_only: bool = False):
    tables = get_collection("tables").find({"business_id": business_id})
    return [
        {
            "id": t["id"],
            "table_number": t.get("name") or t.get("table_number"),
            "name": t.get("name") or t.get("table_number"),
            "capacity": t.get("capacity", 2),
            "location": t.get("section") or t.get("location", "Main Dining"),
            "is_active": t.get("is_active", True)
        }
        for t in tables
    ]

@router.get("/{business_id}/available")
def get_available_tables_legacy(
    business_id: str,
    date: str = Query(..., description="YYYY-MM-DD"),
    time: str = Query(..., description="HH:MM"),
    party_size: int = Query(2, ge=1)
):
    return calculate_available_tables(business_id, date, time, party_size)

@router.get("/bookings/customer/{customer_id}")
def get_customer_bookings_legacy(
    customer_id: str,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    customers_col = get_collection("customers")
    customer = customers_col.find_one({"user_id": current_user["id"]})
    authenticated_customer_id = (customer or {}).get("customer_id") or current_user.get("customer_id") or current_user["id"]
    if customer_id != authenticated_customer_id:
        raise HTTPException(status_code=403, detail="You can only view your own bookings.")
    bookings_col = get_collection("table_bookings")
    results = bookings_col.find({"customer_id": authenticated_customer_id})
    return sorted(results, key=lambda x: (x.get("booking_date", ""), x.get("booking_time", "")), reverse=True)

@router.post("/bookings/{booking_id}/cancel")
def cancel_booking_legacy(
    booking_id: str,
    reason: Optional[str] = "Cancelled by customer",
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    bookings_col = get_collection("table_bookings")
    booking = bookings_col.find_one({"id": booking_id}) or bookings_col.find_one({"booking_id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    customers_col = get_collection("customers")
    customer = customers_col.find_one({"user_id": current_user["id"]})
    authenticated_customer_id = (customer or {}).get("customer_id") or current_user.get("customer_id") or current_user["id"]
    if booking.get("customer_id") != authenticated_customer_id:
        raise HTTPException(status_code=403, detail="You can only cancel your own bookings.")

    now_iso = datetime.now().isoformat()
    bookings_col.update_one({"id": booking["id"]}, {"$set": {"status": "CANCELLED", "updated_at": now_iso}})
    get_collection("table_reservations").update_one({"id": booking["id"]}, {"$set": {"status": "cancelled", "updated_at": now_iso}})
    return {"success": True, "message": "Reservation cancelled successfully."}
