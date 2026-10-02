"""
ZOOR UP Production SMS Adapter & India Phone Normalization Layer
Supports Fast2SMS, Twilio, MSG91 with DLT template enforcement,
cryptographic OTP generation, safe response logging, and zero secret exposure.
"""
import os
import re
import json
import secrets
import hashlib
import urllib.request
import urllib.parse
import urllib.error
import base64
from typing import Tuple, Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class SMSDeliveryResult:
    success: bool
    delivery_status: str  # "QUEUED", "SENT", "DELIVERED", "FAILED", "EXPIRED", "DEV_SIMULATED"
    provider_name: str
    request_id: Optional[str] = None
    error_message: Optional[str] = None

def normalize_indian_phone(phone: str) -> Tuple[bool, str, str]:
    """
    Normalizes Indian phone numbers to canonical E.164 (+91XXXXXXXXXX).
    Validates:
    - Exactly 10 digits after country code
    - Starts with valid Indian mobile prefix (6, 7, 8, 9)
    - Rejects obviously invalid, malformed, or duplicate-code numbers.
    """
    if not phone or not isinstance(phone, str):
        return False, "", "Phone number cannot be empty."

    raw = phone.strip()
    digits = re.sub(r"\D", "", raw)

    # Handle various Indian phone formats:
    # 1. 10 digits directly: 9876543210
    if len(digits) == 10:
        clean_10 = digits
    # 2. 11 digits with leading 0: 09876543210
    elif len(digits) == 11 and digits.startswith("0"):
        clean_10 = digits[1:]
    # 3. 12 digits with 91 prefix: 919876543210 or +919876543210
    elif len(digits) == 12 and digits.startswith("91"):
        clean_10 = digits[2:]
    # 4. Malformed numbers (e.g. +9109876543210 - 13 digits)
    elif len(digits) == 13 and digits.startswith("910"):
        clean_10 = digits[3:]
    else:
        return False, "", "Enter a valid 10-digit Indian mobile number."

    # Validate exactly 10 digits starting with 6, 7, 8, or 9
    if not re.match(r"^[6-9]\d{9}$", clean_10):
        return False, "", "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9."

    return True, f"+91{clean_10}", ""

def mask_phone(phone: str) -> str:
    """Safely masks phone numbers for public logs and UI display (e.g. +91******1234)."""
    if not phone or len(phone) < 8:
        return "+91******XXXX"
    return f"{phone[:3]}******{phone[-4:]}"

def generate_secure_otp() -> str:
    """Generates a cryptographically secure 6-digit numeric OTP (100000 - 999999)."""
    return f"{secrets.randbelow(900000) + 100000}"

def hash_otp(code: str, salt: str) -> str:
    """Computes a salted, optionally peppered hash of the OTP for database storage."""
    pepper = os.getenv("OTP_PEPPER", "")
    return hashlib.sha256(f"{code}:{salt}:{pepper}".encode("utf-8")).hexdigest()

def get_sms_provider_status() -> Dict[str, Any]:
    """Returns safe SMS configuration status without exposing private keys or credentials."""
    provider = os.getenv("SMS_PROVIDER", "").strip().lower()
    api_key = os.getenv("SMS_API_KEY", "") or os.getenv("FAST2SMS_API_KEY", "")
    twilio_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_token = os.getenv("TWILIO_AUTH_TOKEN", "") or os.getenv("SMS_API_KEY", "")
    msg91_key = os.getenv("MSG91_AUTH_KEY", "") or os.getenv("SMS_API_KEY", "")

    is_configured = False
    active_provider = "none"

    if provider == "fast2sms" and api_key:
        is_configured = True
        active_provider = "fast2sms"
    elif provider == "twilio" and twilio_sid and twilio_token:
        is_configured = True
        active_provider = "twilio"
    elif provider == "msg91" and msg91_key:
        is_configured = True
        active_provider = "msg91"
    elif api_key:
        is_configured = True
        active_provider = provider or "generic"

    env = os.getenv("ENVIRONMENT", "development").lower()
    dev_otp = os.getenv("DEV_OTP", "false").lower() == "true" and env != "production"

    return {
        "provider_configured": is_configured,
        "provider_name": active_provider,
        "sender_id_configured": bool(os.getenv("SMS_SENDER_ID")),
        "template_id_configured": bool(os.getenv("SMS_TEMPLATE_ID")),
        "environment": env,
        "dev_otp_enabled": dev_otp
    }

def send_sms_otp(phone: str, code: str, purpose: str = "LOGIN", request_id: str = "") -> SMSDeliveryResult:
    """
    Dispatches production SMS OTP to the user's real Indian mobile number.
    Safely logs provider responses (NEVER logs OTP or API secrets).
    """
    masked = mask_phone(phone)
    clean_10 = phone.replace("+91", "").replace("+", "")
    env = os.getenv("ENVIRONMENT", "development").lower()
    is_prod = env == "production"
    dev_otp = os.getenv("DEV_OTP", "false").lower() == "true" and not is_prod

    provider = os.getenv("SMS_PROVIDER", "").strip().lower()
    api_key = os.getenv("SMS_API_KEY", "") or os.getenv("FAST2SMS_API_KEY", "")
    sender_id = os.getenv("SMS_SENDER_ID", "").strip()
    template_id = os.getenv("SMS_TEMPLATE_ID", "").strip()

    print(f"\n==================================================")
    print(f"[SMS OTP DISPATCH REQUEST]")
    print(f"Request ID: {request_id}")
    print(f"Recipient: {masked}")
    print(f"Purpose: {purpose}")
    print(f"Provider: {provider or 'NONE'}")
    print(f"Environment: {env.upper()}")
    print(f"==================================================")

    # ---------------------------------------------------------
    # 1. Fast2SMS Provider (India Optimized)
    # ---------------------------------------------------------
    if provider == "fast2sms" and api_key:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            
            # Use DLT route if template_id is specified, otherwise Quick OTP route
            if template_id and sender_id:
                payload_data = {
                    "route": "dlt",
                    "sender_id": sender_id,
                    "message": template_id,
                    "variables_values": code,
                    "numbers": clean_10
                }
            else:
                payload_data = {
                    "route": "otp",
                    "variables_values": code,
                    "numbers": clean_10
                }

            req_bytes = json.dumps(payload_data).encode("utf-8")
            req = urllib.request.Request(url, data=req_bytes, method="POST")
            req.add_header("authorization", api_key)
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=12) as resp:
                status_code = resp.status
                resp_text = resp.read().decode("utf-8")
                resp_data = json.loads(resp_text)

                if status_code == 200 and resp_data.get("return") is True:
                    prov_req_id = resp_data.get("request_id", "")
                    print(f"OTP request: SUCCESS")
                    print(f"Provider: ACCEPTED")
                    print(f"Provider message/request ID: {prov_req_id}")
                    print(f"==================================================\n")
                    return SMSDeliveryResult(
                        success=True,
                        delivery_status="SENT",
                        provider_name="fast2sms",
                        request_id=prov_req_id
                    )
                else:
                    err_msg = resp_data.get("message", ["Provider rejected OTP request"])[0] if isinstance(resp_data.get("message"), list) else str(resp_data.get("message"))
                    print(f"OTP request: FAILED")
                    print(f"Provider: REJECTED")
                    print("Provider error: SMS provider rejected the request.")
                    print(f"==================================================\n")
                    return SMSDeliveryResult(
                        success=False,
                        delivery_status="FAILED",
                        provider_name="fast2sms",
                        error_message=str(err_msg)
                    )

        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            print(f"OTP request: FAILED")
            print(f"Provider: HTTP {he.code}")
            print(f"Provider error: Fast2SMS HTTP Error {he.code}")
            print(f"==================================================\n")
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="fast2sms",
                error_message=f"Fast2SMS error code {he.code}"
            )
        except Exception as ex:
            print(f"OTP request: FAILED")
            print(f"Provider: EXCEPTION")
            print(f"Provider error: Connection failure to SMS gateway")
            print(f"==================================================\n")
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="fast2sms",
                error_message=f"Network error communicating with SMS provider"
            )

    # ---------------------------------------------------------
    # 2. Twilio Provider
    # ---------------------------------------------------------
    elif provider == "twilio":
        account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip() or api_key
        from_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()

        if not account_sid or not auth_token or not from_number:
            print(f"OTP request: FAILED")
            print(f"Provider error: Incomplete Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER required).")
            print(f"==================================================\n")
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="twilio",
                error_message="Twilio configuration is incomplete."
            )

        try:
            url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
            auth_str = f"{account_sid}:{auth_token}"
            auth_header = "Basic " + base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")
            
            body_text = f"Your ZOOR UP verification code is {code}. It expires in 5 minutes. Do not share this code."
            post_fields = urllib.parse.urlencode({
                "From": from_number,
                "To": phone,
                "Body": body_text
            }).encode("utf-8")

            req = urllib.request.Request(url, data=post_fields, method="POST")
            req.add_header("Authorization", auth_header)

            with urllib.request.urlopen(req, timeout=12) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                sid = resp_json.get("sid", "")
                print(f"OTP request: SUCCESS")
                print(f"Provider: ACCEPTED")
                print(f"Provider message/request ID: {sid}")
                print(f"==================================================\n")
                return SMSDeliveryResult(
                    success=True,
                    delivery_status="SENT",
                    provider_name="twilio",
                    request_id=sid
                )

        except urllib.error.HTTPError as he:
            print(f"OTP request: FAILED")
            print(f"Provider error: Twilio HTTP {he.code}")
            print(f"==================================================\n")
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="twilio",
                error_message=f"Twilio API Error {he.code}"
            )
        except Exception as ex:
            print(f"OTP request: FAILED")
            print(f"Provider error: Network exception calling Twilio")
            print(f"==================================================\n")
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="twilio",
                error_message="Failed to deliver SMS via Twilio."
            )

    # ---------------------------------------------------------
    # 3. MSG91 Provider
    # ---------------------------------------------------------
    elif provider == "msg91":
        auth_key = os.getenv("MSG91_AUTH_KEY", "").strip() or api_key
        t_id = template_id or os.getenv("MSG91_TEMPLATE_ID", "").strip()

        if not auth_key:
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="msg91",
                error_message="MSG91 credentials missing."
            )

        try:
            url = "https://control.msg91.com/api/v5/otp"
            query = {
                "template_id": t_id,
                "mobile": phone.replace("+", ""),
                "otp": code
            }
            if sender_id:
                query["sender"] = sender_id
            
            full_url = f"{url}?{urllib.parse.urlencode(query)}"
            req = urllib.request.Request(full_url, method="POST")
            req.add_header("authkey", auth_key)
            req.add_header("Content-Type", "application/json")

            with urllib.request.urlopen(req, timeout=12) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                req_id = resp_json.get("request_id") or resp_json.get("message", "")
                print(f"OTP request: SUCCESS")
                print(f"Provider: ACCEPTED")
                print(f"Provider message/request ID: {req_id}")
                print(f"==================================================\n")
                return SMSDeliveryResult(
                    success=True,
                    delivery_status="SENT",
                    provider_name="msg91",
                    request_id=str(req_id)
                )
        except Exception as ex:
            print(f"OTP request: FAILED")
            print(f"Provider error: MSG91 Error")
            print(f"==================================================\n")
            return SMSDeliveryResult(
                success=False,
                delivery_status="FAILED",
                provider_name="msg91",
                error_message="Failed to deliver SMS via MSG91."
            )

    # ---------------------------------------------------------
    # 4. No Real Provider Configured
    # ---------------------------------------------------------
    if is_prod:
        # FAIL FAST in production - NEVER pretend OTP was sent
        print(f"OTP request: FAILED")
        print(f"Provider: NOT CONFIGURED")
        print(f"Provider error: SMS provider is not configured. Real SMS delivery cannot be verified until the SMS provider is configured.")
        print(f"==================================================\n")
        return SMSDeliveryResult(
            success=False,
            delivery_status="FAILED",
            provider_name="none",
            error_message="SMS provider is not configured. Real SMS delivery cannot be verified until the SMS provider is configured."
        )

    # Development simulation ONLY when explicitly permitted by DEV_OTP=true
    if dev_otp:
        sim_id = f"sim_{secrets.token_hex(6)}"
        print(f"OTP request: SIMULATED (DEV_OTP=true)")
        print(f"Provider: DEV SIMULATOR")
        print(f"Provider message/request ID: {sim_id}")
        print(f"Notice: To receive real SMS on your phone, configure SMS_PROVIDER & SMS_API_KEY in .env")
        print(f"==================================================\n")
        return SMSDeliveryResult(
            success=True,
            delivery_status="DEV_SIMULATED",
            provider_name="dev_simulator",
            request_id=sim_id
        )

    # In dev without DEV_OTP=true and without credentials
    print(f"OTP request: FAILED")
    print(f"Provider error: SMS provider is not configured.")
    print(f"==================================================\n")
    return SMSDeliveryResult(
        success=False,
        delivery_status="FAILED",
        provider_name="none",
        error_message="SMS provider is not configured. Please configure your SMS provider in .env."
    )
