# ZOORUP
### *"Smart Business. Simple Management."*

ZoorUp is an enterprise-grade multi-business management SaaS platform tailored for local brick-and-mortar merchants (grocery stores, cafes, restaurants, salons, clothing boutiques, pharmacies, bakeries, electronics & repair workshops, and service businesses). It bridges in-store physical commerce with mobile-first digital ordering, QR standees, and a universal customer loyalty CRM.

---

## 🌟 Key Platform Highlights

1. **5 Role-Specific Workspaces**:
   - **Platform Super Admin** (`/admin`): SaaS MRR analytics, merchant approvals & suspension, global plan configuration, audit trails.
   - **Business Owner** (`/business`): Real-time store KPIs, 6-step order pipeline, products/services catalog, inventory valuation, GST billing, expenses, and supplier ledgers.
   - **Business Staff** (`/staff`): Cashier/POS terminal, live kitchen/counter dispatch, and inventory adjustments controlled by granular owner permissions.
   - **Customer** (`/customer`): Unique customer pass (`ZUP-CUS-000001`), Bronze-to-VIP tier progression, live order tracking, and rewards voucher redemption.
   - **Delivery Partner** (`/delivery`): Mobile-first driver dispatch, one-tap navigation, customer calling, proof-of-delivery confirmation, and payout ledger.

2. **Digital QR Standees & Public Storefront**:
   - Canvas-rendered, high-resolution QR standees with 1-click PNG download and print layout.
   - Mobile-first public menu (`/m/:slug`) requiring zero app installation for shoppers.
   - Live category filtering, instant quantity selectors, and sticky bottom checkout CTA.

3. **Universal Loyalty Program**:
   - Standard Rule: **₹100 spending = 10 reward points** (awarded automatically upon successful delivery).
   - Tiers: **Bronze** (0–499), **Silver** (500–1,499), **Gold** (1,500–4,999), **Platinum** (5,000–9,999), **VIP** (10,000+).

4. **Production Architecture & Multi-Device Responsiveness**:
   - Built with React, Vite, React Router 7, and Lucide icons.
   - Supabase client integration with smart local reactive storage fallback for instant zero-config testing.
   - Responsive layouts tested from 320px mobile screens to 2560px ultra-wide monitors.
   - Large touch targets (≥ 44px), mobile drawers, and bottom sheet modals.

---

## 📂 Project Structure

```
/
├── .env.example                     # Environment template (Vite + Supabase)
├── index.html                       # HTML template with Google Fonts (Plus Jakarta Sans)
├── package.json                     # NPM packages & build scripts
├── vite.config.js                   # Vite configuration
├── supabase/
│   └── schema.sql                   # Multi-tenant PostgreSQL schema, RLS & triggers
└── src/
    ├── main.jsx                     # Entry point & design system loader
    ├── App.jsx                      # Master routing & role-guarded pipelines
    ├── context/
    │   ├── AuthContext.jsx          # Session state & demo persona switcher
    │   ├── ToastContext.jsx         # Global notifications & alert popups
    │   └── CartContext.jsx          # Persistent digital menu shopping cart
    ├── services/
    │   ├── supabase.js              # Supabase JS client initializer
    │   ├── storageSeed.js           # Reactive storage database & seed data
    │   ├── authService.js           # Authentication & multi-step registration
    │   ├── businessService.js       # Store statistics & profile management
    │   ├── customerService.js       # Customer CRUD & ZUP-CUS ID generator
    │   ├── orderService.js          # Order state pipeline & point allocation
    │   ├── productService.js        # Goods & services catalog with stock adjust
    │   ├── staffService.js          # Staff management & granular permissions
    │   ├── billingService.js        # POS invoices & GST calculations
    │   ├── inventoryService.js      # Stock valuation & depletion alerts
    │   ├── financeService.js        # Expenses & supplier credit management
    │   ├── deliveryService.js       # Driver dispatch & earnings calculations
    │   ├── loyaltyService.js        # Tiers, rewards catalog & coupon validation
    │   ├── chatService.js           # Real-time customer ↔ merchant messaging
    │   └── adminService.js          # Platform telemetry & merchant moderation
    ├── components/
    │   ├── ui/                      # Button, Input, Select, Card, Badge, Avatar, Table,
    │   │                            # Modal, Drawer, States (Empty/Loading/Error), Controls
    │   ├── qr/                      # QRGenerator (Canvas) & QRScannerComponent (html5-qrcode)
    │   ├── charts/                  # SalesBarChart & CategoryDistribution
    │   └── layout/                  # Sidebar, Topbar, MobileBottomNav, AppLayout, ProtectedRoute
    ├── pages/
    │   ├── auth/                    # AuthHub, BusinessLogin, BusinessSignup (4 steps),
    │   │                            # CustomerLogin, CustomerSignup, StaffLogin, DeliveryLogin,
    │   │                            # AdminLogin, ForgotPassword
    │   ├── business/                # BusinessDashboard, Profile, Customers, Staff, Products,
    │   │                            # Orders, Billing, Payments, Inventory, Expenses, Suppliers,
    │   │                            # Delivery, QRMenu, QRScanner, Loyalty, Offers, Chat,
    │   │                            # Notifications, Analytics, Reports, Subscription, Settings
    │   ├── customer/                # CustomerHome (QR Pass), Businesses, Orders, Loyalty,
    │   │                            # Chat, Profile
    │   ├── delivery/                # DeliveryDashboard, DeliveryHistory, DeliveryProfile
    │   ├── admin/                   # AdminDashboard, Businesses, Plans, Reports, Settings
    │   └── public/                  # PublicLanding, PublicQRMenu, PublicCheckout, OrderSuccess
    └── styles/
        ├── index.css                # CSS variables, tokens, fluid typography, dark SaaS theme
        └── components.css           # Modular component classes, bottom sheet, mobile nav
```

---

## 🚀 Installation & Setup

### 1. Prerequisites
- Node.js `v18+` or `v24+`
- NPM `v9+` or `v11+`

### 2. Install Dependencies
```bash
npm install
```

Installed packages:
- `react`, `react-dom` (React 19)
- `react-router-dom` (v7)
- `@supabase/supabase-js` (Supabase Client)
- `lucide-react` (Icon Library)
- `qrcode.react` (Canvas QR Generator)
- `html5-qrcode` (Real Camera QR Scanner)
- `canvas-confetti` (Reward & Order Celebrations)

### 3. Configure Environment Variables
Copy `.env.example` to `.env` for local configuration:
```bash
cp .env.example .env
```
Configure backend secrets only in the backend runtime environment. Only `VITE_*` and `EXPO_PUBLIC_*` values are bundled into client apps and must contain public configuration only. The production API host must be supplied as `VITE_API_URL` for web or `EXPO_PUBLIC_API_URL` for mobile; no production API host is assumed here.
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_NAME=ZoorUp
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for Production
```bash
npm run build
```

---

## Demo Data

Local demonstration personas and seeded records are for development only. Never reuse seeded credentials or local database records in a production deployment.

---

## 🗄️ Backend APIs & Expected Supabase RPCs

When connecting to a live Supabase project, execute `supabase/schema.sql`. The frontend expects:

### REST API Endpoints:
- `GET/POST/PATCH/DELETE /rest/v1/businesses` (Filter by `status`, `category`, `slug`)
- `GET/POST/PATCH/DELETE /rest/v1/customers` (Filter by `customer_id`, `rank`, `business_id`)
- `GET/POST/PATCH/DELETE /rest/v1/products` (Filter by `business_id`, `type`, `active`)
- `GET/POST/PATCH/DELETE /rest/v1/orders` (Filter by `business_id`, `customer_id`, `status`)
- `GET/POST/PATCH/DELETE /rest/v1/invoices` (Filter by `business_id`, `payment_status`)
- `GET/POST/PATCH/DELETE /rest/v1/expenses` (Filter by `business_id`, `category`)
- `GET/POST/PATCH/DELETE /rest/v1/suppliers` (Filter by `business_id`)
- `GET/POST/PATCH/DELETE /rest/v1/offers` (Filter by `business_id`, `active`)
- `GET/POST/PATCH/DELETE /rest/v1/messages` (Filter by `business_id`, `customer_id`)

### Database RPCs:
1. `award_delivery_loyalty_points(p_order_id TEXT)`: Calculates 10 points per ₹100 upon status transitioning to `DELIVERED`.
2. `update_customer_rank()`: Automatically updates member tier (Bronze -> Silver -> Gold -> Platinum -> VIP) on points insert/update.
#   D e p l o y   t r i g g e r  
    
    
 