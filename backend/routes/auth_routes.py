"""
ZOOR UP Authentication Routes
"""
import re
import uuid
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Request
from backend.models import (
    BusinessOwnerRegisterRequest,
    LoginRequest,
    CustomerRegisterRequest,
    OTPRequest,
    OTPVerifyRequest,
    GoogleAuthRequest,
    ROLE_BUSINESS_OWNER,
    ROLE_CUSTOMER,
    STATUS_ACTIVE
)
from backend.database import get_collection
from backend.auth import hash_password, verify_password, create_access_token, get_current_user
from backend.rate_limit import enforce_rate_limit
from backend.rate_limit import reset_rate_limits

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def generate_unique_customer_id(customers_col) -> str:
    for _ in range(5):
        candidate = f"ZUP-CUS-{secrets.token_hex(4).upper()}"
        if not customers_col.find_one({"customer_id": candidate}):
            return candidate
    return f"ZUP-CUS-{int(time.time() * 1000) % 100000000:08d}"

def generate_unique_business_slug(name: str, biz_id: str, businesses_col) -> str:
    """
    Generates a permanent, clean, URL-safe business slug with collision handling.
    Example: 'My Fresh Store' -> 'my-fresh-store' -> 'my-fresh-store-2'
    """
    raw_name = (name or "store").strip().lower()
    base_slug = re.sub(r'[^a-z0-9]+', '-', raw_name).strip('-')
    if not base_slug:
        base_slug = f"store-{biz_id[:8]}"
    
    slug = base_slug
    counter = 1
    while True:
        existing = businesses_col.find_one({"slug": slug})
        if not existing or existing.get("id") == biz_id:
            break
        counter += 1
        slug = f"{base_slug}-{counter}"
    return slug

@router.post("/owner/register")
def register_business_owner(req: BusinessOwnerRegisterRequest, request: Request):
    enforce_rate_limit("owner-register-ip", request.client.host if request.client else "unknown", 10, 3600)
    enforce_rate_limit("owner-register-email", (req.email or "").strip().lower(), 5, 86400)
    users_col = get_collection("users")
    businesses_col = get_collection("businesses")

    # 1. Check duplicate email
    existing_user = users_col.find_one({"email": req.email.lower()})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists. Please log in."
        )

    # 2. Check duplicate phone if provided
    if req.phone and req.phone.strip():
        existing_phone = users_col.find_one({"phone": req.phone.strip()})
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this phone number already exists."
            )

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    biz_id = f"biz_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now().isoformat()

    # 3. Create Business Owner User
    new_user = {
        "id": user_id,
        "name": req.name or "",
        "owner_name": req.owner_name or req.name or "",
        "email": req.email.lower(),
        "phone": req.phone or "",
        "password_hash": hash_password(req.password),
        "role": ROLE_BUSINESS_OWNER,
        "business_id": biz_id,
        "created_at": now_iso,
        "auth_provider": "email"
    }
    users_col.insert_one(new_user)

    # 4. Create Business automatically ACTIVE with EMPTY profile (No demo cloning)
    slug = generate_unique_business_slug(req.name, biz_id, businesses_col)

    new_biz = {
        "id": biz_id,
        "owner_id": user_id,
        "name": req.name or "",
        "slug": slug,
        "owner_name": req.owner_name or "",
        "email": req.email.lower(),
        "phone": req.phone or "",
        "logo": None,
        "category": "",
        "description": "",
        "address": "",
        "city": "",
        "state": "",
        "country": "India",
        "postal_code": "",
        "website": "",
        "opening_hours": {},
        "gst_number": "",
        "tax_number": "",
        "status": STATUS_ACTIVE,
        "subscription_plan": "FREE",
        "subscription_status": "ACTIVE",
        "payment_status": "NOT_REQUIRED",
        "onboarding_completed": False,
        "onboarding_step": 1,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    businesses_col.insert_one(new_biz)

    # Authoritative Default FREE Subscription Record
    subs_col = get_collection("subscriptions")
    subs_col.insert_one({
        "business_id": biz_id,
        "plan": "FREE",
        "status": "ACTIVE",
        "subscription_status": "ACTIVE",
        "payment_status": "NOT_REQUIRED",
        "amount": 0,
        "currency": "INR",
        "billing_interval": "monthly",
        "auto_renew": False,
        "provider": None,
        "provider_subscription_id": None,
        "current_period_start": now_iso,
        "current_period_end": None,
        "next_billing_date": None,
        "cancel_at_period_end": False,
        "mandate_status": "none",
        "can_access_premium": False,
        "is_free": True,
        "created_at": now_iso,
        "updated_at": now_iso
    })

    token = create_access_token({"sub": user_id, "role": ROLE_BUSINESS_OWNER, "business_id": biz_id})

    user_safe = {k: v for k, v in new_user.items() if k != "password_hash"}
    user_safe["business_id"] = biz_id
    user_safe["business_slug"] = slug
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": user_safe,
        "business": new_biz
    }

@router.post("/owner/login")
def login_business_owner(req: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit("owner-login-ip", client_ip, 20, 60)
    enforce_rate_limit("owner-login-email", (req.email or "").strip().lower(), 8, 900)
    users_col = get_collection("users")
    user = users_col.find_one({"email": req.email.lower()})

    if not user or not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if user.get("role") != ROLE_BUSINESS_OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This portal is for Business Owners only."
        )

    businesses_col = get_collection("businesses")
    biz = businesses_col.find_one({"owner_id": user["id"]}) or businesses_col.find_one({"id": user.get("business_id")})
    
    # ONE BUSINESS = ONE PERMANENT RECORD:
    # If for any reason the business record was missing, create exactly ONCE and link permanently
    if not biz:
        biz_id = user.get("business_id") or f"biz_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now().isoformat()
        slug = generate_unique_business_slug(user.get("name") or "My Business", biz_id, businesses_col)
        biz = {
            "id": biz_id,
            "owner_id": user["id"],
            "name": user.get("name") or "My Business",
            "slug": slug,
            "owner_name": user.get("owner_name") or user.get("name") or "",
            "email": user.get("email"),
            "phone": user.get("phone", ""),
            "status": STATUS_ACTIVE,
            "subscription_plan": "FREE",
            "subscription_status": "ACTIVE",
            "payment_status": "NOT_REQUIRED",
            "onboarding_completed": False,
            "onboarding_step": 1,
            "created_at": now_iso,
            "updated_at": now_iso
        }
        businesses_col.insert_one(biz)
        users_col.update_one({"id": user["id"]}, {"$set": {"business_id": biz_id}})
    else:
        if not biz.get("slug"):
            slug = generate_unique_business_slug(biz.get("name") or "Store", biz["id"], businesses_col)
            businesses_col.update_one({"id": biz["id"]}, {"$set": {"slug": slug}})
            biz["slug"] = slug
        if not user.get("business_id") or user.get("business_id") != biz["id"]:
            users_col.update_one({"id": user["id"]}, {"$set": {"business_id": biz["id"]}})

    token = create_access_token({"sub": user["id"], "role": ROLE_BUSINESS_OWNER, "business_id": biz["id"]})
    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    user_safe["business_id"] = biz["id"]
    user_safe["business_slug"] = biz.get("slug")

    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": user_safe,
        "business": biz
    }

@router.post("/customer/register")
def register_customer(req: CustomerRegisterRequest, request: Request):
    enforce_rate_limit("customer-register-ip", request.client.host if request.client else "unknown", 20, 3600)
    enforce_rate_limit("customer-register-email", (req.email or "").strip().lower(), 5, 86400)
    users_col = get_collection("users")
    customers_col = get_collection("customers")
    normalized_email = (req.email or "").strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if not req.password:
        raise HTTPException(status_code=400, detail="Password is required.")

    phone = (req.phone or "").strip()
    normalized_phone = phone
    if phone:
        is_valid, normalized_phone, err = normalize_indian_phone(phone)
        if not is_valid:
            raise HTTPException(status_code=400, detail=err or "Enter a valid Indian mobile number.")

    existing_user = users_col.find_one({"email": normalized_email}) or (users_col.find_one({"phone": normalized_phone}) if normalized_phone else None)
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email or phone already exists. Please log in.")

    customer_id = generate_unique_customer_id(customers_col)
    user_id = f"user_cus_{uuid.uuid4().hex[:12]}"
    customer_record_id = f"cus_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now().isoformat()

    customer = {
        "id": customer_record_id,
        "customer_id": customer_id,
        "user_id": user_id,
        "name": (req.name or "Customer").strip() or "Customer",
        "phone": normalized_phone,
        "email": normalized_email,
        "avatar": None,
        "profile_image_url": None,
        "points": 0,
        "lifetime_points": 0,
        "stamps": 0,
        "total_visits": 0,
        "total_spent": 0.0,
        "segment": "NEW",
        "membership_tier": "MEMBER",
        "address": "",
        "rewards": [],
        "history": [],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    customers_col.insert_one(customer)

    user = {
        "id": user_id,
        "customer_id": customer_id,
        "name": customer["name"],
        "email": normalized_email,
        "phone": normalized_phone,
        "password_hash": hash_password(req.password),
        "role": ROLE_CUSTOMER,
        "auth_provider": "email",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    users_col.insert_one(user)

    token = create_access_token({"sub": user_id, "role": ROLE_CUSTOMER, "customer_id": customer_id})
    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": user_safe,
        "customer": customer,
    }

@router.post("/customer/login")
def login_customer(req: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit("customer-login-ip", client_ip, 20, 60)
    enforce_rate_limit("customer-login-email", (req.email or "").strip().lower(), 8, 900)
    users_col = get_collection("users")
    customers_col = get_collection("customers")
    email = (req.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")

    user = users_col.find_one({"email": email, "role": ROLE_CUSTOMER}) or users_col.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if user.get("role") != ROLE_CUSTOMER:
        raise HTTPException(status_code=403, detail="Access denied. This portal is for customers only.")

    customer = customers_col.find_one({"user_id": user["id"]}) or customers_col.find_one({"customer_id": user.get("customer_id")}) or customers_col.find_one({"phone": user.get("phone")})
    if not customer:
        customer_id = user.get("customer_id") or generate_unique_customer_id(customers_col)
        customer = {
            "id": f"cus_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "user_id": user["id"],
            "name": user.get("name") or "Customer",
            "phone": user.get("phone", ""),
            "email": user.get("email", ""),
            "points": 0,
            "lifetime_points": 0,
            "stamps": 0,
            "total_visits": 0,
            "total_spent": 0.0,
            "segment": "NEW",
            "membership_tier": "MEMBER",
            "address": "",
            "rewards": [],
            "history": [],
            "created_at": datetime.now().isoformat(),
        }
        customers_col.insert_one(customer)
        users_col.update_one({"id": user["id"]}, {"$set": {"customer_id": customer_id}})

    token = create_access_token({"sub": user["id"], "role": ROLE_CUSTOMER, "customer_id": customer["customer_id"]})
    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    user_safe["customer_id"] = customer.get("customer_id")
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": user_safe,
        "customer": customer,
    }

@router.post("/login")
def login_by_account_role(req: LoginRequest, request: Request):
    """Authenticate using the account role persisted by the backend, not a client role field."""
    users_col = get_collection("users")
    user = users_col.find_one({"email": (req.email or "").strip().lower()})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if user.get("role") == ROLE_BUSINESS_OWNER:
        return login_business_owner(req, request)
    if user.get("role") == ROLE_CUSTOMER:
        return login_customer(req, request)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account cannot sign in to the mobile app.")

@router.post("/google")
def authenticate_with_google(req: GoogleAuthRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit("google-login-ip", client_ip, 20, 60)
    enforce_rate_limit("google-login-email", (req.email or "").strip().lower() or client_ip, 8, 900)
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    id_token = (req.token or "").strip()
    if not google_client_id or not id_token:
        raise HTTPException(status_code=401, detail="A verified Google sign-in token is required.")
    try:
        token_info_url = "https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": id_token})
        google_request = urllib.request.Request(token_info_url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(google_request, timeout=5) as response:
            token_info = json.loads(response.read().decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified.") from None

    verified_email = (token_info.get("email") or "").strip().lower()
    google_subject = (token_info.get("sub") or "").strip()
    google_name = (token_info.get("name") or token_info.get("given_name") or verified_email.split("@")[0]).strip()
    google_avatar = (token_info.get("picture") or "").strip() or None
    if (
        token_info.get("aud") != google_client_id
        or str(token_info.get("email_verified", "")).lower() != "true"
        or not verified_email
        or not google_subject
        or (req.email and req.email.strip().lower() != verified_email)
        or (req.google_id and req.google_id != google_subject)
    ):
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified.")

    users_col = get_collection("users")
    businesses_col = get_collection("businesses")
    customers_col = get_collection("customers")

    normalized_email = verified_email
    if not normalized_email:
        raise HTTPException(status_code=400, detail="Google email is required.")

    import re
    effective_google_id = google_subject
    role_req = (req.role or "CUSTOMER").upper()
    role = ROLE_BUSINESS_OWNER if role_req in ["BUSINESS", "OWNER", ROLE_BUSINESS_OWNER] else ROLE_CUSTOMER

    # 1. Search existing user by google provider id or email
    user = users_col.find_one({"provider_user_id": effective_google_id}) or users_col.find_one({"email": normalized_email})

    now_iso = datetime.now().isoformat()
    biz = None
    cus = None

    if user:
        # Existing user found: NEVER create duplicate user or duplicate business!
        user_id = user["id"]
        updates = {"updated_at": now_iso}
        if not user.get("auth_provider"):
            updates["auth_provider"] = "google"
            updates["provider_user_id"] = effective_google_id
        if google_avatar and not user.get("avatar"):
            updates["avatar"] = google_avatar
        users_col.update_one({"id": user_id}, {"$set": updates})

        if user.get("role") == ROLE_BUSINESS_OWNER:
            # ONE BUSINESS PER OWNER: Search existing business by owner_id or business_id
            biz = businesses_col.find_one({"owner_id": user_id}) or businesses_col.find_one({"id": user.get("business_id")})
            if not biz:
                biz_id = f"biz_{uuid.uuid4().hex[:12]}"
                slug = generate_unique_business_slug(google_name or user.get("name") or "My Business", biz_id, businesses_col)
                biz = {
                    "id": biz_id,
                    "owner_id": user_id,
                    "name": google_name or user.get("name") or "My Business",
                    "slug": slug,
                    "email": normalized_email,
                    "phone": user.get("phone", ""),
                    "status": STATUS_ACTIVE,
                    "onboarding_completed": False,
                    "onboarding_step": 1,
                    "created_at": now_iso,
                    "updated_at": now_iso
                }
                businesses_col.insert_one(biz)
                users_col.update_one({"id": user_id}, {"$set": {"business_id": biz_id}})
            elif not biz.get("slug"):
                slug = generate_unique_business_slug(biz.get("name") or "Store", biz["id"], businesses_col)
                businesses_col.update_one({"id": biz["id"]}, {"$set": {"slug": slug}})
                biz["slug"] = slug
        else:
            cus = customers_col.find_one({"user_id": user_id}) or customers_col.find_one({"email": normalized_email})
            if not cus:
                customer_id = user.get("customer_id") or generate_unique_customer_id(customers_col)
                cus = {
                    "id": f"cus_{uuid.uuid4().hex[:12]}",
                    "customer_id": customer_id,
                    "user_id": user_id,
                    "name": user.get("name") or google_name or "Valued Customer",
                    "email": normalized_email,
                    "phone": user.get("phone", ""),
                    "points": 0,
                    "stamps": 0,
                    "total_visits": 0,
                    "created_at": now_iso
                }
                customers_col.insert_one(cus)
                users_col.update_one({"id": user_id}, {"$set": {"customer_id": customer_id}})
    else:
        # 2. Brand new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "id": user_id,
            "name": google_name or normalized_email.split("@")[0],
            "email": normalized_email,
            "phone": "",
            "role": role,
            "avatar": google_avatar,
            "auth_provider": "google",
            "provider_user_id": effective_google_id,
            "created_at": now_iso,
            "updated_at": now_iso
        }

        if role == ROLE_BUSINESS_OWNER:
            biz_id = f"biz_{uuid.uuid4().hex[:12]}"
            new_user["business_id"] = biz_id
            biz_name = google_name or f"{normalized_email.split('@')[0]}'s Store"
            slug = generate_unique_business_slug(biz_name, biz_id, businesses_col)
            biz = {
                "id": biz_id,
                "owner_id": user_id,
                "name": biz_name,
                "slug": slug,
                "email": normalized_email,
                "phone": "",
                "status": STATUS_ACTIVE,
                "onboarding_completed": False,
                "onboarding_step": 1,
                "created_at": now_iso,
                "updated_at": now_iso
            }
            businesses_col.insert_one(biz)
        else:
            customer_id = generate_unique_customer_id(customers_col)
            new_user["customer_id"] = customer_id
            cus = {
                "id": f"cus_{uuid.uuid4().hex[:12]}",
                "customer_id": customer_id,
                "user_id": user_id,
                "name": req.name or normalized_email.split("@")[0],
                "email": normalized_email,
                "phone": "",
                "points": 0,
                "stamps": 0,
                "total_visits": 0,
                "created_at": now_iso
            }
            customers_col.insert_one(cus)

        users_col.insert_one(new_user)
        user = new_user

    token_payload = {
        "sub": user["id"],
        "role": user["role"],
    }
    if user.get("business_id"):
        token_payload["business_id"] = user["business_id"]
    if user.get("customer_id"):
        token_payload["customer_id"] = user["customer_id"]

    token = create_access_token(token_payload)
    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    if biz:
        user_safe["business_id"] = biz["id"]
        user_safe["business_slug"] = biz.get("slug")

    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "user": user_safe,
        "business": biz,
        "customer": cus
    }

import os
import re
import time
import secrets
import hashlib
from backend.sms_adapter import (
    normalize_indian_phone,
    mask_phone,
    generate_secure_otp,
    hash_otp,
    send_sms_otp,
    get_sms_provider_status,
    SMSDeliveryResult
)

# Production Safety Assertion: Never allow DEV_OTP in production
if os.getenv("ENVIRONMENT", "development").strip().lower() == "production" and os.getenv("DEV_OTP", "false").lower() == "true":
    raise RuntimeError("CRITICAL SECURITY ERROR: DEV_OTP cannot be enabled in production environment.")
if os.getenv("ENVIRONMENT", "development").strip().lower() == "production" and len(os.getenv("OTP_PEPPER", "")) < 32:
    raise RuntimeError("OTP_PEPPER must be configured with at least 32 characters in production.")

@router.get("/sms/status")
def check_sms_status():
    """Returns safe SMS configuration status without exposing keys or credentials."""
    return {
        "success": True,
        **get_sms_provider_status()
    }

@router.post("/test/reset-cooldown")
def reset_test_cooldown():
    """Resets cooldown memory for automated testing (disabled in production)."""
    if os.getenv("ENVIRONMENT", "development").strip().lower() == "production":
        raise HTTPException(status_code=403, detail="Forbidden in production")
    reset_rate_limits()
    return {"success": True}

@router.post("/otp/request")
@router.post("/send-otp")
def request_otp(req: OTPRequest, request: Request):
    """
    Requests a 6-digit SMS OTP for Indian mobile numbers (+91XXXXXXXXXX).
    Dispatches via real SMS provider (Fast2SMS, Twilio, MSG91) with safe response logging.
    Fails fast with 503 if SMS provider is not configured in production.
    """
    is_valid, phone, err_msg = normalize_indian_phone(req.phone)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg or "Enter a valid 10-digit Indian mobile number."
        )

    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit("otp-request-ip", client_ip, 20, 3600)
    enforce_rate_limit("otp-request-cooldown", phone, 1, 60)
    enforce_rate_limit("otp-request-phone", phone, 5, 3600)

    purpose = (req.purpose or "LOGIN").upper()
    valid_purposes = {"LOGIN", "SIGNUP", "PHONE_VERIFICATION", "PASSWORD_RESET", "CHANGE_PHONE"}
    if purpose not in valid_purposes:
        purpose = "LOGIN"

    now_ts = time.time()

    # 3. Generate Cryptographically Secure 6-digit OTP
    code = generate_secure_otp()
    salt = secrets.token_hex(16)
    otp_hash = hash_otp(code, salt)
    request_id = f"req_otp_{uuid.uuid4().hex[:12]}"
    expires_at = now_ts + 300  # 5 minutes

    # 4. Store Salted Hash in Database
    otp_col = get_collection("otp_codes")
    # Invalidate previous unverified OTPs for this phone + purpose
    otp_col.delete_many({"phone": phone, "purpose": purpose})

    otp_col.insert_one({
        "phone": phone,
        "request_id": request_id,
        "otp_hash": otp_hash,
        "salt": salt,
        "purpose": purpose,
        "attempts": 0,
        "max_attempts": 5,
        "expires_at": expires_at,
        "delivery_status": "QUEUED",
        "created_at": datetime.now().isoformat()
    })

    # 5. Dispatch via Real SMS Gateway
    result: SMSDeliveryResult = send_sms_otp(phone, code, purpose, request_id)

    if not result.success:
        otp_col.update_one(
            {"request_id": request_id},
            {"$set": {"delivery_status": "FAILED", "error": "SMS provider delivery failed."}}
        )
        if "not configured" in (result.error_message or "").lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=result.error_message
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="SMS service is temporarily unavailable. Please try again."
            )

    # 6. Update Delivery Status
    otp_col.update_one(
        {"request_id": request_id},
        {"$set": {
            "delivery_status": result.delivery_status,
            "provider_request_id": result.request_id
        }}
    )

    masked = mask_phone(phone)
    return {
        "success": True,
        "message": f"OTP sent to {masked}",
        "phone": phone,
        "masked_phone": masked,
        "request_id": request_id,
        "delivery_status": result.delivery_status,
        "provider": result.provider_name,
        "expires_in_seconds": 300,
        "resend_cooldown_seconds": 60
    }

@router.post("/otp/verify")
@router.post("/verify-otp")
def verify_otp(req: OTPVerifyRequest, request: Request):
    """
    Verifies 6-digit SMS OTP.
    On success, maps to permanent user account (ZUP-CUS-XXXXXXXX) and issues JWT.
    Enforces expiration, one-time use, attempt limiting, and duplicate account prevention.
    """
    is_valid, phone, err_msg = normalize_indian_phone(req.phone)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg or "Enter a valid 10-digit Indian mobile number."
        )

    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit("otp-verify-ip", client_ip, 40, 3600)
    enforce_rate_limit("otp-verify-phone", phone, 10, 900)

    code = (req.code or "").strip()
    purpose = (req.purpose or "LOGIN").upper()

    if not code:
        raise HTTPException(status_code=400, detail="6-digit verification code is required.")

    if len(code) != 6 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Verification code must be exactly 6 numeric digits.")

    is_production = os.getenv("ENVIRONMENT") == "production"
    is_dev_test = not is_production and os.getenv("DEV_OTP", "false").lower() == "true"

    otp_col = get_collection("otp_codes")
    now_ts = time.time()

    # Query active OTP record
    record = otp_col.find_one({"phone": phone, "purpose": purpose})

    verified = False

    if record:
        # Check Expiration (5 minutes)
        if now_ts > record.get("expires_at", 0):
            otp_col.delete_one({"_id": record.get("_id")})
            raise HTTPException(status_code=400, detail="OTP expired. Request a new OTP.")

        # Check Attempt Limit (Max 5 attempts)
        attempts = record.get("attempts", 0)
        if attempts >= 5:
            otp_col.delete_one({"_id": record.get("_id")})
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many OTP requests. Please try again later."
            )

        # Constant-time hash verification
        expected_hash = record["otp_hash"]
        candidate_hash = hash_otp(code, record["salt"])

        if secrets.compare_digest(candidate_hash, expected_hash):
            verified = True
            # Invalidate record immediately (One-time use)
            otp_col.delete_one({"_id": record.get("_id")})
        elif is_dev_test and code == "123456":
            verified = True
            otp_col.delete_one({"_id": record.get("_id")})
        else:
            # Increment failed attempt count
            new_attempts = attempts + 1
            remaining_attempts = max(0, 5 - new_attempts)
            if new_attempts >= 5:
                otp_col.delete_one({"_id": record.get("_id")})
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed attempts. This OTP has been invalidated. Please request a new OTP."
                )
            else:
                otp_col.update_one({"_id": record.get("_id")}, {"$set": {"attempts": new_attempts}})
                raise HTTPException(
                    status_code=400,
                    detail=f"Incorrect OTP. {remaining_attempts} attempt{'s' if remaining_attempts != 1 else ''} remaining."
                )
    else:
        raise HTTPException(
            status_code=400,
            detail="No active verification code found for this phone. Please request a new OTP."
        )

    if not verified:
        raise HTTPException(status_code=400, detail="Verification failed.")

    # Real Customer Authentication & Account Resolution
    # Single Source of Truth: Look up existing user by verified phone number
    users_col = get_collection("users")
    customers_col = get_collection("customers")
    user = (
        users_col.find_one({"phone": phone, "role": "customer"}) or
        users_col.find_one({"phone": phone, "role": ROLE_CUSTOMER}) or
        users_col.find_one({"phone": phone})
    )
    is_new = False
    customer_name = (req.name or "").strip()

    if not user:
        is_new = True
        user_id = f"user_cus_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now().isoformat()

        # Permanent customer public ID: ZUP-CUS-XXXXXXXX
        customer_id = generate_unique_customer_id(customers_col)

        # Default clean values for new customer (ZERO demo data)
        new_customer = {
            "id": f"cus_{uuid.uuid4().hex[:12]}",
            "customer_id": customer_id,
            "user_id": user_id,
            "name": customer_name or f"Customer {customer_id.replace('ZUP-CUS-', '')}",
            "phone": phone,
            "email": "",
            "avatar": None,
            "profile_image_url": None,
            "points": 0,
            "lifetime_points": 0,
            "stamps": 0,
            "total_visits": 0,
            "total_spent": 0.0,
            "segment": "NEW",
            "membership_tier": "MEMBER",
            "address": "",
            "rewards": [],
            "history": [],
            "created_at": now_iso
        }
        customers_col.insert_one(new_customer)

        user = {
            "id": user_id,
            "customer_id": customer_id,
            "phone": phone,
            "name": new_customer["name"],
            "email": "",
            "role": "customer",
            "created_at": now_iso
        }
        users_col.insert_one(user)
    else:
        new_customer = customers_col.find_one({"user_id": user["id"]}) or customers_col.find_one({"phone": phone})

    token = create_access_token({"sub": user["id"], "role": "customer", "customer_id": user.get("customer_id")})

    # Return clean user object with consistent lowercase role
    user_resp = {**user, "role": "customer"}

    return {
        "success": True,
        "is_new": is_new,
        "access_token": token,
        "token_type": "bearer",
        "user": user_resp,
        "customer": new_customer
    }


@router.get("/me")
def get_authenticated_me(current_user: dict = Depends(get_current_user)):
    user_safe = {k: v for k, v in current_user.items() if k != "password_hash"}
    res = {"user": user_safe}
    if current_user.get("role") == ROLE_BUSINESS_OWNER:
        businesses_col = get_collection("businesses")
        biz = businesses_col.find_one({"owner_id": current_user["id"]})
        if not biz and current_user.get("business_id"):
            biz = businesses_col.find_one({"id": current_user["business_id"], "owner_id": current_user["id"]})
        if biz:
            if not biz.get("slug"):
                slug = generate_unique_business_slug(biz.get("name") or "Store", biz["id"], businesses_col)
                businesses_col.update_one({"id": biz["id"]}, {"$set": {"slug": slug}})
                biz["slug"] = slug
            user_safe["business_slug"] = biz.get("slug")
            user_safe["business_id"] = biz["id"]
        res["business"] = biz
    elif current_user.get("role") == ROLE_CUSTOMER:
        customers_col = get_collection("customers")
        cus = customers_col.find_one({"user_id": current_user["id"]}) or customers_col.find_one({"phone": current_user.get("phone")})
        res["customer"] = cus
    return res
