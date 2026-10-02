"""
ZOOR UP Notification and Automatic Reminder Routes
Provides server-controlled, tenant-isolated in-app and real Expo push notifications
and idempotent automated scheduling for table bookings, rewards, win-back reminders, and daily summaries.
"""
import os
import json
import uuid
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status, Depends
from backend.models import ROLE_BUSINESS_OWNER, ROLE_CUSTOMER, ROLE_SUPER_ADMIN
from backend.database import get_collection
from backend.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications & Reminders"])

# ==============================================================================
# PUSH NOTIFICATION PAYLOAD SCHEMAS
# ==============================================================================
class RegisterDevicePayload(BaseModel):
    expo_push_token: str
    platform: Optional[str] = "android" # "android" | "ios" | "web"
    device_id: Optional[str] = None

class UnregisterDevicePayload(BaseModel):
    expo_push_token: Optional[str] = None
    device_id: Optional[str] = None

class NotificationPreferencesPayload(BaseModel):
    all: Optional[bool] = True
    daily_updates: Optional[bool] = True
    daily_summary: Optional[bool] = True
    offers_rewards: Optional[bool] = True
    orders: Optional[bool] = True
    bookings: Optional[bool] = True
    appointments: Optional[bool] = True
    customers: Optional[bool] = True
    inventory: Optional[bool] = True
    payments: Optional[bool] = True
    subscription: Optional[bool] = True
    marketing: Optional[bool] = False

class SendTestNotificationPayload(BaseModel):
    title: Optional[str] = "ZOOR UP Test Notification"
    body: Optional[str] = "Testing real push notifications on your device!"
    data: Optional[Dict[str, Any]] = None

# ==============================================================================
# REAL EXPO PUSH DISPATCHER
# ==============================================================================
def dispatch_expo_push_notifications(
    recipient_id: str,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    channel_id: str = "default"
) -> Dict[str, Any]:
    """
    Sends real push notifications to all active registered devices for recipient_id
    using the official Expo Push Notification service.
    Automatically deactivates tokens that are reported as DeviceNotRegistered.
    """
    tokens_col = get_collection("push_tokens")
    if not recipient_id:
        return {"dispatched": 0, "status": "NO_RECIPIENT"}

    active_tokens = tokens_col.find({
        "is_active": True,
        "$or": [
            {"user_id": recipient_id},
            {"customer_id": recipient_id},
            {"business_id": recipient_id},
            {"recipient_id": recipient_id}
        ]
    })

    if not active_tokens:
        return {"dispatched": 0, "status": "NO_ACTIVE_TOKENS"}

    messages = []
    token_records = []
    for t in active_tokens:
        token_str = t.get("expo_push_token")
        if token_str and ("ExponentPushToken[" in token_str or "ExpoPushToken[" in token_str):
            messages.append({
                "to": token_str,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "channelId": channel_id
            })
            token_records.append(t)

    if not messages:
        return {"dispatched": 0, "status": "NO_VALID_TOKENS"}

    dispatched_count = 0
    try:
        req_data = json.dumps(messages).encode("utf-8")
        req = urllib.request.Request(
            "https://exp.host/--/api/v2/push/send",
            data=req_data,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Accept-Encoding": "gzip, deflate"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                resp_json = json.loads(resp.read().decode("utf-8"))
                receipts = resp_json.get("data", [])
                for idx, ticket in enumerate(receipts):
                    if ticket.get("status") == "ok":
                        dispatched_count += 1
                    elif ticket.get("status") == "error":
                        err_code = ticket.get("details", {}).get("error")
                        if err_code == "DeviceNotRegistered" and idx < len(token_records):
                            # Mark token inactive
                            bad_token = token_records[idx]["id"]
                            tokens_col.update_one({"id": bad_token}, {"$set": {"is_active": False, "updated_at": datetime.utcnow().isoformat() + "Z"}})
                return {"dispatched": dispatched_count, "total": len(messages), "status": "SENT"}
    except Exception as e:
        return {"dispatched": 0, "error": "Push provider request failed.", "status": "FAILED"}

    return {"dispatched": dispatched_count, "status": "PARTIAL"}


def dispatch_external_sms(phone: str, message: str) -> Dict[str, Any]:
    """Attempts to dispatch SMS via configured production provider."""
    provider = os.getenv("SMS_PROVIDER", "").lower()
    api_key = os.getenv("SMS_API_KEY", "")

    if not provider or not api_key:
        return {"dispatched": False, "channel": "SMS", "status": "PROVIDER_NOT_CONFIGURED"}

    if provider == "twilio":
        account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        from_number = os.getenv("TWILIO_FROM_NUMBER", "")
        if account_sid and from_number:
            try:
                import base64
                url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
                auth_str = f"{account_sid}:{api_key}"
                auth_bytes = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
                data = urllib.parse.urlencode({"From": from_number, "To": phone, "Body": message}).encode("utf-8")
                req = urllib.request.Request(url, data=data, method="POST")
                req.add_header("Authorization", f"Basic {auth_bytes}")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if resp.status in (200, 201):
                        return {"dispatched": True, "channel": "SMS", "status": "SENT"}
            except Exception as e:
                return {"dispatched": False, "channel": "SMS", "status": "PROVIDER_REQUEST_FAILED"}

    return {"dispatched": False, "channel": "SMS", "status": "PROVIDER_NOT_CONFIGURED"}

# ==============================================================================
# 1. PUSH TOKEN REGISTRATION & MANAGEMENT
# ==============================================================================
@router.post("/register-device")
def register_device(payload: RegisterDevicePayload, current_user: dict = Depends(get_current_user)):
    """
    Registers or updates an Expo push token for the authenticated user/device.
    Supports multiple devices per user. Strict derivation of user_id, customer_id, business_id.
    """
    token_str = payload.expo_push_token.strip()
    if not token_str:
        raise HTTPException(status_code=400, detail="Push token is required.")

    tokens_col = get_collection("push_tokens")
    user_id = current_user.get("id")
    role = current_user.get("role")
    business_id = current_user.get("business_id")
    customer_id = current_user.get("customer_id")

    now_iso = datetime.utcnow().isoformat() + "Z"
    existing = tokens_col.find_one({"expo_push_token": token_str})

    if existing:
        if existing.get("user_id") != user_id and existing.get("is_active", True):
            raise HTTPException(status_code=409, detail="This device token is already registered to another account.")
        tokens_col.update_one(
            {"id": existing["id"]},
            {"$set": {
                "user_id": user_id,
                "role": role,
                "business_id": business_id,
                "customer_id": customer_id,
                "platform": payload.platform or "android",
                "device_id": payload.device_id or existing.get("device_id"),
                "is_active": True,
                "updated_at": now_iso
            }}
        )
        token_id = existing["id"]
    else:
        token_id = f"token_{uuid.uuid4().hex[:12]}"
        tokens_col.insert_one({
            "id": token_id,
            "user_id": user_id,
            "role": role,
            "business_id": business_id,
            "customer_id": customer_id,
            "expo_push_token": token_str,
            "platform": payload.platform or "android",
            "device_id": payload.device_id,
            "is_active": True,
            "created_at": now_iso,
            "updated_at": now_iso
        })

    return {
        "success": True,
        "token_id": token_id,
        "message": "Device registered successfully for push notifications."
    }

@router.post("/unregister-device")
def unregister_device(payload: UnregisterDevicePayload, current_user: dict = Depends(get_current_user)):
    """Deactivates push notification token when user logs out or disables notifications."""
    tokens_col = get_collection("push_tokens")
    now_iso = datetime.utcnow().isoformat() + "Z"

    if payload.expo_push_token:
        tokens_col.update_one(
            {"expo_push_token": payload.expo_push_token.strip(), "user_id": current_user.get("id")},
            {"$set": {"is_active": False, "updated_at": now_iso}}
        )
    elif payload.device_id:
        tokens_col.update_one(
            {"device_id": payload.device_id, "user_id": current_user.get("id")},
            {"$set": {"is_active": False, "updated_at": now_iso}}
        )
    else:
        # Deactivate all for current user
        tokens_col.update_many(
            {"user_id": current_user.get("id")},
            {"$set": {"is_active": False, "updated_at": now_iso}}
        )

    return {"success": True, "message": "Device unregistered successfully."}

# ==============================================================================
# 2. IN-APP NOTIFICATION CENTER
# ==============================================================================
@router.get("")
def get_user_notifications(current_user: dict = Depends(get_current_user)):
    """
    Returns notifications with strict tenant isolation and unread count.
    Customers see only notifications addressed to their customer_id / user_id.
    Businesses see only notifications addressed to their business_id / user_id.
    """
    notifs_col = get_collection("notifications")
    user_id = current_user.get("id")
    role = current_user.get("role")
    biz_id = current_user.get("business_id")
    customer_id = current_user.get("customer_id")

    all_docs = notifs_col.find()

    filtered = []
    for doc in all_docs:
        rec_id = doc.get("recipient_id")
        doc_biz = doc.get("business_id")

        if role == ROLE_CUSTOMER:
            if rec_id in (user_id, customer_id):
                filtered.append(doc)
        elif role == ROLE_BUSINESS_OWNER or role in ("business", "staff"):
            if rec_id in (user_id, biz_id) or doc_biz == biz_id:
                filtered.append(doc)
        elif role == ROLE_SUPER_ADMIN:
            filtered.append(doc)

    filtered.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
    unread_count = sum(1 for d in filtered if not d.get("is_read", False))

    return {
        "success": True,
        "notifications": filtered,
        "unread_count": unread_count
    }

@router.post("")
def create_notification(data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """
    Creates an in-app notification and dispatches real push and optional SMS.
    Includes deduplication to prevent notification spam.
    """
    notifs_col = get_collection("notifications")
    now_iso = datetime.utcnow().isoformat() + "Z"
    notif_id = f"notif_{uuid.uuid4().hex[:12]}"

    recipient_id = data.get("recipient_id")
    business_id = data.get("business_id")
    recipient_phone = data.get("recipient_phone")
    title = data.get("title", "New Notification")
    message = data.get("message") or data.get("body", "")
    notif_type = data.get("type", "SYSTEM")
    entity_id = data.get("entity_id")
    action_url = data.get("action_url")
    custom_data = data.get("data") or {}

    role = (current_user.get("role") or "").upper()
    if role != ROLE_SUPER_ADMIN:
        if role != ROLE_BUSINESS_OWNER:
            raise HTTPException(status_code=403, detail="Only a business owner can send business notifications.")
        owned_business = get_collection("businesses").find_one({"owner_id": current_user.get("id")})
        if not owned_business or (business_id and business_id != owned_business.get("id")):
            raise HTTPException(status_code=403, detail="You can only send notifications for your own business.")
        business_id = owned_business["id"]
        if recipient_id not in (current_user.get("id"), business_id):
            recipient = get_collection("customers").find_one({"customer_id": recipient_id})
            if not recipient or not get_collection("customer_businesses").find_one({
                "customer_id": recipient.get("customer_id"),
                "business_id": business_id,
                "status": "active"
            }):
                raise HTTPException(status_code=403, detail="Notification recipient is not connected to your business.")
            recipient_phone = recipient.get("phone")

    # Deduplication check: same type, recipient, entity within 30 minutes
    if recipient_id and entity_id:
        recent = notifs_col.find_one({
            "recipient_id": recipient_id,
            "type": notif_type,
            "entity_id": entity_id
        })
        if recent and recent.get("created_at"):
            try:
                rec_dt = datetime.fromisoformat(recent["created_at"].replace("Z", ""))
                if (datetime.utcnow() - rec_dt).total_seconds() < 1800:
                    return {"success": True, "deduplicated": True, "notification": recent}
            except Exception:
                pass

    # Optional SMS dispatch
    sms_res = {"dispatched": False, "channel": "SMS", "status": "NOT_REQUESTED"}
    if role == ROLE_SUPER_ADMIN and recipient_phone and data.get("send_sms", False):
        sms_res = dispatch_external_sms(recipient_phone, f"{title}: {message}")

    # Real Expo push dispatch
    push_res = dispatch_expo_push_notifications(
        recipient_id=recipient_id,
        title=title,
        body=message,
        data={**custom_data, "action_url": action_url, "entity_id": entity_id, "type": notif_type}
    )

    notif_doc = {
        "id": notif_id,
        "recipient_id": recipient_id,
        "business_id": business_id,
        "type": notif_type,
        "title": title,
        "message": message,
        "body": message,
        "entity_id": entity_id,
        "action_url": action_url,
        "data": custom_data,
        "is_read": False,
        "created_at": now_iso,
        "push_delivery": push_res,
        "sms_delivery": sms_res
    }

    notifs_col.insert_one(notif_doc)
    return {"success": True, "notification": notif_doc}

@router.patch("/{notif_id}/read")
@router.post("/read/{notif_id}")
def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    """Marks a single notification as read with tenant ownership check."""
    notifs_col = get_collection("notifications")
    user_id = current_user.get("id")
    customer_id = current_user.get("customer_id")
    biz_id = current_user.get("business_id")
    role = current_user.get("role")

    notif = notifs_col.find_one({"id": notif_id})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    rec_id = notif.get("recipient_id")
    doc_biz = notif.get("business_id")
    allowed = (
        role == ROLE_SUPER_ADMIN or
        (role == ROLE_CUSTOMER and rec_id in (user_id, customer_id)) or
        (role in (ROLE_BUSINESS_OWNER, "business", "staff") and (rec_id in (user_id, biz_id) or doc_biz == biz_id))
    )

    if not allowed:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this notification.")

    now_iso = datetime.utcnow().isoformat() + "Z"
    notifs_col.update_one({"id": notif_id}, {"$set": {"is_read": True, "updated_at": now_iso}})
    return {"success": True, "message": "Notification marked as read."}

@router.post("/read-all")
@router.post("/mark-all-read")
def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    """Marks all notifications for the authenticated user as read."""
    notifs_col = get_collection("notifications")
    user_id = current_user.get("id")
    customer_id = current_user.get("customer_id")
    biz_id = current_user.get("business_id")
    role = current_user.get("role")

    all_docs = notifs_col.find({"is_read": False})
    count = 0
    now_iso = datetime.utcnow().isoformat() + "Z"

    for doc in all_docs:
        rec_id = doc.get("recipient_id")
        doc_biz = doc.get("business_id")
        should_update = (
            role == ROLE_SUPER_ADMIN or
            (role == ROLE_CUSTOMER and rec_id in (user_id, customer_id)) or
            (role in (ROLE_BUSINESS_OWNER, "business", "staff") and (rec_id in (user_id, biz_id) or doc_biz == biz_id))
        )

        if should_update:
            notifs_col.update_one({"id": doc["id"]}, {"$set": {"is_read": True, "updated_at": now_iso}})
            count += 1

    return {"success": True, "updated_count": count}

# ==============================================================================
# 3. NOTIFICATION PREFERENCES
# ==============================================================================
@router.get("/preferences")
def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    """Gets notification preferences for current user."""
    prefs_col = get_collection("notification_preferences")
    user_id = current_user.get("id")
    role = current_user.get("role")

    doc = prefs_col.find_one({"user_id": user_id})
    if doc:
        return {"success": True, "preferences": doc.get("preferences", {})}

    # Default preferences
    if role == ROLE_CUSTOMER:
        defaults = {
            "all": True,
            "daily_updates": True,
            "offers_rewards": True,
            "orders": True,
            "bookings": True,
            "marketing": False
        }
    else:
        defaults = {
            "all": True,
            "daily_summary": True,
            "orders": True,
            "bookings": True,
            "customers": True,
            "inventory": True,
            "payments": True,
            "subscription": True,
            "marketing": False
        }

    return {"success": True, "preferences": defaults}

@router.post("/preferences")
def update_notification_preferences(payload: NotificationPreferencesPayload, current_user: dict = Depends(get_current_user)):
    """Updates notification preferences for current user."""
    prefs_col = get_collection("notification_preferences")
    user_id = current_user.get("id")
    role = current_user.get("role")
    now_iso = datetime.utcnow().isoformat() + "Z"

    prefs_dict = payload.dict()
    prefs_col.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "role": role,
            "preferences": prefs_dict,
            "updated_at": now_iso
        }},
        upsert=True
    )

    return {"success": True, "preferences": prefs_dict, "message": "Notification preferences updated."}

# ==============================================================================
# 4. DEVELOPER TEST PUSH
# ==============================================================================
@router.post("/send-test")
def send_test_notification(payload: SendTestNotificationPayload, current_user: dict = Depends(get_current_user)):
    """Sends a test push notification to caller's registered device."""
    user_id = current_user.get("id")
    title = payload.title or "ZOOR UP Test Notification"
    body = payload.body or "Testing real push notifications on your device!"

    push_res = dispatch_expo_push_notifications(
        recipient_id=user_id,
        title=title,
        body=body,
        data=payload.data or {"test": True, "action_url": "/business/notifications"}
    )

    return {
        "success": True,
        "recipient_id": user_id,
        "push_result": push_res,
        "message": f"Test push sent to {push_res.get('dispatched', 0)} device(s)."
    }

# ==============================================================================
# 5. SCHEDULED DAILY NOTIFICATIONS ENGINE
# ==============================================================================
@router.post("/daily-job")
def trigger_daily_notifications_job(current_user: dict = Depends(get_current_user)):
    """
    Role-specific scheduled daily notification job.
    Never invents data. Computes real sales, orders, reservations, points.
    Strict tenant and customer isolation.
    """
    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    notifs_col = get_collection("notifications")
    businesses_col = get_collection("businesses")
    orders_col = get_collection("orders")
    bookings_col = get_collection("table_bookings")
    customers_col = get_collection("customers")

    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    dispatched = []

    # A. BUSINESS DAILY SUMMARY
    for biz in businesses_col.find():
        biz_id = biz.get("id")
        owner_id = biz.get("owner_id") or biz_id

        # Compute today's real orders
        biz_orders = [o for o in orders_col.find({"business_id": biz_id}) if str(o.get("created_at", "")).startswith(today_str)]
        sales_total = sum(float(o.get("total_amount") or o.get("total") or 0) for o in biz_orders)
        orders_count = len(biz_orders)

        # Compute today's reservations
        biz_bookings = [b for b in bookings_col.find({"business_id": biz_id}) if str(b.get("booking_date", "")).startswith(today_str)]
        res_count = len(biz_bookings)

        if orders_count > 0 or res_count > 0:
            msg = f"Good morning 👋 Today's ZOOR UP Summary: ₹{sales_total:,.2f} sales across {orders_count} orders, {res_count} reservations."
        else:
            msg = "Good morning 👋 Your business has no new activity today."

        # Idempotent deduplication for today
        dedup_key = f"DAILY_BIZ_{biz_id}_{today_str}"
        if not notifs_col.find_one({"entity_id": dedup_key}):
            notif = {
                "id": f"notif_{uuid.uuid4().hex[:12]}",
                "recipient_id": owner_id,
                "business_id": biz_id,
                "type": "DAILY_SUMMARY",
                "title": "Today's ZOOR UP Summary",
                "message": msg,
                "body": msg,
                "entity_id": dedup_key,
                "action_url": "/business",
                "is_read": False,
                "created_at": datetime.utcnow().isoformat() + "Z"
            }
            notifs_col.insert_one(notif)
            dispatch_expo_push_notifications(owner_id, "Today's ZOOR UP Summary", msg, {"action_url": "/business"})
            dispatched.append(dedup_key)

    # B. CUSTOMER DAILY NOTIFICATIONS (Actual points & rewards)
    for cust in customers_col.find():
        cust_id = cust.get("id")
        pts = cust.get("loyalty_points") or cust.get("points") or 0
        biz_id = cust.get("business_id")
        if pts > 0 and biz_id:
            biz = businesses_col.find_one({"id": biz_id})
            biz_name = biz.get("name", "your favorite store") if biz else "ZOOR UP"
            cust_msg = f"Your ZOOR UP rewards are waiting 🎁 You have {pts} points at {biz_name}."

            dedup_cust = f"DAILY_CUST_{cust_id}_{today_str}"
            if not notifs_col.find_one({"entity_id": dedup_cust}):
                notif = {
                    "id": f"notif_{uuid.uuid4().hex[:12]}",
                    "recipient_id": cust_id,
                    "business_id": biz_id,
                    "type": "LOYALTY",
                    "title": "Your Rewards Reminder",
                    "message": cust_msg,
                    "body": cust_msg,
                    "entity_id": dedup_cust,
                    "action_url": "/customer/rewards",
                    "is_read": False,
                    "created_at": datetime.utcnow().isoformat() + "Z"
                }
                notifs_col.insert_one(notif)
                dispatch_expo_push_notifications(cust_id, "Your Rewards Reminder", cust_msg, {"action_url": "/customer/rewards"})
                dispatched.append(dedup_cust)

    return {
        "success": True,
        "dispatched_count": len(dispatched),
        "notifications": dispatched
    }

# ==============================================================================
# 6. AUTOMATED REMINDERS CHECK
# ==============================================================================
@router.post("/reminders/trigger-check")
def trigger_scheduled_reminders_check(current_user: dict = Depends(get_current_user)):
    """Backend Automated Scheduler Job: Table booking and reservation reminders."""
    if (current_user.get("role") or "").upper() != ROLE_SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    reminders_col = get_collection("reminders")
    notifs_col = get_collection("notifications")
    bookings_col = get_collection("table_bookings")

    now = datetime.utcnow()
    generated_reminders = []
    active_bookings = bookings_col.find({"status": "CONFIRMED"})

    for b in active_bookings:
        b_id = b.get("id")
        b_date = b.get("booking_date") or b.get("date")
        b_time = b.get("booking_time") or b.get("time")
        if not b_date or not b_time:
            continue

        try:
            booking_dt = datetime.strptime(f"{b_date} {b_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            continue

        time_until = (booking_dt - now).total_seconds()
        biz_name = b.get("business_name", "Partner Store")
        cust_id = b.get("customer_id")

        if 23 * 3600 <= time_until <= 25 * 3600:
            reminder_key = f"BOOKING_24H_{b_id}"
            if not reminders_col.find_one({"key": reminder_key}):
                title = f"Table Reservation Tomorrow: {biz_name}"
                msg = f"Reminder: Your table at {biz_name} is reserved for tomorrow at {b_time}."
                notifs_col.insert_one({
                    "id": f"notif_{uuid.uuid4().hex[:12]}",
                    "recipient_id": cust_id,
                    "business_id": b.get("business_id"),
                    "type": "REMINDER",
                    "title": title,
                    "message": msg,
                    "entity_id": b_id,
                    "action_url": "/customer/table-booking",
                    "is_read": False,
                    "created_at": now.isoformat() + "Z"
                })
                reminders_col.insert_one({"key": reminder_key, "sent_at": now.isoformat() + "Z"})
                dispatch_expo_push_notifications(cust_id, title, msg, {"action_url": "/customer/table-booking"})
                generated_reminders.append(reminder_key)

    return {
        "success": True,
        "checked_at": now.isoformat() + "Z",
        "dispatched_count": len(generated_reminders),
        "reminders": generated_reminders
    }
