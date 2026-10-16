"""MongoDB-backed customer and business order APIs."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from backend.auth import require_role, get_current_user
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

from pydantic import BaseModel, Field

router = APIRouter(prefix="/api", tags=["Orders"])

class CouponValidateRequest(BaseModel):
    business_id: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)
    subtotal: float = Field(..., ge=0)
    customer_id: Optional[str] = None

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


def _validate_coupon_logic(business_id: str, code: str, subtotal_amount: Decimal, customer_id: str = "") -> tuple[dict, Decimal, str, str]:
    """
    Validates coupon or voucher against Supabase.
    Returns (record, discount_amount, clean_code, collection_name).
    Raises HTTPException on invalid, expired, or non-matching coupon.
    """
    clean_code = (code or "").strip().upper()
    if not clean_code:
        raise HTTPException(status_code=400, detail="Coupon code is required.")

    # 1. Search in vouchers collection
    vouchers_col = get_collection("vouchers")
    v = vouchers_col.find_one({"business_id": business_id, "code": clean_code})
    coll_name = "vouchers"

    # 2. Search in coupons collection (by business_id - canonical store identity)
    if not v:
        coupons_col = get_collection("coupons")
        # Primary: search by business_id (after migration adds this column)
        v = coupons_col.find_one({"business_id": business_id, "code": clean_code})
        coll_name = "coupons"
        if not v:
            # Backward compatibility: search by store_id (legacy coupons)
            v = coupons_col.find_one({"store_id": business_id, "code": clean_code})
            coll_name = "coupons"

    # 3. Check customer_vouchers if personalized or claimed loyalty reward
    if not v:
        cv_col = get_collection("customer_vouchers")
        v_cand = cv_col.find_one({"code": clean_code})
        if v_cand:
            v_cust_id = v_cand.get("customer_id")
            v_biz_id = v_cand.get("business_id")
            # Verify customer ownership if customer_id is provided
            cust_matches = True
            if customer_id and v_cust_id:
                cust_matches = (v_cust_id == customer_id or str(v_cust_id).endswith(str(customer_id)[-8:]))
            if cust_matches and (not v_biz_id or v_biz_id in (business_id, "default")):
                v = v_cand
                coll_name = "customer_vouchers"

    if not v:
        raise HTTPException(status_code=400, detail="Invalid coupon code or not applicable to this store.")

    # Check active status
    status_str = str(v.get("status", "ACTIVE")).upper()
    if status_str in ("REDEEMED", "USED"):
        raise HTTPException(status_code=400, detail="This voucher has already been redeemed.")
    if status_str == "EXPIRED":
        raise HTTPException(status_code=400, detail="This voucher has expired.")

    is_active = v.get("is_active", True) if coll_name == "coupons" else (status_str in ("ACTIVE", "AVAILABLE"))
    if not is_active:
        raise HTTPException(status_code=400, detail="This coupon is currently inactive.")

    # Check expiry
    expires_at = v.get("expires_at")
    if expires_at:
        try:
            exp_str = str(expires_at).replace("Z", "+00:00")
            exp_dt = datetime.fromisoformat(exp_str)
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="This coupon has expired.")
        except HTTPException:
            raise
        except Exception:
            pass

    # Check start time
    start_at = v.get("start_at")
    if start_at:
        try:
            st_str = str(start_at).replace("Z", "+00:00")
            st_dt = datetime.fromisoformat(st_str)
            if st_dt.tzinfo is None:
                st_dt = st_dt.replace(tzinfo=timezone.utc)
            if st_dt > datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="This coupon is not active yet.")
        except HTTPException:
            raise
        except Exception:
            pass

    # Check minimum order value
    min_order = Decimal(str(v.get("minimum_order") or v.get("min_spend") or v.get("minimum_order_value") or 0))
    if subtotal_amount < min_order:
        raise HTTPException(status_code=400, detail=f"Minimum order of ₹{min_order:.2f} is required for this coupon.")

    # Check usage limit
    usage_limit = v.get("usage_limit") or v.get("total_usage_limit")
    used_count = v.get("used_count") or v.get("total_claimed") or 0
    if usage_limit is not None and int(used_count) >= int(usage_limit):
        raise HTTPException(status_code=400, detail="This coupon has reached its maximum usage limit.")

    # Calculate discount
    discount_type = str(v.get("discount_type", "PERCENTAGE")).upper()
    discount_value = Decimal(str(v.get("discount_value", 0)))

    # Fallback discount derivation for claimed customer rewards without explicit discount_value
    if coll_name == "customer_vouchers" and discount_value <= Decimal("0"):
        v_title = str(v.get("title", ""))
        if "100" in v_title:
            discount_type = "FIXED"
            discount_value = Decimal("100.0")
        elif "20%" in v_title:
            discount_type = "PERCENTAGE"
            discount_value = Decimal("20.0")
        elif "500" in v_title or "MEAL" in v_title.upper():
            discount_type = "FIXED"
            discount_value = Decimal("250.0")
        else:
            discount_type = "FIXED"
            discount_value = Decimal("50.0")

    if discount_type in ("PERCENTAGE", "PERCENT"):
        discount_amount = (subtotal_amount * discount_value) / Decimal("100")
        max_discount = Decimal(str(v.get("max_discount") or v.get("maximum_discount") or 0))
        if max_discount > 0 and discount_amount > max_discount:
            discount_amount = max_discount
    else:
        discount_amount = min(subtotal_amount, discount_value)

    discount_amount = _money(max(Decimal("0.00"), discount_amount))
    return v, discount_amount, clean_code, coll_name


def _customer_identity(current_user: dict) -> tuple[str, dict]:
    customers = get_collection("customers")
    customer = (
        (customers.find_one({"customer_id": current_user.get("customer_id")}) if current_user.get("customer_id") else None) or
        (customers.find_one({"user_id": current_user["id"]}) if current_user.get("id") else None) or
        (customers.find_one({"id": current_user["id"]}) if current_user.get("id") else None) or
        (customers.find_one({"login_email": current_user.get("email")}) if current_user.get("email") else None) or
        (customers.find_one({"email": current_user.get("email")}) if current_user.get("email") else None) or
        (customers.find_one({"phone": current_user.get("phone")}) if current_user.get("phone") else None)
    )
    customer_id = (
        (customer or {}).get("customer_id") or
        (customer or {}).get("id") or
        current_user.get("customer_id") or
        current_user.get("id")
    )
    if not customer_id:
        raise HTTPException(status_code=403, detail="Customer profile could not be verified.")
    return customer_id, customer or {}


def _business_scope(current_user: dict) -> str:
    role = (current_user.get("role") or "").upper()
    businesses = get_collection("businesses")

    if role in (ROLE_BUSINESS_OWNER, "BUSINESS", "BUSINESS_OWNER"):
        business = None
        if current_user.get("id"):
            business = businesses.find_one({"owner_id": current_user.get("id")})
        if not business and current_user.get("business_id"):
            business = businesses.find_one({"id": current_user["business_id"]})
        if not business:
            raise HTTPException(status_code=403, detail="Business ownership could not be verified.")
        return business["id"]

    if role == ROLE_STAFF:
        business_id = current_user.get("business_id")
        permissions = current_user.get("permissions") or []
        has_order_permission = (
            not permissions  # Default staff has access
            or (isinstance(permissions, list) and "orders" in [str(item).lower() for item in permissions])
            or (isinstance(permissions, dict) and bool(permissions.get("orders")))
        )
        business = businesses.find_one({"id": business_id}) if business_id else None
        if not business or not has_order_permission:
            raise HTTPException(status_code=403, detail="Order permission is required for this business.")
        return business["id"]

    raise HTTPException(status_code=403, detail="Business order access is not available for this account.")


def _normalize_order(order: dict) -> dict:
    if not isinstance(order, dict):
        return order
    meta = order.get("metadata") or {}
    if meta.get("order_id"):
        order["order_id"] = meta["order_id"]
        order["id"] = meta["order_id"]
    elif order.get("order_id") and str(order["order_id"]).startswith("ORD-"):
        order["id"] = order["order_id"]
    if not order.get("payment_method") and meta.get("payment_method"):
        order["payment_method"] = meta.get("payment_method")
    if not order.get("customer_id") and meta.get("customer_id"):
        order["customer_id"] = meta.get("customer_id")
    if not order.get("customer_name") and meta.get("customer_name"):
        order["customer_name"] = meta.get("customer_name")
    if not order.get("customer_phone") and meta.get("customer_phone"):
        order["customer_phone"] = meta.get("customer_phone")
    if order.get("payment_status"):
        order["payment_status"] = str(order["payment_status"]).upper()
    if order.get("status"):
        order["status"] = str(order["status"]).upper()

    # 1. Parse stringified items if needed
    raw_items = order.get("items")
    if isinstance(raw_items, str):
        try:
            raw_items = json.loads(raw_items)
            order["items"] = raw_items
        except Exception:
            raw_items = []
            order["items"] = []

    # 2. If items is empty or None, look up in order_items table using order ID
    order_id = order.get("id") or order.get("order_id")
    order_uuid = order.get("_db_uuid") or order.get("id")
    if not raw_items and order_id:
        try:
            oi_col = get_collection("order_items")
            oi_records = oi_col.find({"order_id": order_id})
            if not oi_records and order_uuid and order_uuid != order_id:
                oi_records = oi_col.find({"order_id": order_uuid})
            if oi_records:
                raw_items = [
                    {
                        "product_id": r.get("product_id") or r.get("id"),
                        "id": r.get("product_id") or r.get("id"),
                        "name": r.get("product_name") or r.get("name") or "Product",
                        "product_name": r.get("product_name") or r.get("name") or "Product",
                        "quantity": int(r.get("quantity", 1)),
                        "unit_price": float(r.get("unit_price", 0.0)),
                        "price": float(r.get("unit_price", 0.0)),
                        "line_total": float(r.get("total_price", float(r.get("unit_price", 0.0)) * int(r.get("quantity", 1)))),
                        "subtotal": float(r.get("total_price", float(r.get("unit_price", 0.0)) * int(r.get("quantity", 1)))),
                    }
                    for r in oi_records
                ]
                order["items"] = raw_items
        except Exception:
            pass

    # 3. If any item is missing product name, fetch from products collection
    if isinstance(raw_items, list) and raw_items:
        missing_ids = []
        for it in raw_items:
            if isinstance(it, dict):
                pid = it.get("product_id") or it.get("id")
                if pid and (not it.get("name") or it.get("name") == "Product" or not it.get("price")):
                    missing_ids.append(pid)

        found_products = {}
        if missing_ids:
            try:
                prod_col = get_collection("products")
                for p in prod_col.find({"id": {"$in": missing_ids}}):
                    if p.get("id"):
                        found_products[p["id"]] = p
                    if p.get("_db_uuid"):
                        found_products[p["_db_uuid"]] = p
                    if isinstance(p.get("metadata"), dict) and p["metadata"].get("original_id"):
                        found_products[p["metadata"]["original_id"]] = p
            except Exception:
                pass

        normalized_items = []
        for it in raw_items:
            if not isinstance(it, dict):
                continue
            item_copy = dict(it)
            pid = item_copy.get("product_id") or item_copy.get("id")
            db_uuid_key = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(pid))) if pid else None
            prod = found_products.get(pid) or (found_products.get(db_uuid_key) if db_uuid_key else None)

            pname = item_copy.get("name") or item_copy.get("product_name")
            if (not pname or pname == "Product") and prod:
                pname = prod.get("name") or "Product"
            if not pname:
                pname = "Item"
            item_copy["name"] = pname
            item_copy["product_name"] = pname

            qty = int(item_copy.get("quantity") or 1)
            item_copy["quantity"] = qty

            uprice = item_copy.get("unit_price")
            if uprice is None:
                uprice = item_copy.get("price")
            if (uprice is None or float(uprice) == 0.0) and prod:
                uprice = prod.get("discount_price") or prod.get("price", 0.0)
            uprice = float(uprice or 0.0)
            item_copy["unit_price"] = uprice
            item_copy["price"] = uprice

            ltotal = item_copy.get("line_total")
            if ltotal is None:
                ltotal = item_copy.get("subtotal")
            if ltotal is None:
                ltotal = uprice * qty
            ltotal = float(ltotal)
            item_copy["line_total"] = ltotal
            item_copy["subtotal"] = ltotal

            normalized_items.append(item_copy)

        order["items"] = normalized_items

    if not order.get("total") and order.get("total_amount"):
        order["total"] = order["total_amount"]
    elif not order.get("total_amount") and order.get("total"):
        order["total_amount"] = order["total"]

    return order


def _sorted_orders(records):
    normalized = [_normalize_order(r) for r in records]
    return sorted(normalized, key=lambda record: record.get("created_at", ""), reverse=True)


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
    raw_business_id = request.business_id.strip()
    businesses_col = get_collection("businesses")
    business = (
        businesses_col.find_one({"id": raw_business_id}) or
        businesses_col.find_one({"slug": raw_business_id}) or
        businesses_col.find_one({"business_id": raw_business_id})
    )
    if not business and hasattr(businesses_col, "find"):
        try:
            raw_lower = raw_business_id.lower()
            for b in businesses_col.find():
                if (b.get("id") or "").lower() == raw_lower or (b.get("slug") or "").lower() == raw_lower:
                    business = b
                    break
        except Exception:
            pass

    if not business or (business.get("status") and str(business["status"]).upper() not in {"ACTIVE", "APPROVED"}):
        raise HTTPException(status_code=404, detail="Business not found or unavailable.")

    # Canonical internal business ID for products, tables, connections, and orders
    business_id = business["id"]

    cb_col = get_collection("customer_businesses")
    connection = cb_col.find_one({
        "customer_id": customer_id,
        "business_id": business_id,
        "status": "active",
    })
    if not connection:
        connection = cb_col.find_one({
            "customer_id": current_user.get("id"),
            "business_id": business_id,
            "status": "active",
        })
    if not connection:
        now_str = _now_iso()
        connection = {
            "id": f"cb_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "business_id": business_id,
            "source": "order",
            "status": "active",
            "created_at": now_str,
            "updated_at": now_str,
        }
        cb_col.insert_one(connection)

        # Also initialize loyalty account for this customer-store pair
        loyalty_col = get_collection("loyalty")
        if not loyalty_col.find_one({"customer_id": customer_id, "business_id": business_id}):
            loyalty_col.insert_one({
                "id": f"loyal_{uuid.uuid4().hex[:12]}",
                "customer_id": customer_id,
                "business_id": business_id,
                "points": 0,
                "stamps": 0,
                "tier": "BASIC",
                "created_at": now_str,
                "updated_at": now_str,
            })

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
    applied_discount = Decimal("0.00")
    applied_coupon_code = None
    coupon_rec = None
    coupon_col_name = None

    if request.coupon_code and request.coupon_code.strip():
        coupon_rec, applied_discount, applied_coupon_code, coupon_col_name = _validate_coupon_logic(
            business_id, request.coupon_code, subtotal, customer_id
        )

    discounted_subtotal = max(Decimal("0.00"), subtotal - applied_discount)
    tax = _money(discounted_subtotal * Decimal("0.05"))
    total = _money(discounted_subtotal + tax)

    table_name = request.table_number.strip() if request.table_number else None
    if request.table_id:
        tables_col = get_collection("tables")
        table = (
            tables_col.find_one({"id": request.table_id, "business_id": business_id}) or
            tables_col.find_one({"table_number": request.table_id, "business_id": business_id}) or
            tables_col.find_one({"name": request.table_id, "business_id": business_id})
        )
        if not table or (table.get("is_active") is False):
            raise HTTPException(status_code=400, detail="Selected table is not available for this business.")
        table_name = table.get("name") or table.get("table_number") or table_name

    fingerprint_data = {
        "business_id": business_id,
        "items": sorted((line["product_id"], line["quantity"]) for line in normalized_lines),
        "order_type": request.order_type,
        "table_id": request.table_id,
        "table_number": table_name,
        "payment_method": request.payment_method,
        "coupon_code": applied_coupon_code,
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True).encode("utf-8")).hexdigest()
    orders = get_collection("orders")
    prior = orders.find_one({"customer_id": customer_id, "idempotency_key": request.idempotency_key})
    if prior:
        if prior.get("request_fingerprint") != fingerprint:
            raise HTTPException(status_code=409, detail="This order attempt key was already used for a different order.")
        norm_prior = _normalize_order(dict(prior))
        if norm_prior.get("order_id"):
            norm_prior["id"] = norm_prior["order_id"]
        return norm_prior

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
        "discount": float(applied_discount),
        "coupon_code": applied_coupon_code,
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

    invoice_id = f"INV-{datetime.now(timezone.utc).year}-{uuid.uuid4().hex[:6].upper()}"
    order["invoice_id"] = invoice_id

    try:
        orders.insert_one(dict(order))
    except Exception:
        duplicate = orders.find_one({"customer_id": customer_id, "idempotency_key": request.idempotency_key})
        if duplicate and duplicate.get("request_fingerprint") == fingerprint:
            return duplicate
        raise

    if coupon_rec and coupon_col_name:
        try:
            col = get_collection(coupon_col_name)
            rec_id = coupon_rec.get("id") or coupon_rec.get("_id")
            if coupon_col_name == "customer_vouchers":
                col.update_one(
                    {"id": rec_id} if "id" in coupon_rec else {"_id": rec_id},
                    {"$set": {
                        "status": "REDEEMED",
                        "redeemed_at": now,
                        "used_at": now,
                        "order_id": order_id
                    }, "$inc": {"used_count": 1}}
                )
            else:
                inc_field = "used_count" if coupon_col_name == "coupons" else "total_claimed"
                col.update_one({"id": rec_id}, {"$inc": {inc_field: 1}})
            usage_col = get_collection("coupon_usage")
            usage_col.insert_one({
                "id": f"cu_{uuid.uuid4().hex[:12]}",
                "coupon_code": applied_coupon_code,
                "business_id": business_id,
                "customer_id": customer_id,
                "order_id": order_id,
                "discount_amount": float(applied_discount),
                "created_at": now,
            })
        except Exception:
            pass

    # Also persist corresponding invoice in invoices collection for unified billing / payment status
    invoices = get_collection("invoices")
    invoice_doc = {
        "id": invoice_id,
        "business_id": business_id,
        "store_id": business_id,
        "order_id": order_id,
        "customer_id": customer_id,
        "customer_name": order["customer_name"],
        "customer_phone": order["customer_phone"],
        "items": normalized_lines,
        "subtotal": float(subtotal),
        "tax_amount": float(tax),
        "tax": float(tax),
        "discount_amount": float(applied_discount),
        "discount": float(applied_discount),
        "total_amount": float(total),
        "total": float(total),
        "payment_status": "PENDING",
        "status": "issued",
        "payment_mode": request.payment_method,
        "order_type": request.order_type,
        "table_id": request.table_id,
        "table_number": table_name,
        "due_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_at": now,
        "updated_at": now,
    }
    try:
        invoices.insert_one(invoice_doc)
    except Exception:
        pass

    return order


@router.post("/coupons/validate")
@router.post("/orders/validate-coupon")
def validate_coupon_endpoint(req: CouponValidateRequest):
    enforce_rate_limit("coupon-validate", req.business_id + ":" + req.code, 60, 3600)
    subtotal_dec = Decimal(str(req.subtotal or 0))
    try:
        v, discount, code, _ = _validate_coupon_logic(req.business_id, req.code, subtotal_dec, req.customer_id or "")
        disc_subtotal = max(Decimal("0.00"), subtotal_dec - discount)
        tax = _money(disc_subtotal * Decimal("0.05"))
        new_total = _money(disc_subtotal + tax)
        return {
            "valid": True,
            "success": True,
            "code": code,
            "discount_type": v.get("discount_type", "PERCENTAGE"),
            "discount_value": float(v.get("discount_value", 0)),
            "discount_amount": float(discount),
            "new_subtotal": float(disc_subtotal),
            "tax": float(tax),
            "new_total": float(new_total),
            "offer": {
                "code": code,
                "title": v.get("title") or f"{code} Offer",
                "discount_type": v.get("discount_type", "PERCENTAGE"),
                "discount_value": float(v.get("discount_value", 0)),
                "discount_val": float(v.get("discount_value", 0)),
                "min_order": float(v.get("minimum_order") or v.get("min_spend") or v.get("minimum_order_value") or 0),
                "active": True
            }
        }
    except HTTPException as e:
        return {"valid": False, "success": False, "message": e.detail}


@router.get("/orders/my")
@router.get("/customer/orders")
def get_my_orders(
    business_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_role([ROLE_CUSTOMER]))
):
    customer_id, customer = _customer_identity(current_user)
    user_id = current_user.get("id")

    candidate_ids = list(filter(None, {
        customer_id,
        customer.get("id") if customer else None,
        customer.get("customer_id") if customer else None,
        user_id,
        current_user.get("id"),
        current_user.get("customer_id")
    }))

    orders_col = get_collection("orders")
    records = list(orders_col.find({"customer_id": {"$in": candidate_ids}}))
    user_orders = list(orders_col.find({"customer_user_id": user_id})) if user_id else []

    seen_ids = set()
    combined_orders = []
    for r in records + user_orders:
        oid = r.get("id") or r.get("order_id")
        if oid and oid not in seen_ids:
            seen_ids.add(oid)
            combined_orders.append(r)

    if business_id:
        clean_biz = business_id.strip()
        combined_orders = [r for r in combined_orders if r.get("business_id") == clean_biz]

    return _sorted_orders(combined_orders)



@router.get("/orders/{order_id}")
def get_my_order(order_id: str, current_user: dict = Depends(get_current_user)):
    orders = get_collection("orders")
    order = orders.find_one({"id": order_id}) or orders.find_one({"order_id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")

    role = (current_user.get("role") or "").upper()
    if role in [ROLE_BUSINESS_OWNER, ROLE_STAFF]:
        user_biz = _business_scope(current_user)
        if order.get("business_id") != user_biz:
            raise HTTPException(status_code=403, detail="Order access not allowed.")
    elif role == ROLE_CUSTOMER:
        customer_id, _ = _customer_identity(current_user)
        allowed_ids = {customer_id, current_user.get("id"), str(current_user.get("customer_id") or "")}
        if (
            order.get("customer_id") not in allowed_ids
            and order.get("customer_user_id") != current_user.get("id")
            and order.get("customer_phone") != current_user.get("phone")
        ):
            raise HTTPException(status_code=403, detail="Order access not allowed.")

    return _normalize_order(order)


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
        filtered = []
        for record in records:
            matched = (
                term in str(record.get("id", "")).casefold()
                or term in str(record.get("customer_name", "")).casefold()
                or term in str(record.get("customer_phone", "")).casefold()
            )
            if not matched:
                items = record.get("items") or []
                if isinstance(items, list):
                    for it in items:
                        if isinstance(it, dict) and term in str(it.get("name") or it.get("product_name") or "").casefold():
                            matched = True
                            break
            if matched:
                filtered.append(record)
        records = filtered
    return _sorted_orders(records)


@router.get("/business/orders/{order_id}")
def get_business_order(order_id: str, current_user: dict = Depends(require_role([ROLE_BUSINESS_OWNER, ROLE_STAFF]))):
    business_id = _business_scope(current_user)
    order = get_collection("orders").find_one({"id": order_id, "business_id": business_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return _normalize_order(order)


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
    updated = orders.find_one({"id": order_id, "business_id": business_id})
    return _normalize_order(updated)


@router.get("/admin/orders/summary")
def get_admin_order_summary(current_user: dict = Depends(require_role([ROLE_SUPER_ADMIN]))):
    records = get_collection("orders").find()
    return {
        "total_orders": len(records),
        "gross_merchandise_value": round(sum(
            float(record.get("total") or 0) for record in records if record.get("payment_status") == "PAID"
        ), 2),
    }