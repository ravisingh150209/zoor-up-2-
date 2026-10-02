# Core Data Source Migration Map

This map records the inspected web, Expo, FastAPI, and database paths before migration. It is not evidence of live MongoDB persistence. Production verification remains blocked until MongoDB Atlas is configured and reachable.

## Target

```text
React web ───────────────────┐
Expo WebView shell → React web ├─ HTTPS FastAPI API ─ MongoDB
                              ┘
```

Firebase Auth/Firestore records are not deleted or migrated automatically. Existing Firebase data must be backed up and reconciled before any one-time migration is approved.

## Feature Map

| Feature | Web source and fallback | Expo source before migration | Backend contract / MongoDB target | Migration status |
| --- | --- | --- | --- | --- |
| Users and authentication | Server auth endpoints; browser storage contains only the backend token/user session cache; `localDB` auth is development-only and blocked in production builds | Active Expo WebView uses the web auth flow; migrated native source uses backend JWT in SecureStore | `/api/auth/*`; Mongo `users`, `customers`, `businesses` | Source paths use backend identity; active hosted WebView bundle and API URL are not verified |
| Customer profile | `/api/customer/profile` and `/api/customer/home`; local profile fallback is blocked in production | WebView uses web API; migrated native service uses the same endpoints | Mongo `users`, `customers` | Backend path exists; Mongo persistence is unverified |
| Business profile | Public/owner profile and onboarding APIs; production mutations use authenticated routes | WebView uses web API; migrated native service uses `/api/business/profile` | Mongo `businesses`, `users` | Production local profile reads/writes are blocked |
| Customer-business relationship | QR/connect/check-in API; local collection access blocked in production | WebView uses web QR API; migrated native check-in uses authenticated API | Mongo `customer_businesses`, unique compound index on `(customer_id, business_id)` | Link/disconnect/reconnect and CRM tenant tests pass against mock DB; Atlas index is unverified |
| Loyalty, stamps, points, visits | Per-business loyalty/check-in APIs; production local collections are blocked | WebView uses web API; migrated native stamp screens use `/api/loyalty/{business_id}` and `/api/customer/visits/checkin` | Mongo `loyalty`, `loyalty_transactions`, `visits` | Stamp target, scoped points, check-in, and redemption APIs are implemented; Atlas persistence is unverified |
| Offers and vouchers | Voucher endpoints exist; legacy web offers still use `localDB` and are blocked in production | No native offer flow | Mongo `vouchers`, `customer_vouchers` | Voucher API exists; web offer service still needs migration to that contract |
| Rewards redemption | Voucher redemption and new stamp-reward endpoint are backend-backed; legacy points reward catalog/claim history uses local storage and is blocked in production | Migrated native stamp rewards use owner-scoped backend redemption | Mongo `loyalty`, `loyalty_transactions`, `vouchers`, `customer_vouchers` | Stamp reward path exists; general points reward catalog/claim API remains a gap |
| Orders | `orderService` uses backend APIs; browser storage stores only order-attempt idempotency metadata | Expo WebView uses web flow; no separate native order screen | Mongo `orders`, `/api/orders/*` | Backend-backed; Mongo persistence is unverified |
| Tables and bookings | API-backed table/booking methods and settings; local fallback blocked in production | Expo WebView uses web flow; no separate native table screen | Mongo `tables`, `table_settings`, `table_bookings`, `table_reservations` | Booking/settings API and tenant tests exist; Mongo persistence is unverified |
| Products and catalog | API-backed public/catalog CRUD in production; local fallback/cache writes are disabled | Expo WebView uses web flow; no separate native catalog screen | Mongo `products` | Backend-backed; Mongo persistence is unverified |
| Subscriptions and payments | Subscription APIs; fake payment initiation and local subscription/payment fallbacks are blocked in production | Expo WebView uses web flow | Mongo `subscriptions`, `payments` | Backend APIs exist; billing invoices are still local-only and disabled by the production guard |
| Notifications | Backend APIs; local notification/reminder fallback is blocked in production | Expo push-token registration already calls backend | Mongo `notifications`, `push_tokens` | Backend token registration exists; local fallback is blocked |
| Staff, billing, finance, chat, appointments | Web services include `localDB` reads/writes; no corresponding backend routers were found for several of these domains | Not present in inspected Expo screens | No matching complete API contract found | Production persistence/API gap; do not represent as Mongo-backed |

## Legacy Firebase Source Map

The configured Expo entry is `mobile/App.js` and does not import the old Firebase-native navigation. The former Firebase service callers and client config were removed after mapping them below; remote Firebase Auth/Firestore data was not read, copied, modified, or deleted.

| Legacy native Firebase operation (not imported by configured Expo entry) | Existing data | Backend replacement | MongoDB target |
| --- | --- | --- | --- |
| Firebase email/password signup, login, auth-state restore, logout | Firebase Auth user | Owner/customer register and role-derived login endpoints; `/api/auth/me` validates stored backend JWT | `users`, `customers`, `businesses` |
| Firestore user profile get/set/update | `users/{firebaseUid}` | `/api/customer/profile`, `/api/business/profile`, `/api/auth/me` | `users`, `customers`, `businesses` |
| Firestore business create/read/list/by-owner | `businesses/{firestoreId}` | Backend owner registration creates the authoritative business; `/api/business/profile`, `/api/public/businesses`, `/api/qr/resolve` read it | `businesses` |
| Firestore stamp-card read/query | `stampCards/{customerId}_{businessId}` | `/api/customer/home` plus authenticated `/api/loyalty/{business_id}` | `customer_businesses`, `loyalty` |
| Firestore check-in transaction | `stampCards` and `businesses` | `/api/customer/visits/checkin` validates business and derives customer from JWT | `visits`, `customer_businesses`, `loyalty`, `loyalty_transactions`, `customers` |
| Firestore reward redemption transaction | `stampCards.rewardReady` reset | Owner-scoped customer lookup/list and conditional reward-redemption endpoints | `loyalty`, `loyalty_transactions` |

## Firebase Data Migration Plan

No export or migration has been run. These are the required transformations if Firebase contains real records:

| Firebase data | MongoDB target | Transformation | Duplicate/conflict handling | Status |
| --- | --- | --- | --- | --- |
| Firebase Auth users and `users/{uid}` | `users`, then `customers` or `businesses` | Resolve each account to a verified normalized email/phone and server-issued Mongo identity; preserve the old UID only in an approved migration ledger, never as authorization proof | Match verified email/phone; conflicting roles or multiple Mongo records require manual reconciliation; password-hash compatibility must be verified or require a password reset | NOT RUN; no Firebase export credentials or Atlas connection available |
| `businesses/{firestoreId}` | `businesses` | Map owner through the reconciled identity ledger, transform field names, and generate a Mongo business id/slug server-side | Match on reconciled owner and normalized business identity; conflicting owners/names require manual review | NOT RUN; no records were read or changed |
| `stampCards/{customerId}_{businessId}` | `customer_businesses`, `loyalty` | Resolve both legacy IDs through the migration ledger; preserve stamps/points under the exact customer-business pair and retain timestamps | A single canonical card per resolved pair; if duplicates exist, do not sum automatically; compare timestamps/history and require an approved resolution | NOT RUN; no records were read or changed |
| `rewardReady`, `lastRedeemedAt`, and related card fields | `loyalty`, `loyalty_transactions` | Translate only after the Mongo business stamp target and reward rules are confirmed; create a redemption transaction for verified historical redemptions | Ambiguous ready/redeemed states require manual review; never grant duplicate rewards automatically | NOT RUN; no records were read or changed |

Required before any migration: Firebase Auth/Firestore export, isolated Mongo staging DB, identity reconciliation report, duplicate/conflict report, dry-run counts, and explicit approval. No destructive Firebase operation is part of this work.

## Safety and Verification Gates

- No Firebase data is deleted, overwritten, or copied by this migration. There are no Firebase Auth/Firestore imports remaining under `mobile/src`.
- Production localDB access is blocked centrally in `storageSeed.js` for dynamic collections. Browser localStorage use retained by the web app is limited to the backend session cache, unsubmitted cart, order idempotency attempt metadata, and a presentation-only level-up marker; these are not authoritative application records.
- Before migrating real Firebase records, export/backup the Firebase Auth and Firestore data; map Firebase UIDs to verified emails/phones and existing Mongo identities; define duplicate resolution; then run a dry-run report. An actual migration requires explicit approval.
- Backend regression tests currently run while MongoDB is disconnected and therefore do not prove cross-process persistence.
- Production startup requires a unique `(customer_id, business_id)` index. Existing duplicate relationships or an older nonunique index must be reviewed and reconciled before Atlas startup; the application will fail closed rather than remove or merge data automatically.
- Production web builds throw on reads/writes to dynamic `localDB` collections; only static default plan definitions remain available. Features with no backend API (including finance, billing invoices, staff, chat, and the general points reward catalog) therefore fail explicitly rather than persisting locally and still need backend contracts.
- The configured Expo entry wraps the React web app in a WebView. Its checked-in `extra.apiUrl` is empty and `webUrl` points at the existing Firebase-hosted site; API reachability depends on that hosted web bundle's `VITE_API_URL`. The native `mobile/src` Firebase app is unreferenced by `mobile/App.js` and is not the configured app entry.
- Mobile/web shared-data verification requires a reachable MongoDB database and two independently authenticated clients.
- Physical camera testing remains separate from route-level QR tests.