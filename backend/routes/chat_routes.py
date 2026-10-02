"""
ZOOR UP Chat Routes
Provides real-time conversation and message persistence in Supabase PostgreSQL.
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.database import get_collection
from backend.auth import get_current_user

router = APIRouter(tags=["Chat & Customer Messaging"])


class SendMessageRequest(BaseModel):
    business_id: Optional[str] = None
    customer_id: str
    sender_role: str = "business"  # "business" or "customer"
    sender_name: Optional[str] = "Store Manager"
    text: str


def _get_business_for_user(current_user: dict) -> dict:
    biz_col = get_collection("businesses")
    biz_id = current_user.get("business_id")
    if not biz_id:
        biz = biz_col.find_one({"owner_id": current_user["id"]})
        if biz:
            return biz
        raise HTTPException(status_code=404, detail="No business associated with this account.")
    biz = biz_col.find_one({"id": biz_id}) or biz_col.find_one({"owner_id": current_user["id"]})
    if not biz:
        raise HTTPException(status_code=404, detail="Business not found.")
    return biz


@router.get("/api/chat/conversations")
def get_conversations(current_user: dict = Depends(get_current_user)):
    biz = _get_business_for_user(current_user)
    biz_id = biz["id"]

    msg_col = get_collection("messages")
    cust_col = get_collection("customers")

    all_msgs = msg_col.find({"business_id": biz_id})
    all_msgs.sort(key=lambda m: str(m.get("timestamp") or m.get("created_at") or ""))

    customer_map = {}
    for m in all_msgs:
        c_id = m.get("customer_id")
        if not c_id:
            continue
        if c_id not in customer_map:
            cust = cust_col.find_one({"customer_id": c_id}) or cust_col.find_one({"id": c_id})
            customer_map[c_id] = {
                "customerId": c_id,
                "customerName": cust.get("name") if cust else "Customer",
                "customerAvatar": (cust.get("avatar") or cust.get("profile_image_url")) if cust else None,
                "lastMessage": m.get("text") or m.get("message") or "",
                "lastTimestamp": m.get("timestamp") or m.get("created_at"),
                "unreadCount": 1 if (not m.get("is_read") and m.get("sender_role") == "customer") else 0
            }
        else:
            customer_map[c_id]["lastMessage"] = m.get("text") or m.get("message") or ""
            customer_map[c_id]["lastTimestamp"] = m.get("timestamp") or m.get("created_at")
            if not m.get("is_read") and m.get("sender_role") == "customer":
                customer_map[c_id]["unreadCount"] += 1

    result = list(customer_map.values())
    result.sort(key=lambda x: str(x.get("lastTimestamp") or ""), reverse=True)
    return {"conversations": result}


@router.get("/api/chat/messages")
def get_messages(customer_id: str, business_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if not business_id:
        biz = _get_business_for_user(current_user)
        business_id = biz["id"]

    msg_col = get_collection("messages")
    msgs = msg_col.find({"business_id": business_id, "customer_id": customer_id})
    msgs.sort(key=lambda m: str(m.get("timestamp") or m.get("created_at") or ""))
    return {"messages": msgs}


@router.post("/api/chat/messages")
def send_message(req: SendMessageRequest, current_user: dict = Depends(get_current_user)):
    biz_id = req.business_id
    if not biz_id:
        biz = _get_business_for_user(current_user)
        biz_id = biz["id"]

    now_iso = datetime.now().isoformat()
    msg_id = str(uuid.uuid4())

    doc = {
        "id": msg_id,
        "business_id": biz_id,
        "customer_id": req.customer_id,
        "sender_role": req.sender_role,
        "sender_name": req.sender_name or "Store Manager",
        "text": req.text,
        "message": req.text,
        "timestamp": now_iso,
        "created_at": now_iso,
        "is_read": True
    }

    msg_col = get_collection("messages")
    msg_col.insert_one(doc)
    return {"success": True, "message": doc}
