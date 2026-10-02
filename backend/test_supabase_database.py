"""Focused tests for the Supabase database adapter; live reads are opt-in."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

import backend.supabase_database as supabase_database_module
from backend.supabase_database import (
    SupabaseDatabase,
    UnsupportedSupabaseCollection,
    supabase_configured,
)


class FakeResponse:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class FakeQuery:
    def __init__(self, table, calls):
        self.table_name = table
        self.calls = calls

    def select(self, *args, **kwargs):
        self.calls.append((self.table_name, "select", args, kwargs))
        return self

    def limit(self, amount):
        self.calls.append((self.table_name, "limit", amount))
        return self

    def eq(self, field, value):
        self.calls.append((self.table_name, "eq", field, value))
        return self

    def execute(self):
        rows = {"profiles": [{"id": "profile-1"}], "stores": [{"id": "store-1", "business_name": "Test"}]}
        return FakeResponse(rows.get(self.table_name, []))


class FakeClient:
    def __init__(self):
        self.calls = []

    def table(self, name):
        return FakeQuery(name, self.calls)


class SupabaseDatabaseAdapterTests(unittest.TestCase):
    def test_config_detection_requires_both_backend_values(self):
        self.assertTrue(supabase_configured("https://project.supabase.co", "service-key"))
        self.assertFalse(supabase_configured("https://project.supabase.co", ""))

    def test_collection_resolution_uses_existing_store_table(self):
        client = FakeClient()
        database = SupabaseDatabase("https://project.supabase.co", "service-key", client=client)
        self.assertEqual(database.get_collection("businesses").table_name, "stores")
        with self.assertRaises(UnsupportedSupabaseCollection):
            database.get_collection("table_bookings")

    def test_read_uses_supabase_client_and_no_mongo_driver(self):
        client = FakeClient()
        with patch.dict(os.environ, {
            "SUPABASE_URL": "https://project.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "test-service-key",
        }):
            database = SupabaseDatabase(client=client)
            store = database.get_collection("businesses").find_one({"id": "store-1"})

        self.assertEqual(store["business_name"], "Test")
        self.assertEqual(client.calls[0][0], "profiles")
        self.assertEqual(client.calls[-1][0], "stores")
        adapter_source = Path(supabase_database_module.__file__).read_text(encoding="utf-8")
        self.assertNotIn("pymongo", adapter_source)

    @unittest.skipUnless(os.getenv("RUN_SUPABASE_READ_TEST") == "1", "requires rotated Supabase service key and explicit opt-in")
    def test_opt_in_live_supabase_read(self):
        database = SupabaseDatabase()
        self.assertTrue(database.get_collection("profiles").find(limit=1) is not None)


if __name__ == "__main__":
    unittest.main()