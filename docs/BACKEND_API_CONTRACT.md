# ZOORUP Backend API Contract & Developer Reference

> **Tagline:** "Smart Business. Simple Management."  
> **Backend Architecture:** Supabase (PostgreSQL 15), Supabase Auth, Row Level Security (RLS), Supabase Storage, Supabase Realtime, and Deno Edge Functions.  
> **Client SDK:** `@supabase/supabase-js`

---

## Table of Contents

1. [Architectural Overview & Security Principles](#architectural-overview--security-principles)
2. [User Roles & Authorization Model](#user-roles--authorization-model)
3. [Authentication Flows](#authentication-flows)
   - [Business Owner / Staff / Delivery Partner / Admin](#business-owner--staff--delivery-partner--admin)
   - [Customer Authentication (Customer ID + Password)](#customer-authentication-customer-id--password)
4. [Database Tables Reference](#database-tables-reference)
5. [Database RPC / Stored Procedures](#database-rpc--stored-procedures)
6. [Supabase Edge Functions](#supabase-edge-functions)
   - [`create-business`](#create-business)
   - [`create-customer`](#create-customer)
   - [`customer-login`](#customer-login)
   - [`create-store-staff`](#create-store-staff)
   - [`create-razorpay-order`](#create-razorpay-order)
   - [`verify-razorpay-payment`](#verify-razorpay-payment)
   - [`razorpay-webhook`](#razorpay-webhook)
   - [`send-notification`](#send-notification)
   - [`resolve-qr`](#resolve-qr)
   - [`generate-business-qr`](#generate-business-qr)
   - [`subscription-payment`](#subscription-payment)
   - [`admin-business-action`](#admin-business-action)
7. [Supabase Realtime Subscriptions](#supabase-realtime-subscriptions)
8. [Supabase Storage Buckets & Policies](#supabase-storage-buckets--policies)
9. [Error Codes & Standard Responses](#error-codes--standard-responses)

---

## Architectural Overview & Security Principles

1. **Zero Client Trust:** Frontend totals, discounts, loyalty points, roles, and inventory counts are never trusted. All calculations occur inside PostgreSQL RPCs or server-side Edge Functions.
2. **Deterministic Multi-Tenant Isolation:** PostgreSQL Row Level Security (RLS) guarantees that businesses can only access their own records, customers can only access their own profiles/orders/points, delivery partners can only access their assigned deliveries, and store staff access is restricted by permission flags.
3. **Cryptographic Identity Protection:** Customer email addresses are generated server-side (`cus_<phone>_<timestamp>@zoorup.internal`) so end-customers authenticate strictly using their visible Customer ID (e.g., `ZUP-CUS-000001`) or Phone Number plus Password.
4. **Server-Generated Identifiers:**
   - **Stores:** `ZUP-STORE-0001`
   - **Customers:** `ZUP-CUS-000001`
   - **Orders:** `ZUP-ORD-000001`
   - **Invoices:** `INV-000001`

---

## User Roles & Authorization Model

| Role | Description | Access Scope |
| :--- | :--- | :--- |
| `admin` | Platform Super-Admin | Platform-wide access; manages stores, plans, categories, settings, and audit logs. |
| `store_owner` | Registered Business Owner | Full control over their owned store, products, staff, billing, inventory, and analytics. |
| `store_staff` | Delegated Business Employee | Granular access to permitted store modules (`dashboard`, `orders`, `products`, `billing`, etc.). |
| `customer` | End Consumer | Access to public store catalogs, own profile, own carts, own orders, loyalty points, and conversations. |
| `delivery_partner` | Logistics Driver | Access to available orders for pickup, assigned deliveries, and delivery tracking updates. |

---

## Authentication Flows

### Business Owner / Staff / Delivery Partner / Admin

Standard Supabase Auth using email + password:
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'owner@business.com',
  password: 'UserSecurePassword123!',
});

// Fetch Profile & Role
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', data.user.id)
  .single();
```

### Customer Authentication (Customer ID + Password)

Customers do not need an email. They log in via the `customer-login` Edge Function:

```typescript
const { data, error } = await supabase.functions.invoke('customer-login', {
  body: {
    identifier: 'ZUP-CUS-000001', // Or phone: '+919876543210'
    password: 'CustomerPassword123!',
  },
});

if (data?.session) {
  // Set the Supabase session on the client
  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
```

---

## Database Tables Reference

### 1. `profiles`
User profiles synced with Supabase Auth users (`auth.users.id = profiles.id`).
- `id` (UUID, PK)
- `full_name` (TEXT)
- `phone` (TEXT, UNIQUE)
- `avatar_url` (TEXT)
- `role` (`user_role`: `admin`, `store_owner`, `store_staff`, `customer`, `delivery_partner`)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 2. `stores`
Business entities registered on the platform.
- `id` (UUID, PK)
- `store_id` (TEXT, UNIQUE, e.g. `ZUP-STORE-0001`)
- `owner_id` (UUID, FK -> `profiles.id`)
- `business_name` (TEXT)
- `business_category_id` (UUID, FK -> `business_categories.id`)
- `logo_url`, `cover_url`, `description` (TEXT)
- `phone`, `email`, `address`, `city`, `state`, `pincode` (TEXT)
- `latitude`, `longitude` (DECIMAL)
- `is_active` (BOOLEAN, default `true`)
- `is_approved` (BOOLEAN, default `true`)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 3. `customers`
Customer records tied to authentication and loyalty tracking.
- `id` (UUID, PK)
- `customer_id` (TEXT, UNIQUE, e.g. `ZUP-CUS-000001`)
- `profile_id` (UUID, FK -> `profiles.id`)
- `auth_user_id` (UUID)
- `full_name`, `phone` (TEXT)
- `avatar_url` (TEXT)
- `points` (INT, default `0`)
- `rank` (`customer_rank`: `Bronze`, `Silver`, `Gold`, `Platinum`, `VIP`)
- `is_premium` (BOOLEAN, default `false`)
- `login_email` (TEXT, internal synthesized email)
- `qr_token` (TEXT, unique customer check-in token)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### 4. `store_customers`
Many-to-many relationship between stores and customers.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores.id`)
- `customer_id` (UUID, FK -> `customers.id`)
- `added_via` (TEXT: `qr_scan`, `order`, `manual`, `signup`)
- `created_at` (TIMESTAMPTZ)
- *Unique Constraint:* `(store_id, customer_id)`

### 5. `store_staff`
Staff members assigned to a store with granular role permissions.
- `id` (UUID, PK)
- `store_id` (UUID, FK -> `stores.id`)
- `profile_id` (UUID, FK -> `profiles.id`)
- `role` (TEXT, default `'store_staff'`)
- `permissions` (TEXT[], e.g., `['dashboard', 'orders', 'products', 'billing', 'inventory', 'expenses', 'delivery', 'chat', 'reports']`)
- `is_active` (BOOLEAN, default `true`)
- `created_at` (TIMESTAMPTZ)

### 6. `products` & `services`
- `products`: `id`, `store_id`, `category_id`, `name`, `description`, `sku`, `barcode`, `price`, `discount`, `tax`, `image_url`, `stock`, `is_active`, timestamps.
- `services`: `id`, `store_id`, `category_id`, `name`, `description`, `price`, `duration_minutes`, `image_url`, `is_active`, timestamps.

### 7. `orders` & `order_items`
- `orders`: `id`, `order_number` (`ZUP-ORD-000001`), `customer_id`, `store_id`, `delivery_partner_id`, `status` (`pending`, `confirmed`, `preparing`, `ready`, `assigned`, `picked_up`, `out_for_delivery`, `delivered`, `cancelled`), `subtotal`, `discount`, `tax`, `delivery_fee`, `total`, `delivery_address`, `payment_status` (`pending`, `paid`, `failed`, `refunded`), timestamps.
- `order_items`: `id`, `order_id`, `product_id`, `product_name` (snapshot), `quantity`, `unit_price`, `discount`, `tax`, `total_price`.

### 8. `invoices` & `invoice_items`
Automatic billing and tax records generated for completed orders or direct billing.
- `invoices`: `id`, `invoice_number` (`INV-000001`), `store_id`, `customer_id`, `order_id`, `subtotal`, `tax`, `discount`, `total`, `paid_amount`, `balance`, `status` (`draft`, `issued`, `partially_paid`, `paid`, `cancelled`), `created_at`.

### 9. `payments`
Razorpay and manual payment logs.
- `id`, `order_id`, `store_id`, `customer_id`, `gateway` (`razorpay`, `cash`, `upi`), `gateway_order_id`, `gateway_payment_id`, `amount`, `currency`, `status`, `payment_method`, timestamps.

### 10. `inventory` & `inventory_transactions`
Auditable stock adjustments with prevention of negative inventory.
- `inventory_transactions`: `id`, `store_id`, `product_id`, `type` (`purchase`, `sale`, `manual_adjustment`, `damaged`, `returned`), `quantity`, `reference_id`, `notes`, `created_by`, `created_at`.

### 11. `loyalty_rules`, `customer_points`, `rewards`
- `customer_points`: `id`, `customer_id`, `points`, `reason`, `order_id` (Unique compound index on `order_id + reason` prevents duplicate points), `created_at`.
- `rewards`: `id`, `store_id`, `name`, `description`, `points_required`, `is_active`, `created_at`.

### 12. `coupons` & `coupon_usage`
Coupons with usage counters, maximum discount caps, minimum order value, and date ranges.

### 13. `conversations`, `conversation_members`, `messages`
Realtime two-way messaging between customers and store staff/owners with unread tracking and attachments.

### 14. `subscriptions` & `subscription_plans`
SaaS plans (`FREE` ₹0, `BASIC` ₹299, `PRO` ₹799, `PREMIUM` ₹1499) with server-side limit enforcement on products, customers, staff, and analytics.

---

## Database RPC / Stored Procedures

All stored procedures execute with `SECURITY DEFINER` and `search_path = public`.

### 1. `place_customer_order`
Atomic order placement that verifies product prices, calculates server-side tax/discounts, decrements stock with `FOR UPDATE` row locks, clears the cart, and creates an invoice.

```typescript
const { data, error } = await supabase.rpc('place_customer_order', {
  p_customer_id: 'uuid-of-customer',
  p_store_id: 'uuid-of-store',
  p_coupon_code: 'WELCOME10', // Optional, or null
  p_delivery_address: '123 Park Street, Bengaluru, Karnataka 560001',
  p_payment_method: 'online', // or 'cash'
  p_notes: 'Ring bell twice'
});

// Output format:
// {
//   "success": true,
//   "order_id": "...",
//   "order_number": "ZUP-ORD-000001",
//   "total": 520.00,
//   "status": "pending"
// }
```

### 2. `add_order_points`
Awards loyalty points strictly when an order status is `'delivered'`. Prevents duplicate awarding. Automatically calculates customer rank (`Bronze`, `Silver`, `Gold`, `Platinum`, `VIP`).

```typescript
const { data, error } = await supabase.rpc('add_order_points', {
  p_order_id: 'uuid-of-delivered-order'
});

// Output format:
// {
//   "success": true,
//   "points_added": 50,
//   "new_total": 350,
//   "rank": "Bronze"
// }
```

### 3. `update_store_order_status`
Transitions order status, updates timestamps, handles cancellation inventory restock, and auto-awards points upon `'delivered'`.

```typescript
const { data, error } = await supabase.rpc('update_store_order_status', {
  p_order_id: 'uuid-of-order',
  p_new_status: 'preparing' // 'confirmed', 'ready', 'delivered', etc.
});
```

### 4. `get_delivery_orders` & `accept_delivery_order`
Allows delivery partners to discover available orders and accept them.

```typescript
// Fetch available orders within the partner's range
const { data: availableOrders } = await supabase.rpc('get_delivery_orders', {
  p_status: 'ready'
});

// Partner accepts order
const { data: result } = await supabase.rpc('accept_delivery_order', {
  p_order_id: 'uuid-of-order',
  p_delivery_partner_id: 'uuid-of-delivery-partner'
});
```

### 5. `resolve_qr_token`
Resolves any QR token (`store_profile`, `digital_menu`, `catalogue`, `loyalty_checkin`, `customer_id`) and returns safe public payload without leaking private data.

```typescript
const { data, error } = await supabase.rpc('resolve_qr_token', {
  p_token: 'zup_dig_a8f93b...'
});
```

### 6. `apply_coupon`
Validates coupon against store, minimum order value, validity dates, and usage limits. Returns computed discount.

```typescript
const { data, error } = await supabase.rpc('apply_coupon', {
  p_store_id: 'uuid-of-store',
  p_code: 'FLAT50',
  p_order_amount: 500.00
});

// Output format:
// {
//   "valid": true,
//   "discount": 50.00,
//   "message": "Coupon applied successfully"
// }
```

### 7. `redeem_reward`
Verifies customer point balance, deducts required points, and issues reward redemption.

```typescript
const { data, error } = await supabase.rpc('redeem_reward', {
  p_customer_id: 'uuid-of-customer',
  p_reward_id: 'uuid-of-reward'
});
```

### 8. `get_store_dashboard` & `get_business_analytics`
Returns total revenue, daily revenue, active orders, customer counts, low stock alerts, and top-selling products.

```typescript
const { data: dashboard } = await supabase.rpc('get_store_dashboard', {
  p_store_id: 'uuid-of-store'
});
```

---

## Supabase Edge Functions

Base URL: `https://<PROJECT-REF>.functions.supabase.co/<FUNCTION-NAME>`

### `create-business`
- **Method:** `POST`
- **Auth:** Bearer Token (Authenticated `store_owner` user)
- **Request Body:**
  ```json
  {
    "business_name": "Royal Cafe & Roastery",
    "business_category_id": "uuid-category",
    "phone": "+919876543210",
    "email": "royal@cafe.com",
    "address": "45 Indiranagar 100ft Road",
    "city": "Bengaluru",
    "state": "Karnataka",
    "pincode": "560038"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "store": {
      "id": "uuid-store",
      "store_id": "ZUP-STORE-0001",
      "business_name": "Royal Cafe & Roastery",
      "is_active": true
    },
    "qr_codes": [...]
  }
  ```

### `create-customer`
- **Method:** `POST`
- **Auth:** Public or Authenticated Store
- **Request Body:**
  ```json
  {
    "full_name": "Rohan Mehra",
    "phone": "+919811122233",
    "password": "SecurePassword123!",
    "store_id": "uuid-store"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "customer": {
      "id": "uuid-customer",
      "customer_id": "ZUP-CUS-000001",
      "full_name": "Rohan Mehra",
      "phone": "+919811122233",
      "points": 0,
      "rank": "Bronze"
    }
  }
  ```

### `customer-login`
- **Method:** `POST`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "identifier": "ZUP-CUS-000001",
    "password": "SecurePassword123!"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "session": {
      "access_token": "ey...",
      "refresh_token": "..."
    },
    "customer": {
      "id": "uuid-customer",
      "customer_id": "ZUP-CUS-000001",
      "full_name": "Rohan Mehra",
      "points": 120,
      "rank": "Bronze"
    }
  }
  ```

### `create-store-staff`
- **Method:** `POST`
- **Auth:** Store Owner or Admin Bearer Token
- **Request Body:**
  ```json
  {
    "store_id": "uuid-store",
    "full_name": "Kavita Rao",
    "email": "kavita@store.com",
    "phone": "+919876543299",
    "password": "StaffPassword123!",
    "permissions": ["dashboard", "orders", "products", "billing", "inventory"]
  }
  ```

### `create-razorpay-order`
- **Method:** `POST`
- **Auth:** Bearer Token (Customer or Store Owner)
- **Request Body:**
  ```json
  {
    "order_id": "uuid-of-order"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "key_id": "rzp_live_...",
    "razorpay_order_id": "order_Hbk29...",
    "amount": 49900,
    "currency": "INR"
  }
  ```

### `verify-razorpay-payment`
- **Method:** `POST`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "order_id": "uuid-of-order",
    "razorpay_payment_id": "pay_29SkJS9...",
    "razorpay_order_id": "order_Hbk29...",
    "razorpay_signature": "9ef8a902b4c12..."
  }
  ```

### `razorpay-webhook`
- **Method:** `POST`
- **Headers:** `x-razorpay-signature`
- **Payload:** Direct Razorpay Webhook Event (`payment.captured`, `order.paid`, `payment.failed`)

### `send-notification`
- **Method:** `POST`
- **Auth:** Bearer Token (Admin / Store Owner / Staff)
- **Request Body:**
  ```json
  {
    "user_id": "uuid-of-recipient-profile",
    "type": "order_update",
    "title": "Order Out for Delivery!",
    "message": "Your meal is on the way with Amit.",
    "data": { "order_id": "uuid-order" }
  }
  ```

### `resolve-qr`
- **Method:** `POST`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "token": "zup_dig_4f88e1a0b3...",
    "user_agent": "Mozilla/5.0..."
  }
  ```

### `generate-business-qr`
- **Method:** `POST`
- **Auth:** Store Owner or Staff Bearer Token
- **Request Body:**
  ```json
  {
    "store_id": "uuid-store",
    "qr_type": "digital_menu",
    "metadata": { "table_number": 4 }
  }
  ```

### `subscription-payment`
- **Method:** `POST`
- **Auth:** Store Owner Bearer Token
- **Request Body:**
  ```json
  {
    "action": "create_order",
    "store_id": "uuid-store",
    "plan_id": "uuid-plan-basic",
    "billing_cycle": "monthly"
  }
  ```

### `admin-business-action`
- **Method:** `POST`
- **Auth:** Super-Admin Bearer Token
- **Request Body:**
  ```json
  {
    "action": "approve",
    "store_id": "uuid-store",
    "reason": "Documents verified"
  }
  ```

---

## Supabase Realtime Subscriptions

Clients can subscribe to realtime events using `@supabase/supabase-js`. RLS policies apply automatically to Realtime broadcasts:

### 1. Order Status Updates (Customer & Store Staff)
```typescript
const orderChannel = supabase
  .channel('public:orders')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${currentOrderId}`,
    },
    (payload) => {
      console.log('Order status updated:', payload.new.status);
    }
  )
  .subscribe();
```

### 2. Live Chat Messages
```typescript
const chatChannel = supabase
  .channel(`chat:${conversationId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      console.log('New message received:', payload.new);
    }
  )
  .subscribe();
```

### 3. Delivery Partner Live GPS Tracking
```typescript
const trackingChannel = supabase
  .channel(`tracking:${orderId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'delivery_tracking',
      filter: `order_id=eq.${orderId}`,
    },
    (payload) => {
      console.log('Delivery location:', payload.new.latitude, payload.new.longitude);
    }
  )
  .subscribe();
```

---

## Supabase Storage Buckets & Policies

| Bucket Name | Access Level | Permitted Uploaders | Path Convention |
| :--- | :--- | :--- | :--- |
| `business-logos` | Public Read | Store Owner / Staff | `stores/{store_id}/logo.png` |
| `business-covers` | Public Read | Store Owner / Staff | `stores/{store_id}/cover.png` |
| `product-images` | Public Read | Store Owner / Staff | `products/{store_id}/{product_id}.jpg` |
| `customer-avatars`| Public Read | Profile Owner | `avatars/{user_id}/avatar.jpg` |
| `invoice-attachments` | Private | Store Owner / Staff | `invoices/{store_id}/{invoice_id}.pdf` |
| `chat-attachments` | Conversation Members | Conversation Members | `chat/{conversation_id}/{filename}` |
| `expense-receipts` | Private | Store Owner / Staff | `expenses/{store_id}/{receipt_id}.jpg` |

---

## Error Codes & Standard Responses

All Edge Functions and RPC endpoints return structured JSON errors:

```json
{
  "error": "Error description message",
  "code": "SPECIFIC_ERROR_CODE",
  "details": {}
}
```

Common status codes:
- `400 Bad Request`: Missing required payload fields or invalid format.
- `401 Unauthorized`: Missing or invalid session JWT.
- `403 Forbidden`: User does not possess the required role or store permission.
- `404 Not Found`: Target entity (store, product, order, coupon) not found.
- `409 Conflict`: Unique constraint violation (e.g., duplicate customer association or duplicate coupon code).
- `422 Unprocessable Entity`: Business logic failed (e.g., insufficient stock or coupon expired).
- `500 Internal Server Error`: Unexpected database or runtime error.
