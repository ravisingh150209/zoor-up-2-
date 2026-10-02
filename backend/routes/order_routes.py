"""MongoDB-backed customer and business order APIs."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from backend.auth import require_role
from backend.database import get_collection
from backend.models import (
    OrderCreateRequest,
    OrderStatusUpdateRequest,
    ROLE_BUSINESS_OWNER,
    ROLE_CUSTOMER,
    ROLE_STAFF,
    ROLE_SUPER_ADMIN,
)
from backend.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/api", tags=["Orders"])

ORDER_STATUSES = {"NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"}
STATUS_TRANSITIONS = {
    "NEW": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"PREPARING", "CANCELLED"},
    "PREPARING": {"READY", "CANCELLED"},
    "READY": {"COMPLETED", "CANCELLED"},
    "COMPLETED": set(),
    "CANCELLED": set(),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _customer_identity(current_user: dict) -> tuple[str, dict]:
    customers = get_collection("customers")
    customer = customers.find_one({"user_id": current_user["id"]})
    if not customer and current_user.get("customer_id"):
        customer = customers.find_one({"customer_id": current_user["customer_id"]})
    customer_id = (customer or {}).get("customer_id") or current_user.get("customer_id")
    if not customer_id:
        raise HTTPException(status_code=403, detail="Customer profile could not be verified.")
    return customer_id, customer or {}


def _business_scope(current_user: dict) -> str:
    role = (current_user.get("role") or "").upper()
    businesses = get_collection("businesses")

    if role == ROLE_BUSINESS_OWNER:
        business = businesses.find_one({"owner_id": current_user.get("id")})
        if not business and current_user.get("business_id"):
            business = businesses.find_one({"id": current_user["business_id"], "owner_id": current_user.get("id")})
        if not business:
            raise HTTPException(status_code=403, detail="Business ownership could not be verified.")
        return business["id"]

    if role == ROLE_STAFF:
        business_id = current_user.get("business_id")
        permissions = current_user.get("permissions") or []
        has_order_permission = (
            isinstance(permissions, list) and "orders" in [str(item).lower() for item in permissions]
        ) or (
            isinstance(permissions, dict) and bool(permissions.get("orders"))
        )
        business = businesses.find_one({"id": business_id}) if business_id else None
        if not business or not has_order_permission:
            raise HTTPException(status_code=403, detail="Order permission is required for this business.")
        return business["id"]

    raise HTTPException(status_code=403, detail="Business order access is not available for this account.")


def _sorted_orders(records):
    return sorted(records, key=lambda record: record.get("created_at", ""), reverse=True)


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(
    request: OrderCreateRequest,
    http_request: Request,
    current_user: dict = Depends(require_role([ROLE_CUSTOMER])),
):
    enforce_rate_limit("order-create-user", current_user.get("id"), 12, 3600)
    client_ip = http_request.client.host if http_request.client else "unknown"
    enforce_rate_limit("order-create-ip", client_ip, 60, 3600)
    customer_id, customer = _customer_identity(current_user)
    business_id = request.business_id.strip()
    business = get_collection("businesses").find_one({"id": business_id})
    if not business or (business.get("status") and str(business["status"]).upper() not in {"ACTIVE", "APPROVED"}):
        raise HTTPException(status_code=404, detail="Business not found or unavailable.")

    connection = get_collection("customer_businesses").find_one({
        "customer_id": customer_id,
        "business_id": business_id,
        "status": "active",
    })
    if not connection:
        raise HTTPException(status_code=403, detail="Connect to this business before placing an order.")

    normalized_lines = []
    seen_products = {}
    for item in request.items:
        product_id = item.product_id.strip()
        seen_products[product_id] = seen_products.get(product_id, 0) + item.quantity
    if any(quantity > 100 for quantity in seen_products.values()):
        raise HTTPException(status_code=400, detail="An item quantity cannot exceed 100.")

    products = get_collection("products")
    subtotal = Decimal("0.00")
    for product_id, quantity in seen_products.items():
        product = products.find_one({"id": product_id, "business_id": business_id})
        if not product:
            raise HTTPException(status_code=400, detail="One or more products do not belong to this business.")
        if product.get("active", product.get("available", True)) is False:
            raise HTTPException(status_code=400, detail="One or more products are unavailable.")
        try:
            regular_price = Decimal(str(product.get("price", 0)))
            discount_val = product.get("discount_price")
            if discount_val is None and isinstance(product.get("metadata"), dict):
                discount_val = product["metadata"].get("discount_price")
            if discount_val is not None and str(discount_val).strip() not in ("", "None", "null"):
                unit_price = Decimal(str(discount_val))
            else:
                unit_price = regular_price
            if unit_price < 0 or regular_price < 0 or unit_price > regular_price:
                raise InvalidOperation
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(status_code=400, detail="A product has invalid server pricing.") from None

        line_total = _money(unit_price * quantity)
        subtotal += line_total
        normalized_lines.append({
            "product_id": product_id,
            "id": product_id,
            "name": product.get("name", "Product"),
            "quantity": quantity,
            "price": float(unit_price),
            "unit_price": float(unit_price),
            "line_total": float(line_total),
        })

    subtotal = _money(subtotal)
    tax = _money(subtotal * Decimal("0.05"))
    total = _money(subtotal + tax)

    table_name = request.table_number.strip() if request.table_number else None
    if request.table_id:
        table = get_collection("tables").find_one({
            "id": request.table_id,
            "business_id": business_id,
            "is_active": True,
        })
        if not table:
            raise HTTPException(status_code=400, detail="Selected table is not available for this business.")
        table_name = table.get("name") or table.get("table_number") or table_name

    fingerprint_data = {
        "business_id": business_id,
        "items": sorted((line["product_id"], line["quantity"]) for line in normalized_lines),
        "order_type": request.order_type,
        "table_id": request.table_id,
        "table_number": table_name,
        "payment_method": request.payment_method,
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True).encode("utf-8")).hexdigest()
    orders = get_collection("orders")
    prior = orders.find_one({"customer_id": customer_id, "idempotency_key": request.idempotency_key})
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise HTTPException(status_code=409, detail="This order attempt key was already used for a different order.")
        return prior

    now = _now_iso()
    order_id = f"ORD-{datetime.now(timezone.utc).year}-{uuid.uuid4().hex[:12].upper()}"
    order = {
        "id": order_id,
        "order_id": order_id,
        "business_id": business_id,
        "business_name": business.get("name", "Store"),
        "customer_id": customer_id,
        "customer_code": customer_id,
        "customer_user_id": current_user["id"],
        "customer_name": (request.customer_name or customer.get("name") or current_user.get("name") or "Customer").strip(),
        "customer_phone": (request.customer_phone or customer.get("phone") or current_user.get("phone") or "").strip(),
        "customer_email": customer.get("email") or current_user.get("email") or "",
        "items": normalized_lines,
        "subtotal": float(subtotal),
        "discount": 0.0,
        "tax": float(tax),
        "total": float(total),
        "total_amount": float(total),
        "status": "NEW",
        "order_type": request.order_type,
        "table_id": request.table_id,
        "table_number": table_name,
        "payment_method": request.payment_method,
        "payment_status": "PENDING",
        "idempotency_key": request.idempotency_key,
        "request_fingerprint": fingerprint,
        "created_at": now,
        "updated_at": now,
    }

    try:
        orders.insert_one(dict(order))
    except Exception:
        duplicate = orders.find_one({"customer_id": customer_id, "idempotency_key": request.idempotency_key})
        if duplicate and duplicate.get("request_fingerprint") == fingerprint:
            return duplicate
        raise
    return order


@router.get("/orders/my")
def get_my_orders(current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    customer_id, _ = _customer_identity(current_user)
    return _sorted_orders(get_collection("orders").find({"customer_id": customer_id}))


@router.get("/orders/{order_id}")
def get_my_order(order_id: str, current_user: dict = Depends(require_role([ROLE_CUSTOMER]))):
    customer_id, _ = _customer_identity(current_user)
    order = get_collection("orders").find_one({"id": order_id, "customer_id": customer_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@router.get("/business/orders")
def get_business_orders(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=120),
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_STAFF])),
):
    business_id = _business_scope(current_user)
    query = {"business_id": business_id}
    if status_filter and status_filter.upper() != "ALL":
        normalized_status = status_filter.upper()
        if normalized_status not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid order status filter.")
        query["status"] = normalized_status
    records = get_collection("orders").find(query)
    if search:
        term = search.casefold()
        records = [record for record in records if term in str(record.get("id", "")).casefold()
                   or term in str(record.get("customer_name", "")).casefold()
                   or term in str(record.get("customer_phone", "")).casefold()]
    return _sorted_orders(records)


@router.get("/business/orders/{order_id}")
def get_business_order(order_id: str, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_STAFF]))):
    business_id = _business_scope(current_user)
    order = get_collection("orders").find_one({"id": order_id, "business_id": business_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@router.patch("/business/orders/{order_id}/status")
def update_business_order_status(
    order_id: str,
    request: OrderStatusUpdateRequest,
    current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_STAFF])),
):
    business_id = _business_scope(current_user)
    orders = get_collection("orders")
    order = orders.find_one({"id": order_id, "business_id": business_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if request.status not in STATUS_TRANSITIONS.get(order.get("status"), set()):
        raise HTTPException(status_code=400, detail="This order status transition is not allowed.")
    updates = {"status": request.status, "updated_at": _now_iso()}
    orders.update_one({"id": order_id, "business_id": business_id}, {"$set": updates})
    return orders.find_one({"id": order_id, "business_id": business_id})


@router.get("/admin/orders/summary")
def get_admin_order_summary(current_user: dict = Depends(require_role([ROLE_SUPER_ADMIN]))):
    records = get_collection("orders").find()
    return {
        "total_orders": len(records),
        "gross_merchandise_value": round(sum(
            float(record.get("total") or 0) for record in records if record.get("payment_status") == "PAID"
        ), 2),
    }