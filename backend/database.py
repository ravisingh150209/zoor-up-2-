"""
ZOOR UP Database Layer
Supports MongoDB via PyMongo with in-memory persistence fallback
for resilient zero-configuration development and automated testing.
"""
import os
import json
from collections import defaultdict
from typing import Dict, List, Any, Optional
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()
MONGO_URI = os.getenv("MONGO_URI", "").strip()
DB_NAME = os.getenv("DB_NAME", "zoorup_db")

if ENVIRONMENT == "production":
    MONGO_URI = ""

# Resilient file-backed in-memory database fallback using defaultdict
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_FILE = os.path.join(DATA_DIR, "zoorup_db.json")

_memory_db: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

def _load_from_disk():
    global _memory_db
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                _memory_db = defaultdict(list, raw)
        except Exception as e:
            print(f"[DB] Failed to load local fallback data ({type(e).__name__}).")

def _save_to_disk():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        temp_file = DB_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(dict(_memory_db), f, indent=2, default=str)
        if os.path.exists(temp_file):
            if os.path.exists(DB_FILE):
                os.replace(temp_file, DB_FILE)
            else:
                os.rename(temp_file, DB_FILE)
    except Exception as e:
        print(f"[DB] Failed to save local fallback data ({type(e).__name__}).")

# Load existing data if available
_load_from_disk()


def reset_mock_db() -> None:
    """Clear the in-memory fallback database and persist a clean state."""
    global _memory_db
    _memory_db = defaultdict(list)
    try:
        if os.path.exists(DB_FILE):
            os.remove(DB_FILE)
        tmp_file = DB_FILE + ".tmp"
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
    except Exception:
        pass


def _match_val(doc_val: Any, target_val: Any) -> bool:
    if target_val is None:
        return doc_val is None
    if isinstance(target_val, dict):
        if "$gte" in target_val:
            return doc_val is not None and doc_val >= target_val["$gte"]
        if "$in" in target_val:
            return doc_val in target_val["$in"]
        if "$nin" in target_val:
            return doc_val not in target_val["$nin"]
        if "$ne" in target_val:
            return doc_val != target_val["$ne"]
        if "$regex" in target_val:
            import re
            flags = re.IGNORECASE if target_val.get("$options") == "i" else 0
            return bool(re.search(target_val["$regex"], str(doc_val or ""), flags))
    if isinstance(target_val, str) and isinstance(doc_val, str):
        if doc_val == target_val:
            return True
        return doc_val.strip().lower() == target_val.strip().lower()
    return doc_val == target_val

def _matches_filter(doc: Dict[str, Any], filter_dict: Dict[str, Any]) -> bool:
    if not filter_dict:
        return True
    
    if "$or" in filter_dict:
        or_conds = filter_dict["$or"]
        or_matched = False
        for cond in or_conds:
            if _matches_filter(doc, cond):
                or_matched = True
                break
        if not or_matched:
            return False
        # If there are additional conditions alongside $or
        other = {k: v for k, v in filter_dict.items() if k != "$or"}
        if other:
            return _matches_filter(doc, other)
        return True

    for k, v in filter_dict.items():
        if not _match_val(doc.get(k), v):
            return False
    return True

class MockCollection:
    def __init__(self, name: str):
        self.name = name

    def find_one(self, filter_dict: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        records = _memory_db.get(self.name, [])
        for doc in records:
            if _matches_filter(doc, filter_dict):
                return dict(doc)
        return None

    def find(self, filter_dict: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        records = _memory_db.get(self.name, [])
        if not filter_dict:
            return [dict(d) for d in records]
        result = []
        for doc in records:
            if _matches_filter(doc, filter_dict):
                result.append(dict(doc))
        return result

    def insert_one(self, doc: Dict[str, Any]):
        data = dict(doc)
        if "_id" not in data:
            data["_id"] = str(data.get("id") or f"{self.name}_{len(_memory_db[self.name]) + 1}_{datetime.now().timestamp()}")
        _memory_db[self.name].append(data)
        _save_to_disk()
        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id
        return InsertResult(data["_id"])

    def update_one(self, filter_dict: Dict[str, Any], update_dict: Dict[str, Any], upsert: bool = False):
        records = _memory_db.get(self.name, [])
        set_data = update_dict.get("$set", update_dict)
        for i, doc in enumerate(records):
            if _matches_filter(doc, filter_dict):
                records[i].update(set_data)
                for key, amount in update_dict.get("$inc", {}).items():
                    records[i][key] = records[i].get(key, 0) + amount
                _save_to_disk()
                return True
        if upsert:
            new_doc = {**filter_dict, **set_data}
            for key, amount in update_dict.get("$inc", {}).items():
                new_doc[key] = new_doc.get(key, 0) + amount
            self.insert_one(new_doc)
            return True
        return False

    def delete_one(self, filter_dict: Dict[str, Any]):
        records = _memory_db.get(self.name, [])
        for i, doc in enumerate(records):
            if _matches_filter(doc, filter_dict):
                records.pop(i)
                _save_to_disk()
                return True
        return False

    def delete_many(self, filter_dict: Dict[str, Any]):
        records = _memory_db.get(self.name, [])
        to_keep = []
        deleted = 0
        for doc in records:
            if not _matches_filter(doc, filter_dict):
                to_keep.append(doc)
            else:
                deleted += 1
        _memory_db[self.name] = to_keep
        _save_to_disk()
        return deleted

    def count_documents(self, filter_dict: Optional[Dict[str, Any]] = None) -> int:
        return len(self.find(filter_dict))

    def create_index(self, keys, unique=False):
        pass


class Database:
    def __init__(self):
        self.client = None
        self.db = None
        self.is_connected = False
        self._init_connection()

    def _init_connection(self):
        try:
            import pymongo
            client_options = {"serverSelectionTimeoutMS": 5000}
            if ENVIRONMENT == "production":
                client_options["tls"] = True
            self.client = pymongo.MongoClient(MONGO_URI or "mongodb://localhost:27017", **client_options)
            self.client.server_info()  # Will throw if mongo not available
            self.db = self.client[DB_NAME]
            self.is_connected = True
            self.create_indexes()
        except Exception as exc:
            self.is_connected = False
            self.db = None
            if ENVIRONMENT == "production":
                raise RuntimeError(f"Production MongoDB connection failed ({type(exc).__name__}).") from None

    def __getattr__(self, name: str):
        return self.get_collection(name)

    def get_collection(self, name: str):
        if self.is_connected and self.db is not None:
            return self.db[name]
        return MockCollection(name)

    def create_indexes(self):
        if not self.is_connected or self.db is None:
            return
        try:
            self.db.users.create_index("email", unique=True)
            self.db.users.create_index("phone")
            self.db.users.create_index("provider_user_id")
            self.db.businesses.create_index("owner_id")
            self.db.businesses.create_index("slug", unique=True, sparse=True)
            self.db.customers.create_index("customer_id", unique=True)
            self.db.customers.create_index("user_id")
            self.db.customers.create_index("phone")
            self.db.products.create_index("business_id")
            self.db.orders.create_index("business_id")
            self.db.orders.create_index("customer_id")
            self.db.orders.create_index([("customer_id", 1), ("created_at", -1)])
            self.db.orders.create_index([("business_id", 1), ("status", 1), ("created_at", -1)])
            self.db.orders.create_index("order_id", unique=True, sparse=True)
            self.db.orders.create_index(
                [("customer_id", 1), ("idempotency_key", 1)],
                unique=True,
                partialFilterExpression={"idempotency_key": {"$type": "string"}},
            )
            self.db.visits.create_index([("business_id", 1), ("customer_id", 1), ("timestamp", -1)])
            self.db.subscriptions.create_index("business_id")
            self.db.subscriptions.create_index("provider_subscription_id")
            self.db.payments.create_index("business_id")
            self.db.payments.create_index("provider_payment_id", unique=True)
            self.db.payments.create_index("verified_utr", unique=True, sparse=True)
            self.db.loyalty.create_index([("customer_id", 1), ("business_id", 1)], unique=True)
            self.db.loyalty.create_index("business_id")
            self.db.loyalty_transactions.create_index([("customer_id", 1), ("business_id", 1), ("reference_id", 1)], unique=False)
            self.db.loyalty_transactions.create_index("reference_id")
            self.db.vouchers.create_index([("business_id", 1), ("voucher_id", 1)])
            self.db.vouchers.create_index("business_id")
            self.db.vouchers.create_index("status")
            self.db.vouchers.create_index("expires_at")
            self.db.customer_vouchers.create_index([("customer_id", 1), ("voucher_id", 1)], unique=False)
            self.db.customer_vouchers.create_index("business_id")
            self.db.customer_vouchers.create_index("status")
            self.db.customer_vouchers.create_index("expires_at")
            self.db.table_reservations.create_index([("business_id", 1), ("date", 1)])
            self.db.table_reservations.create_index([("customer_id", 1), ("date", -1)])
            self.db.table_bookings.create_index([("business_id", 1), ("booking_date", 1)])
            self.db.table_bookings.create_index([("customer_id", 1), ("booking_date", -1)])
            self.db.notifications.create_index([("recipient_id", 1), ("created_at", -1)])
            self.db.push_tokens.create_index("user_id")
        except Exception as e:
            print(f"[DB] Index creation warning ({type(e).__name__}).")

        try:
            self.db.customer_businesses.create_index(
                [("customer_id", 1), ("business_id", 1)],
                unique=True,
            )
        except Exception as exc:
            if ENVIRONMENT == "production":
                raise RuntimeError(
                    "Could not enforce unique customer-business relationships. Resolve duplicate records and retry startup."
                ) from None
            print(f"[DB] Customer-business unique index warning ({type(exc).__name__}).")

from backend.supabase_database import SupabaseDatabase, supabase_configured

if ENVIRONMENT == "production" or supabase_configured():
    db_instance = SupabaseDatabase()
else:
    db_instance = Database()

def get_collection(name: str):
    return db_instance.get_collection(name)
