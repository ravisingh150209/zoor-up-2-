"""
ZOOR UP Pydantic Data Models & Schemas
"""
from typing import Optional, Dict, Any, List, Literal
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime

# User Roles
ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_BUSINESS_OWNER = "BUSINESS_OWNER"
ROLE_STAFF = "STAFF"
ROLE_CUSTOMER = "CUSTOMER"

# Business Statuses
STATUS_ACTIVE = "ACTIVE"
STATUS_SUSPENDED = "SUSPENDED"
STATUS_DEACTIVATED = "DEACTIVATED"

class BusinessOwnerRegisterRequest(BaseModel):
    name: Optional[str] = ""
    owner_name: Optional[str] = ""
    email: str
    phone: Optional[str] = ""
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class CustomerRegisterRequest(BaseModel):
    name: Optional[str] = ""
    phone: Optional[str] = ""
    email: str
    password: str

class OTPRequest(BaseModel):
    phone: str
    purpose: Optional[str] = "LOGIN"

class OTPVerifyRequest(BaseModel):
    phone: str
    code: str
    purpose: Optional[str] = "LOGIN"
    name: Optional[str] = None

class GoogleAuthRequest(BaseModel):
    token: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    google_id: Optional[str] = None
    avatar: Optional[str] = None
    role: Optional[str] = "CUSTOMER"

class OnboardingStepRequest(BaseModel):
    step: int
    data: Dict[str, Any]

class OnboardingBusinessRequest(BaseModel):
    name: Optional[str] = ""
    category: Optional[str] = ""
    owner_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    postal_code: Optional[str] = ""
    opening_hours: Optional[Dict[str, Any]] = None
    logo: Optional[str] = None
    logo_url: Optional[str] = None
    cover_photo_url: Optional[str] = None
    gallery: Optional[List[Dict[str, Any]]] = None

class CustomerProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    photo: Optional[str] = None
    avatar: Optional[str] = None
    profile_image_url: Optional[str] = None
    dob: Optional[str] = None
    birthday: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    bio: Optional[str] = None
    notes: Optional[str] = None

class QRResolveRequest(BaseModel):
    qr_data: str

class QRCheckInRequest(BaseModel):
    business_id: str
    notes: Optional[str] = "QR Code Check-in"
    reference_id: Optional[str] = None

class QRConnectRequest(BaseModel):
    business_id: str
    type: Optional[str] = "business"
    table_id: Optional[str] = None
    source: Optional[str] = "qr_scan"
    notes: Optional[str] = None

class BusinessInviteCreateRequest(BaseModel):
    business_id: str
    email: Optional[str] = None
    name: Optional[str] = None
    customer_id: Optional[str] = None
    expires_hours: Optional[int] = 48

class BusinessInviteAcceptRequest(BaseModel):
    invite_token: str

class VoucherCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    discount_type: str = "PERCENTAGE"
    discount_value: float = 0
    minimum_order_value: float = 0
    usage_limit: int = 1
    total_usage_limit: Optional[int] = None
    start_at: Optional[str] = None
    expires_at: Optional[str] = None
    audience_type: str = "ALL_ELIGIBLE"
    selected_customer_ids: Optional[List[str]] = None
    status: str = "ACTIVE"

class VoucherUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    minimum_order_value: Optional[float] = None
    usage_limit: Optional[int] = None
    total_usage_limit: Optional[int] = None
    start_at: Optional[str] = None
    expires_at: Optional[str] = None
    audience_type: Optional[str] = None
    selected_customer_ids: Optional[List[str]] = None
    status: Optional[str] = None

class CustomerProfileResponse(BaseModel):
    id: str
    customer_id: str
    name: str
    phone: str
    email: str
    points: int = 0
    lifetime_points: int = 0
    total_visits: int = 0
    total_spent: float = 0.0
    stamps: int = 0
    segment: str = "NEW"
    membership_tier: str = "MEMBER"
    address: Optional[str] = ""
    avatar: Optional[str] = None
    profile_image_url: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    bio: Optional[str] = None

class PaymentInitiateRequest(BaseModel):
    plan_id: str
    billing_interval: Optional[str] = "monthly"
    business_id: Optional[str] = None

class PaymentVerifyRequest(BaseModel):
    transaction_reference: Optional[str] = None
    utr: Optional[str] = None
    status: Optional[str] = "paid"
    notes: Optional[str] = None

class CancelAutoRenewRequest(BaseModel):
    business_id: str
    subscription_id: Optional[str] = None

class TableCreateRequest(BaseModel):
    table_number: str
    capacity: int = 4
    location: Optional[str] = "Main Dining"
    is_active: bool = True
    notes: Optional[str] = ""

class TableUpdateRequest(BaseModel):
    table_number: Optional[str] = None
    capacity: Optional[int] = None
    location: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class TableSettingsRequest(BaseModel):
    enabled: bool = True
    slot_duration_mins: int = 90
    buffer_mins: int = 15
    opening_time: str = "10:00"
    closing_time: str = "22:30"
    max_party_size: int = 16
    max_advance_days: int = 14

class BookingCreateRequest(BaseModel):
    business_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = ""
    booking_date: Optional[str] = None
    date: Optional[str] = None
    booking_time: Optional[str] = None
    time: Optional[str] = None
    party_size: Optional[int] = None
    guests: Optional[int] = None
    table_id: Optional[str] = None
    special_notes: Optional[str] = ""
    notes: Optional[str] = ""

class BookingStatusUpdateRequest(BaseModel):
    status: str
    notes: Optional[str] = None

class ProductCreateRequest(BaseModel):
    name: str
    category: Optional[str] = "General"
    price: float
    discount_price: Optional[float] = None
    description: Optional[str] = ""
    type: Optional[str] = "product"
    image: Optional[str] = None
    image_url: Optional[str] = None
    stock: Optional[int] = 20
    sku: Optional[str] = None
    barcode: Optional[str] = None
    active: Optional[bool] = True


class OrderItemInput(BaseModel):
    product_id: str = Field(..., min_length=1, max_length=128)
    quantity: int = Field(..., ge=1, le=100)

    class Config:
        extra = "forbid"


class OrderCreateRequest(BaseModel):
    business_id: str = Field(..., min_length=1, max_length=128)
    items: List[OrderItemInput] = Field(..., min_items=1, max_items=50)
    order_type: Literal["DINE_IN", "TAKEAWAY"]
    payment_method: Literal["UPI", "CASH"] = "UPI"
    table_id: Optional[str] = None
    table_number: Optional[str] = Field(None, max_length=64)
    customer_name: Optional[str] = Field(None, max_length=120)
    customer_phone: Optional[str] = Field(None, max_length=32)
    idempotency_key: str = Field(..., min_length=16, max_length=128)

    class Config:
        extra = "forbid"


class OrderStatusUpdateRequest(BaseModel):
    status: Literal["CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"]

    class Config:
        extra = "forbid"

class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = None
    description: Optional[str] = None
    type: Optional[str] = None
    image: Optional[str] = None
    image_url: Optional[str] = None
    stock: Optional[int] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    active: Optional[bool] = None

