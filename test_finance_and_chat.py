import sys
import uuid
from fastapi.testclient import TestClient
from backend.main import app
from backend.auth import create_access_token
from backend.database import get_collection

client = TestClient(app)

def test_all():
    print("Testing Finance, Billing, Suppliers and Chat endpoints...")
    # 1. Setup a test business and user
    users_col = get_collection("users")
    biz_col = get_collection("businesses")
    
    biz_id = f"biz_test_{uuid.uuid4().hex[:8]}"
    owner_id = f"usr_{uuid.uuid4().hex[:8]}"
    
    users_col.insert_one({
        "id": owner_id,
        "email": f"{owner_id}@example.com",
        "role": "business",
        "business_id": biz_id
    })
    biz_col.insert_one({
        "id": biz_id,
        "name": "Finance & Chat Test Cafe",
        "owner_id": owner_id,
        "status": "ACTIVE"
    })
    
    token = create_access_token({"id": owner_id, "role": "business", "business_id": biz_id})
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Invoices Test
    print("\n--- Testing Invoices ---")
    create_inv_res = client.post("/api/billing/invoices", json={
        "customer_name": "Ravi Kumar",
        "customer_phone": "9876543210",
        "subtotal": 500.0,
        "taxRate": 5.0,
        "payment_status": "PENDING"
    }, headers=headers)
    assert create_inv_res.status_code == 200, f"Invoice creation failed: {create_inv_res.text}"
    inv_data = create_inv_res.json()
    assert inv_data["success"] is True
    inv_id = inv_data["invoice"]["id"]
    print(f"Created invoice: {inv_id}, total: {inv_data['invoice']['total_amount']}")
    
    list_inv_res = client.get("/api/billing/invoices", headers=headers)
    assert list_inv_res.status_code == 200
    invoices = list_inv_res.json()["invoices"]
    assert any(i["id"] == inv_id for i in invoices), "Created invoice not found in list"
    print("Invoices list successfully returned created invoice.")
    
    patch_inv_res = client.patch(f"/api/billing/invoices/{inv_id}/status", json={"status": "PAID"}, headers=headers)
    assert patch_inv_res.status_code == 200, f"Invoice status update failed: {patch_inv_res.text}"
    assert patch_inv_res.json()["invoice"]["payment_status"] == "PAID"
    print(f"Invoice {inv_id} status successfully updated to PAID.")
    
    # 3. Expenses Test
    print("\n--- Testing Expenses ---")
    exp_res = client.post("/api/finance/expenses", json={
        "category": "Supplies",
        "amount": 1250.50,
        "description": "Coffee beans & milk",
        "date": "2026-10-02"
    }, headers=headers)
    assert exp_res.status_code == 200, f"Expense creation failed: {exp_res.text}"
    exp_id = exp_res.json()["expense"]["id"]
    print(f"Created expense: {exp_id}")
    
    list_exp_res = client.get("/api/finance/expenses", headers=headers)
    assert list_exp_res.status_code == 200
    expenses = list_exp_res.json()["expenses"]
    assert any(e["id"] == exp_id for e in expenses), "Created expense not in list"
    print("Expenses list successfully returned created expense.")
    
    del_exp_res = client.delete(f"/api/finance/expenses/{exp_id}", headers=headers)
    assert del_exp_res.status_code == 200
    print(f"Expense {exp_id} successfully deleted.")
    
    # 4. Suppliers Test
    print("\n--- Testing Suppliers ---")
    sup_res = client.post("/api/finance/suppliers", json={
        "name": "Roast Masters Inc",
        "phone": "9988776655",
        "email": "beans@roastmasters.com",
        "products": "Dark Roast Arabica",
        "outstanding_payment": 5000.0
    }, headers=headers)
    assert sup_res.status_code == 200, f"Supplier creation failed: {sup_res.text}"
    sup_id = sup_res.json()["supplier"]["id"]
    print(f"Created supplier: {sup_id}")
    
    list_sup_res = client.get("/api/finance/suppliers", headers=headers)
    assert list_sup_res.status_code == 200
    suppliers = list_sup_res.json()["suppliers"]
    assert any(s["id"] == sup_id for s in suppliers), "Created supplier not in list"
    print("Suppliers list successfully returned created supplier.")
    
    del_sup_res = client.delete(f"/api/finance/suppliers/{sup_id}", headers=headers)
    assert del_sup_res.status_code == 200
    print(f"Supplier {sup_id} successfully deleted.")
    
    # 5. Chat Test
    print("\n--- Testing Chat & Messaging ---")
    cust_id = f"cus_{uuid.uuid4().hex[:8]}"
    send_msg_res = client.post("/api/chat/messages", json={
        "customer_id": cust_id,
        "sender_role": "business",
        "text": "Hello! Welcome to our store. How can we help?"
    }, headers=headers)
    assert send_msg_res.status_code == 200, f"Send message failed: {send_msg_res.text}"
    print(f"Message sent successfully: {send_msg_res.json()['message']['id']}")
    
    # Customer reply
    send_reply_res = client.post("/api/chat/messages", json={
        "customer_id": cust_id,
        "business_id": biz_id,
        "sender_role": "customer",
        "sender_name": "Customer Ravi",
        "text": "Do you have vegan options?"
    }, headers=headers)
    assert send_reply_res.status_code == 200
    print("Customer reply sent successfully.")
    
    get_msgs_res = client.get(f"/api/chat/messages?customer_id={cust_id}", headers=headers)
    assert get_msgs_res.status_code == 200
    msgs = get_msgs_res.json()["messages"]
    assert len(msgs) == 2, f"Expected 2 messages, got {len(msgs)}"
    print(f"Retrieved {len(msgs)} messages successfully.")
    
    convs_res = client.get("/api/chat/conversations", headers=headers)
    assert convs_res.status_code == 200
    convs = convs_res.json()["conversations"]
    assert any(c["customerId"] == cust_id for c in convs), "Conversation with customer not found"
    print("Conversations list returned active conversation.")
    
    print("\n>>> ALL FINANCE, BILLING, SUPPLIERS AND CHAT TESTS PASSED! <<<")

if __name__ == "__main__":
    test_all()
