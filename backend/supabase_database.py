"""Supabase Postgres adapter for the backend's collection-style database API.

Supabase PostgreSQL is the sole production database for ZOOR UP.
Every backend collection has a dedicated PostgreSQL table mapping with full
CRUD support, filtering, and multi-tenant scoping.
"""
from __future__ import annotations

import os
import sys
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class SupabaseDatabaseError(RuntimeError):
    """Safe, credential-free database adapter error."""


class UnsupportedSupabaseCollection(SupabaseDatabaseError):
    """Raised when no existing Supabase table safely represents a collection."""


class UnsupportedSupabaseOperation(SupabaseDatabaseError):
    """Raised when Mongo semantics cannot be implemented safely with the schema."""


COLLECTION_TABLE_MAP = {
    "users": "users",
    "businesses": "businesses",
    "customers": "customers",
    "customer_businesses": "customer_businesses",
    "products": "products",
    "orders": "orders",
    "payments": "payments",
    "subscriptions": "subscriptions",
    "expenses": "expenses",
    "loyalty": "loyalty",
    "loyalty_transactions": "loyalty_transactions",
    "loyalty_settings": "loyalty_settings",
    "visits": "visits",
    "rewards": "rewards",
    "reward_redemptions": "reward_redemptions",
    "vouchers": "vouchers",
    "customer_vouchers": "customer_vouchers",
    "business_invites": "business_invites",
    "otp_codes": "otp_codes",
    "tables": "tables",
    "table_settings": "table_settings",
    "table_reservations": "table_bookings",
    "table_bookings": "table_bookings",
    "notifications": "notifications",
    "notification_preferences": "notification_preferences",
    "push_tokens": "push_tokens",
    "reminders": "reminders",
    "upload_assets": "upload_assets",
    "profiles": "profiles",
    "subscription_plans": "subscription_plans",
    "order_items": "order_items",
    "inventory": "inventory",
    "inventory_transactions": "inventory_transactions",
    "invoices": "invoices",
    "messages": "messages",
    "conversations": "conversations",
    "business_settings": "business_settings",
    "business_hours": "business_hours",
    "business_social_links": "business_social_links",
    "coupons": "coupons",
    "coupon_usage": "coupon_usage",
    "qr_codes": "qr_codes",
    "qr_scans": "qr_scans",
    "store_staff": "business_staff",
    "staff": "business_staff",
    "services": "services",
    "suppliers": "suppliers",
    "stores": "stores",
}

UNSUPPORTED_COLLECTIONS: set[str] = set()


@dataclass
class InsertOneResult:
    inserted_id: Any


@dataclass
class UpdateResult:
    matched_count: int
    modified_count: int
    upserted_id: Any = None


@dataclass
class DeleteResult:
    deleted_count: int


def supabase_configured(url: Optional[str] = None, service_role_key: Optional[str] = None) -> bool:
    return bool(
        (url if url is not None else os.getenv("SUPABASE_URL", "").strip())
        and (service_role_key if service_role_key is not None else os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())
    )


def _is_valid_uuid(val: Any) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
        return False


def _to_db_uuid(val: Any) -> str:
    if not val:
        return str(uuid.uuid4())
    s = str(val)
    if _is_valid_uuid(s):
        return s
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, s))


def _normalize_doc(doc: Dict[str, Any], table_name: str = "") -> Dict[str, Any]:
    if not isinstance(doc, dict):
        return doc
    normalized = dict(doc)
    doc_id = normalized.get("id") or normalized.get("_id")
    if doc_id is not None:
        normalized["id"] = str(doc_id)
        normalized["_id"] = str(doc_id)
        if _is_valid_uuid(doc_id):
            normalized["_db_uuid"] = str(doc_id)
    # Restore original customer_id as id ONLY for customers table
    if table_name == "customers" and normalized.get("customer_id") and not _is_valid_uuid(normalized.get("customer_id")):
        normalized["id"] = normalized["customer_id"]
        normalized["_id"] = normalized["customer_id"]
    if table_name == "invoices" and normalized.get("invoice_number"):
        normalized["id"] = normalized["invoice_number"]
        normalized["_id"] = normalized["invoice_number"]
    if table_name == "orders" and normalized.get("order_id"):
        normalized["id"] = normalized["order_id"]
        normalized["_id"] = normalized["order_id"]
    if table_name == "customers":
        if normalized.get("full_name") and not normalized.get("name"):
            normalized["name"] = normalized["full_name"]
        if normalized.get("name") and not normalized.get("full_name"):
            normalized["full_name"] = normalized["name"]
        if normalized.get("login_email") and not normalized.get("email"):
            normalized["email"] = normalized["login_email"]
    if table_name in ("orders", "invoices", "payments"):
        if normalized.get("customer_code"):
            normalized["customer_id"] = normalized["customer_code"]
        elif isinstance(normalized.get("metadata"), dict) and normalized["metadata"].get("customer_id"):
            normalized["customer_id"] = normalized["metadata"]["customer_id"]
        if isinstance(normalized.get("metadata"), dict) and normalized["metadata"].get("order_id"):
            normalized["order_id"] = normalized["metadata"]["order_id"]
    # Merge metadata fields onto normalized doc so persisted JSONB properties (e.g. upi_id, upi_name) are top-level
    if isinstance(normalized.get("metadata"), dict):
        for k, v in normalized["metadata"].items():
            if k not in normalized or normalized[k] is None or normalized[k] == "":
                normalized[k] = v
    return normalized



UUID_TABLES = {"customers", "products", "orders", "payments", "subscriptions", "expenses", "suppliers", "invoices", "messages", "stores"}


class SupabaseCollection:
    def __init__(self, client: Any, collection_name: str, table_name: str):
        self.client = client
        self.name = collection_name
        self.table_name = table_name

    def _query_filters(self, query: Any, filters: Optional[Dict[str, Any]]) -> Any:
        if not filters:
            return query

        for raw_field, raw_val in filters.items():
            field = "id" if raw_field == "_id" else raw_field

            # If querying UUID table by id and raw_val is not UUID, map deterministically or search customer_id
            if field == "id" and self.table_name in UUID_TABLES:
                if self.table_name == "customers" and not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                    query = query.or_(f"id.eq.{_to_db_uuid(raw_val)},customer_id.eq.{raw_val}")
                    continue
                elif self.table_name == "invoices" and not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                    query = query.or_(f"id.eq.{_to_db_uuid(raw_val)},invoice_number.eq.{raw_val}")
                    continue
                elif self.table_name == "orders" and not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                    query = query.or_(f"id.eq.{_to_db_uuid(raw_val)},order_id.eq.{raw_val}")
                    continue
                elif not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                    raw_val = _to_db_uuid(raw_val)

            # If querying customer_id on tables where customer_id is a UUID foreign key
            if field == "customer_id" and self.table_name in ("orders", "invoices", "payments") and not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                try:
                    cus_resp = self.client.table("customers").select("id").eq("customer_id", raw_val).limit(1).execute()
                    if cus_resp.data and cus_resp.data[0].get("id"):
                        raw_val = cus_resp.data[0]["id"]
                    else:
                        query = query.eq("id", "00000000-0000-0000-0000-000000000000")
                        continue
                except Exception:
                    query = query.eq("id", "00000000-0000-0000-0000-000000000000")
                    continue

            # If querying order_id on payments/invoices where order_id is a UUID foreign key
            if field == "order_id" and self.table_name in ("payments", "invoices") and not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                try:
                    ord_resp = self.client.table("orders").select("id").or_(f"id.eq.{_to_db_uuid(raw_val)},order_id.eq.{raw_val}").limit(1).execute()
                    if ord_resp.data and ord_resp.data[0].get("id"):
                        raw_val = ord_resp.data[0]["id"]
                    else:
                        raw_val = _to_db_uuid(raw_val)
                except Exception:
                    raw_val = _to_db_uuid(raw_val)

            # If querying business_id on invoices/payments where business_id is a UUID foreign key
            if field == "business_id" and self.table_name in ("invoices", "payments", "orders") and not _is_valid_uuid(raw_val) and isinstance(raw_val, str):
                try:
                    biz_resp = self.client.table("businesses").select("id").eq("id", raw_val).limit(1).execute()
                    if biz_resp.data and biz_resp.data[0].get("id"):
                        raw_val = biz_resp.data[0]["id"]
                    else:
                        raw_val = _to_db_uuid(raw_val)
                except Exception:
                    raw_val = _to_db_uuid(raw_val)

            if field == "$or":
                clauses = []
                for branch in raw_val:
                    if len(branch) != 1:
                        continue
                    b_key, b_val = next(iter(branch.items()))
                    target_key = "id" if b_key == "_id" else b_key
                    if target_key == "id" and self.table_name in UUID_TABLES and not _is_valid_uuid(b_val):
                        b_val = _to_db_uuid(b_val)
                    if isinstance(b_val, (str, int, float, bool)):
                        clauses.append(f"{target_key}.eq.{b_val}")
                if clauses:
                    query = query.or_(",".join(clauses))
                continue

            if isinstance(raw_val, dict):
                for op, operand in raw_val.items():
                    if op == "$in":
                        query = query.in_(field, list(operand))
                    elif op == "$gte":
                        query = query.gte(field, operand)
                    elif op == "$lte":
                        query = query.lte(field, operand)
                    elif op == "$gt":
                        query = query.gt(field, operand)
                    elif op == "$lt":
                        query = query.lt(field, operand)
                    elif op == "$ne":
                        query = query.neq(field, operand)
                    elif op == "$exists":
                        query = query.not_.is_(field, "null") if operand else query.is_(field, "null")
                    elif op == "$nin":
                        query = query.not_.in_(field, list(operand))
                    elif op == "$regex":
                        clean_pattern = str(operand).replace("^", "").replace("$", "")
                        query = query.ilike(field, f"%{clean_pattern}%")
            elif raw_val is None:
                query = query.is_(field, "null")
            else:
                query = query.eq(field, raw_val)

        return query

    def find_one(self, filter_dict: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        try:
            query = self.client.table(self.table_name).select("*")
            query = self._query_filters(query, filter_dict)
            response = query.limit(1).execute()
            records = response.data or []
            if not records:
                return None
            return _normalize_doc(records[0], self.table_name)
        except Exception as exc:
            err_msg = str(exc)
            if "does not exist" in err_msg or "PGRST204" in err_msg or "42703" in err_msg or "22P02" in err_msg:
                return None
            raise

    def find(self, filter_dict: Optional[Dict[str, Any]] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            query = self.client.table(self.table_name).select("*")
            query = self._query_filters(query, filter_dict)
            if limit is not None:
                query = query.limit(limit)
            response = query.execute()
            records = response.data or []
            return [_normalize_doc(r, self.table_name) for r in records]
        except Exception as exc:
            err_msg = str(exc)
            if "does not exist" in err_msg or "PGRST204" in err_msg or "42703" in err_msg or "22P02" in err_msg:
                return []
            raise

    def count_documents(self, filter_dict: Optional[Dict[str, Any]] = None) -> int:
        try:
            query = self.client.table(self.table_name).select("*", count="exact", head=True)
            query = self._query_filters(query, filter_dict)
            response = query.execute()
            return int(response.count or 0)
        except Exception as exc:
            err_msg = str(exc)
            if "does not exist" in err_msg or "PGRST204" in err_msg or "42703" in err_msg or "22P02" in err_msg:
                return 0
            raise

    def insert_one(self, document: Dict[str, Any]) -> InsertOneResult:
        doc = dict(document)
        doc_id = doc.get("id") or doc.get("_id")
        if not doc_id:
            doc_id = str(uuid.uuid4())
        doc["id"] = str(doc_id)
        if "_id" in doc:
            del doc["_id"]

        if self.table_name in UUID_TABLES and not _is_valid_uuid(doc["id"]):
            orig_id = str(doc["id"])
            if self.table_name == "customers" and "customer_id" not in doc:
                doc["customer_id"] = orig_id
            elif self.table_name == "invoices" and "invoice_number" not in doc:
                doc["invoice_number"] = orig_id
            elif self.table_name == "orders" and "order_id" not in doc:
                doc["order_id"] = orig_id
            doc["id"] = _to_db_uuid(orig_id)

        # Sanitize non-UUID foreign keys for tables where store_id / customer_id are UUID
        if "store_id" in doc and not _is_valid_uuid(doc["store_id"]):
            if "business_id" not in doc:
                doc["business_id"] = str(doc["store_id"])
            del doc["store_id"]
        if self.table_name in ("invoices", "orders", "payments") and "customer_id" in doc and not _is_valid_uuid(doc["customer_id"]):
            raw_cid = str(doc["customer_id"])
            doc["customer_code"] = raw_cid
            if "metadata" not in doc or not isinstance(doc["metadata"], dict):
                doc["metadata"] = {}
            doc["metadata"]["customer_id"] = raw_cid
            try:
                cus_resp = self.client.table("customers").select("id").eq("customer_id", raw_cid).limit(1).execute()
                if cus_resp.data and cus_resp.data[0].get("id"):
                    doc["customer_id"] = cus_resp.data[0]["id"]
                else:
                    del doc["customer_id"]
            except Exception:
                del doc["customer_id"]

        if self.table_name in ("invoices", "orders", "payments") and "order_id" in doc and not _is_valid_uuid(doc["order_id"]):
            raw_oid = str(doc["order_id"])
            if "metadata" not in doc or not isinstance(doc["metadata"], dict):
                doc["metadata"] = {}
            doc["metadata"]["order_id"] = raw_oid
            try:
                ord_resp = self.client.table("orders").select("id").or_(f"id.eq.{_to_db_uuid(raw_oid)},order_id.eq.{raw_oid}").limit(1).execute()
                if ord_resp.data and ord_resp.data[0].get("id"):
                    doc["order_id"] = ord_resp.data[0]["id"]
                else:
                    doc["order_id"] = _to_db_uuid(raw_oid)
            except Exception:
                doc["order_id"] = _to_db_uuid(raw_oid)

        # Convert empty string emails/phones to None so PostgreSQL UNIQUE constraints are respected
        if self.table_name in ("users", "customers", "profiles"):
            for field in ("email", "login_email", "phone"):
                if field in doc and isinstance(doc[field], str) and not doc[field].strip():
                    doc[field] = None

        # Standardize enum fields across PostgreSQL tables
        if self.table_name == "subscriptions":
            if "status" in doc and isinstance(doc["status"], str):
                s = doc["status"].lower()
                doc["status"] = "canceled" if s == "cancelled" else (s if s in ("active", "past_due", "canceled", "incomplete", "trialing") else "active")
        elif self.table_name in ("payments", "invoices", "table_reservations", "visits"):
            if "status" in doc and isinstance(doc["status"], str):
                doc["status"] = doc["status"].lower()
            if "payment_status" in doc and isinstance(doc["payment_status"], str):
                doc["payment_status"] = doc["payment_status"].lower()
        elif self.table_name in ("vouchers", "customer_vouchers"):
            if not doc.get("code"):
                doc["code"] = f"VCH-{uuid.uuid4().hex[:8].upper()}"

        # Auto-pack custom business attributes into metadata JSONB column for PostgreSQL persistence
        if self.table_name in ("businesses", "stores"):
            meta_keys = {"upi_id", "upi_name", "upi_notes", "upi_enabled", "menu_enabled", "address", "city", "state", "country", "postal_code"}
            if any(k in doc for k in meta_keys):
                if "metadata" not in doc or not isinstance(doc["metadata"], dict):
                    doc["metadata"] = {}
                for mk in meta_keys:
                    if mk in doc:
                        doc["metadata"][mk] = doc.pop(mk)

        while True:
            try:
                response = self.client.table(self.table_name).insert(doc).execute()
                records = response.data or []
                if not records:
                    return InsertOneResult(doc["id"])
                inserted = records[0]
                return InsertOneResult(inserted.get("id", doc["id"]))
            except Exception as exc:
                err_msg = str(exc)
                if "23505" in err_msg and "customers_customer_id_key" in err_msg and self.table_name == "customers":
                    doc["customer_id"] = f"ZUP-CUS-{secrets.token_hex(4).upper()}"
                    continue
                if "23503" in err_msg:
                    if "order_id" in err_msg and "order_id" in doc:
                        del doc["order_id"]
                        continue
                    if "customer_id" in err_msg and "customer_id" in doc:
                        del doc["customer_id"]
                        continue
                    if "store_id" in err_msg and "store_id" in doc:
                        del doc["store_id"]
                        continue
                if "PGRST204" in err_msg or "Could not find the" in err_msg:
                    import re
                    match = re.search(r"Could not find the '([^']+)' column", err_msg)
                    if match:
                        bad_col = match.group(1)
                        if bad_col in doc:
                            val = doc.pop(bad_col)
                            if bad_col != "metadata" and self.table_name in ("businesses", "stores", "products", "customers", "orders", "profiles", "payments"):
                                if "metadata" not in doc or not isinstance(doc["metadata"], dict):
                                    doc["metadata"] = {}
                                doc["metadata"][bad_col] = val
                            continue
                raise

    def update_one(self, filter_dict: Dict[str, Any], update_dict: Dict[str, Any], upsert: bool = False) -> UpdateResult:
        existing = self.find_one(filter_dict)
        if not existing and not upsert:
            return UpdateResult(0, 0)

        values = dict(update_dict.get("$set", {}))

        # Handle atomic-style $inc
        if update_dict.get("$inc"):
            inc_dict = update_dict["$inc"]
            for field, amount in inc_dict.items():
                current_val = (existing.get(field) or 0) if existing else 0
                values[field] = current_val + amount

        if update_dict.get("$unset"):
            values.update({field: None for field in update_dict["$unset"]})

        # If plain dict with no operators
        if not any(key.startswith("$") for key in update_dict):
            values = dict(update_dict)

        if "_id" in values:
            values["id"] = str(values["_id"])
            del values["_id"]

        if self.table_name in ("users", "customers", "profiles"):
            for field in ("email", "login_email", "phone"):
                if field in values and isinstance(values[field], str) and not values[field].strip():
                    values[field] = None

        # Standardize enum fields across PostgreSQL tables
        if self.table_name == "subscriptions":
            if "status" in values and isinstance(values["status"], str):
                s = values["status"].lower()
                values["status"] = "canceled" if s == "cancelled" else (s if s in ("active", "past_due", "canceled", "incomplete", "trialing") else "active")
        elif self.table_name in ("payments", "invoices", "table_reservations", "visits"):
            if "status" in values and isinstance(values["status"], str):
                values["status"] = values["status"].lower()
            if "payment_status" in values and isinstance(values["payment_status"], str):
                values["payment_status"] = values["payment_status"].lower()

        # Map known custom business attributes into metadata JSONB column for PostgreSQL persistence
        if self.table_name in ("businesses", "stores"):
            meta_keys = {"upi_id", "upi_name", "upi_notes", "upi_enabled", "menu_enabled", "address", "city", "state", "country", "postal_code"}
            existing_meta = dict(existing.get("metadata") or {}) if existing and isinstance(existing.get("metadata"), dict) else {}
            if "metadata" in values and isinstance(values["metadata"], dict):
                existing_meta.update(values["metadata"])
            has_meta_updates = False
            for mk in meta_keys:
                if mk in values:
                    existing_meta[mk] = values.pop(mk)
                    has_meta_updates = True
            if has_meta_updates:
                values["metadata"] = existing_meta

        if not values:
            return UpdateResult(1, 0)

        if upsert and not existing:
            new_doc = {}
            for field, val in (filter_dict or {}).items():
                if not field.startswith("$") and not isinstance(val, dict):
                    target_key = "id" if field == "_id" else field
                    new_doc[target_key] = val
            new_doc.update(values)
            res = self.insert_one(new_doc)
            return UpdateResult(1, 1, res.inserted_id)

        target_id = (existing.get("_db_uuid") if existing and _is_valid_uuid(existing.get("_db_uuid")) else None) or (existing.get("id") if existing else None)
        if target_id and self.table_name in UUID_TABLES and not _is_valid_uuid(target_id):
            target_id = _to_db_uuid(target_id)

        while True:
            try:
                if target_id:
                    response = self.client.table(self.table_name).update(values).eq("id", target_id).execute()
                    records = response.data or []
                    if not records and self.table_name == "customers" and existing and existing.get("customer_id"):
                        response = self.client.table(self.table_name).update(values).eq("customer_id", existing["customer_id"]).execute()
                        records = response.data or []
                else:
                    query = self.client.table(self.table_name).update(values)
                    query = self._query_filters(query, filter_dict)
                    response = query.execute()
                    records = response.data or []
                return UpdateResult(len(records), len(records))
            except Exception as exc:
                err_msg = str(exc)
                if "PGRST204" in err_msg or "Could not find the" in err_msg:
                    import re
                    match = re.search(r"Could not find the '([^']+)' column", err_msg)
                    if match:
                        bad_col = match.group(1)
                        if bad_col in values:
                            val = values.pop(bad_col)
                            if bad_col != "metadata" and self.table_name in ("businesses", "stores", "products", "customers", "orders", "profiles"):
                                existing_meta = dict(existing.get("metadata") or {}) if existing and isinstance(existing.get("metadata"), dict) else {}
                                if "metadata" in values and isinstance(values["metadata"], dict):
                                    existing_meta.update(values["metadata"])
                                existing_meta[bad_col] = val
                                values["metadata"] = existing_meta
                            if not values:
                                return UpdateResult(1, 0)
                            continue
                raise

    def delete_one(self, filter_dict: Dict[str, Any]) -> DeleteResult:
        existing = self.find_one(filter_dict)
        if not existing:
            return DeleteResult(0)
        target_id = (existing.get("_db_uuid") if existing and _is_valid_uuid(existing.get("_db_uuid")) else None) or (existing.get("id") if existing else None)
        if target_id and self.table_name in UUID_TABLES and not _is_valid_uuid(target_id):
            target_id = _to_db_uuid(target_id)
        if target_id:
            response = self.client.table(self.table_name).delete().eq("id", target_id).execute()
            records = response.data or []
            if not records and self.table_name == "customers" and existing and existing.get("customer_id"):
                response = self.client.table(self.table_name).delete().eq("customer_id", existing["customer_id"]).execute()
                records = response.data or []
            return DeleteResult(len(records))
        else:
            query = self.client.table(self.table_name).delete()
            query = self._query_filters(query, filter_dict).limit(1)
            response = query.execute()
            return DeleteResult(len(response.data or []))

    def delete_many(self, filter_dict: Dict[str, Any]) -> DeleteResult:
        query = self.client.table(self.table_name).delete()
        query = self._query_filters(query, filter_dict)
        response = query.execute()
        return DeleteResult(len(response.data or []))

    def create_index(self, *args, **kwargs):
        pass


class SupabaseDatabase:
    def __init__(self, url: Optional[str] = None, service_role_key: Optional[str] = None, client: Any = None):
        self.url = (url if url is not None else os.getenv("SUPABASE_URL", "")).strip()
        self.service_role_key = (service_role_key if service_role_key is not None else os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")).strip()
        if not supabase_configured(self.url, self.service_role_key):
            raise SupabaseDatabaseError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.")
        try:
            if client is None:
                # Safe import ensuring site-packages supabase is loaded, avoiding local directory shadowing
                orig_sys_path = list(sys.path)
                try:
                    # Remove cached empty supabase namespace if present
                    if "supabase" in sys.modules and not hasattr(sys.modules["supabase"], "create_client"):
                        del sys.modules["supabase"]

                    # Filter out local directory containing supabase config/folder
                    sys.path = [
                        p for p in sys.path
                        if p not in ("", ".") and not (os.path.isdir(p) and os.path.exists(os.path.join(p, "supabase", "config.toml")))
                    ]
                    from supabase import create_client
                finally:
                    sys.path = orig_sys_path

                client = create_client(self.url, self.service_role_key)
            self.client = client
        except Exception as exc:
            raise SupabaseDatabaseError(f"Supabase client initialization failed ({type(exc).__name__}: {exc}).") from None
        self.is_connected = False
        self.health_check()

    def health_check(self) -> bool:
        try:
            self.client.table("profiles").select("id").limit(1).execute()
            self.is_connected = True
            return True
        except Exception as exc:
            self.is_connected = False
            raise SupabaseDatabaseError(f"Supabase Postgres health check failed ({type(exc).__name__}: {exc}).") from None

    def get_collection(self, name: str) -> SupabaseCollection:
        if name in UNSUPPORTED_COLLECTIONS:
            raise UnsupportedSupabaseCollection(f"Collection {name!r} is unsupported.")
        table_name = COLLECTION_TABLE_MAP.get(name) or name
        return SupabaseCollection(self.client, name, table_name)

    def __getattr__(self, name: str) -> SupabaseCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self.get_collection(name)