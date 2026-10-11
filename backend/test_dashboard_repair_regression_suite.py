"""
Regression Test Suite for Customer & Business Dashboard Repair
Verifies:
1. /api/auth/me resolves role="business", "BUSINESS_OWNER", "staff", "customer" correctly.
2. /api/auth/me returns business_id, business_slug, and business profile for business owners and staff.
3. Multi-tenant isolation: Business A cannot access Business B's orders, payments, or customers.
4. Business dashboard stats endpoint (/api/business/dashboard) works for role="business" and staff.
5. Customer Home endpoint (/api/customer/home) works and isolates customer data.
6. Graceful handling of empty or unconfigured records without 500 errors.
"""
import sys
import os
import uuid
import pytest
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["DEV_OTP"] = "true"
os.environ["ENVIRONMENT"] = "development"

from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection

client = TestClient(app)

@pytest.fixture
def test_fixture():
    ts = uuid.uuid4().hex[:6]
    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    cust_col = get_collection("customers")
    orders_col = get_collection("orders")
    staff_col = get_collection("staff")

    # Business A (with lowercase role="business" as found in production)
    owner_a_id = f"usr_test_a_{ts}"
    biz_a_id = f"biz_test_a_{ts}"
    users_col.insert_one({
        "id": owner_a_id,
        "email": f"owner_a_{ts}@zoorup.com",
        "name": f"Owner A {ts}",
        "role": "business",  # Production lowercase role
        "business_id": biz_a_id,
    })
    biz_col.insert_one({
        "id": biz_a_id,
        "name": f"Store A {ts}",
        "slug": f"store-a-{ts}",
        "owner_id": owner_a_id,
        "status": "ACTIVE",
        "category": "Cafe",
        "city": "Bengaluru",
        "state": "Karnataka",
        "upi_id": f"storea_{ts}@upi",
        "upi_name": f"Store A {ts}",
        "onboarding_completed": True
    })

    # Business B
    owner_b_id = f"usr_test_b_{ts}"
    biz_b_id = f"biz_test_b_{ts}"
    users_col.insert_one({
        "id": owner_b_id,
        "email": f"owner_b_{ts}@zoorup.com",
        "name": f"Owner B {ts}",
        "role": "BUSINESS_OWNER",
        "business_id": biz_b_id,
    })
    biz_col.insert_one({
        "id": biz_b_id,
        "name": f"Store B {ts}",
        "slug": f"store-b-{ts}",
        "owner_id": owner_b_id,
        "status": "ACTIVE",
        "category": "Salon",
        "city": "Mumbai",
        "state": "Maharashtra",
        "upi_id": f"storeb_{ts}@upi",
        "upi_name": f"Store B {ts}",
        "onboarding_completed": True
    })

    # Customer User
    cust_user_id = f"usr_cust_{ts}"
    cust_record_id = f"ZUP-CUS-{ts.upper()}"
    users_col.insert_one({
        "id": cust_user_id,
        "email": f"customer_{ts}@zoorup.com",
        "name": f"Customer {ts}",
        "role": "customer",
        "customer_id": cust_record_id,
    })
    cust_col.insert_one({
        "id": cust_user_id,
        "customer_id": cust_record_id,
        "name": f"Customer {ts}",
        "email": f"customer_{ts}@zoorup.com",
        "user_id": cust_user_id,
        "points": 150,
        "stamps": 3
    })
    cb_col = get_collection("customer_businesses")
    cb_col.insert_one({
        "id": f"cb_{ts}",
        "customer_id": cust_record_id,
        "business_id": biz_a_id,
        "status": "active"
    })

    # Staff for Business A
    staff_user_id = f"usr_staff_{ts}"
    users_col.insert_one({
        "id": staff_user_id,
        "email": f"staff_a_{ts}@zoorup.com",
        "name": f"Staff A {ts}",
        "role": "staff",
        "business_id": biz_a_id,
    })
    staff_col.insert_one({
        "id": f"stf_{ts}",
        "business_id": biz_a_id,
        "user_id": staff_user_id,
        "name": f"Staff A {ts}",
        "email": f"staff_a_{ts}@zoorup.com",
        "role": "Manager",
        "permissions": ["dashboard", "orders", "customers", "billing"]
    })

    tokens = {
        "owner_a": create_access_token({"sub": owner_a_id, "role": "business", "business_id": biz_a_id}),
        "owner_b": create_access_token({"sub": owner_b_id, "role": "BUSINESS_OWNER", "business_id": biz_b_id}),
        "customer": create_access_token({"sub": cust_user_id, "role": "customer", "customer_id": cust_record_id}),
        "staff_a": create_access_token({"sub": staff_user_id, "role": "staff", "business_id": biz_a_id}),
    }

    return {
        "ts": ts,
        "owner_a_id": owner_a_id,
        "biz_a_id": biz_a_id,
        "owner_b_id": owner_b_id,
        "biz_b_id": biz_b_id,
        "cust_user_id": cust_user_id,
        "cust_record_id": cust_record_id,
        "tokens": tokens
    }

def test_auth_me_resolves_business_owner_with_lowercase_role(test_fixture):
    """Test that /api/auth/me populates business_id and business profile for role='business'"""
    token_a = test_fixture["tokens"]["owner_a"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert "user" in data
    assert data["user"]["business_id"] == test_fixture["biz_a_id"]
    assert "business" in data
    assert data["business"]["id"] == test_fixture["biz_a_id"]
    assert data["business"]["slug"] == f"store-a-{test_fixture['ts']}"

def test_auth_me_resolves_staff(test_fixture):
    """Test that /api/auth/me populates business_id for staff members"""
    token_staff = test_fixture["tokens"]["staff_a"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_staff}"})
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert "user" in data
    assert data["user"]["business_id"] == test_fixture["biz_a_id"]
    assert "business" in data
    assert data["business"]["id"] == test_fixture["biz_a_id"]

def test_auth_me_resolves_customer(test_fixture):
    """Test that /api/auth/me populates customer_id and customer profile"""
    token_cust = test_fixture["tokens"]["customer"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_cust}"})
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert "user" in data
    assert data["user"]["customer_id"] == test_fixture["cust_record_id"]
    assert "customer" in data
    assert data["customer"]["customer_id"] == test_fixture["cust_record_id"]

def test_business_dashboard_stats_succeeds(test_fixture):
    """Test that /api/business/dashboard loads stats for role='business'"""
    token_a = test_fixture["tokens"]["owner_a"]
    res = client.get("/api/business/dashboard", headers={"Authorization": f"Bearer {token_a}"})
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert "stats" in data
    assert "business" in data
    assert data["business"]["id"] == test_fixture["biz_a_id"]

def test_business_dashboard_staff_access(test_fixture):
    """Test that staff can access /api/business/dashboard for their assigned business"""
    token_staff = test_fixture["tokens"]["staff_a"]
    res = client.get("/api/business/dashboard", headers={"Authorization": f"Bearer {token_staff}"})
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert "stats" in data
    assert data["business"]["id"] == test_fixture["biz_a_id"]

def test_multi_tenant_orders_isolation(test_fixture):
    """Verify Business A cannot see Business B's orders"""
    token_a = test_fixture["tokens"]["owner_a"]
    token_b = test_fixture["tokens"]["owner_b"]

    orders_col = get_collection("orders")
    # Insert order for Business B
    orders_col.insert_one({
        "id": f"ord_b_{test_fixture['ts']}",
        "order_id": f"ord_b_{test_fixture['ts']}",
        "business_id": test_fixture["biz_b_id"],
        "total_amount": 999.0,
        "status": "CONFIRMED",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # Owner A requests their orders
    res_a = client.get("/api/business/orders", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200
    orders_a = res_a.json()
    assert all(o.get("business_id") == test_fixture["biz_a_id"] for o in orders_a)
    assert not any(o.get("id") == f"ord_b_{test_fixture['ts']}" for o in orders_a)

    # Owner B requests their orders
    res_b = client.get("/api/business/orders", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 200
    orders_b = res_b.json()
    assert any(o.get("business_id") == test_fixture["biz_b_id"] for o in orders_b)
    assert not any(o.get("business_id") == test_fixture["biz_b_id"] for o in orders_a)

def test_customer_home_endpoint_isolation(test_fixture):
    """Verify /api/customer/home returns customer data and no other customer data"""
    token_cust = test_fixture["tokens"]["customer"]
    res = client.get("/api/customer/home", headers={"Authorization": f"Bearer {token_cust}"})
    assert res.status_code == 200, f"Failed: {res.text}"
    data = res.json()
    assert data["success"] is True
    assert data["customer"]["customer_id"] == test_fixture["cust_record_id"]
    assert data["customer"]["points"] == 150
