# Security and Deployment Readiness

This document describes the current FastAPI + React/Vite + Expo application. It is a deployment checklist, not a claim that the service is production-ready.

## Runtime Configuration

Copy the root `.env.example` for local development. Configure production values in the backend host's secret/environment manager; never put server credentials in `VITE_*` or `EXPO_PUBLIC_*` variables.

Required backend production variables:

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | Set to `production`; required to activate fail-closed settings |
| `JWT_SECRET` | Random signing key of at least 32 characters |
| `OTP_PEPPER` | Random secret of at least 32 characters used in OTP hashes |
| `MONGO_URI` | Authenticated `mongodb://` or `mongodb+srv://` URI; TLS is enabled by the app |
| `DB_NAME` | Production database name |
| `CORS_ORIGINS` | Comma-separated, explicit HTTPS frontend origins |
| `TRUSTED_HOSTS` | Comma-separated API hostnames, without schemes or paths |
| `FRONTEND_URL` | Public HTTPS frontend URL for integrations that need it |
| `SMS_PROVIDER`, provider credentials | Required for real production OTP delivery |
| `GOOGLE_CLIENT_ID` | Required to accept Google ID-token sign-in |

Web builds use `VITE_API_URL` as a public API base URL and `VITE_GOOGLE_CLIENT_ID` as the public Google OAuth web client ID; configure the same client ID as `GOOGLE_CLIENT_ID` on the backend. In Google Cloud Console, add each exact deployed frontend origin under **Authorized JavaScript origins**. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used only by the existing optional upload-storage fallback; they are public client configuration, not a replacement for the MongoDB application database. Expo builds use `EXPO_PUBLIC_API_URL`, including `/api`, to populate `expo.extra.apiUrl`. These values are endpoints/client identifiers, not secrets. Do not build a production client with an empty API URL.

## Startup and Hosting

Backend command:

```sh
uvicorn backend.main:app --host 0.0.0.0 --port "$PORT"
```

Health checks are available at `/health` and `/api/health`; they return only general status and a safe connected/fallback indicator. Production startup fails when required JWT, OTP pepper, MongoDB, CORS, or trusted-host configuration is missing, when the MongoDB connection fails, or when `DEV_OTP=true`.

The current `firebase.json` only serves the Vite single-page app. It does not proxy `/api` to FastAPI. The configured Expo entry is a WebView shell around that web app; its remote web bundle must itself be built with `VITE_API_URL` set. `EXPO_PUBLIC_API_URL` configures Expo-native backend clients and push registration, but does not rewrite the already-hosted WebView bundle. The old native Firebase Auth/Firestore service callers under `mobile/src` were replaced with FastAPI calls and the unused Firebase client config was removed; no Firebase data was migrated or deleted.

## Security Controls

- JWT bearer tokens have a seven-day default expiration and production requires a configured signing secret.
- Password login uses bcrypt hashes; user responses remove `password_hash`. There is no backend password reset/change route in this codebase.
- OTPs are random, stored as salted hashes, expire after five minutes, and have a five-attempt limit. `DEV_OTP` is rejected in production.
- Bounded in-process rate limits cover registration, password/Google login, OTP requests and verification, order/booking creation, voucher redemption, and payment initiation/reconciliation.
- MongoDB access uses `MONGO_URI`; production rejects missing/unauthenticated URIs and does not fall back to the JSON database.
- Production web builds reject reads and writes through dynamic `localDB` collections. Static plan defaults remain available; API-backed services do not persist API response caches into localDB.
- CORS is exact-origin and HTTPS-only in production. Trusted hosts and baseline security headers are enabled.
- Uploads require authentication, verify raster image signatures, are size-bounded, reject SVG, and bind deletion to the authenticated owner.
- Notification token registration/unregistration is user-scoped. Global notification jobs require a super-admin session.
- Public routes are limited to discovery/menu/QR resolution, plan listing, and table availability. Private customer, business, booking, payment, and subscription operations require authentication, with ownership checks on the audited paths.

## Payments

ZOOR UP uses direct UPI; the merchant VPA is public payment-routing information, not a credential. There is no Razorpay or UPI AutoPay integration. Subscription prices are selected server-side. Opening a UPI intent does not mark a payment paid.

The repository has no bank/UPI provider callback or automated settlement verification. Subscription verification is restricted to super-admins; it requires an existing pending payment, a UTR, and an explicit independent-reconciliation confirmation, checks the persisted amount against official plan pricing, and prevents repeat UTR/payment activation. This confirmation is an operational assertion, not bank verification. Never treat client-entered UTR text as proof of payment.

## Deployment Templates

- `vercel.json` defines the Vite build/output and SPA fallback. Configure `VITE_API_URL` in Vercel only after the API has a real HTTPS URL.
- `render.yaml` defines the FastAPI build/start/health commands and marks credentials/origins as dashboard-managed. Fill the required secret/environment fields in Render; this repository intentionally does not contain final domains or credentials.
- `requirements.txt` is the backend runtime dependency set.
- `backend/.env.example` and `frontend/.env.example` contain names/placeholders only.
- The Render start command uses `$PORT`; the app's `/health` endpoint is the health check.

## Production Blockers and Operational Gaps

- A non-placeholder Supabase secret was found in the local root `.env`; **SECRET FOUND — ROTATION REQUIRED**. Rotate it at the provider. This workspace has no Git metadata, so whether it was committed cannot be determined.
- Firebase Auth/Firestore records, if any, remain untouched and unmigrated. The old Firebase-native source has a documented mapping in `docs/DATA_SOURCE_MIGRATION_MAP.md`; export/backup, identity reconciliation, duplicate handling, and an approved dry run are still required before migrating real records.
- MongoDB is currently disconnected (`MONGO_URI`/`DB_NAME` unset). Tests use the in-memory fallback, so cross-process and two-device Mongo persistence is **not verified**.
- The active Expo WebView still points to the existing Firebase-hosted web site; this workspace has no `EXPO_PUBLIC_API_URL`, `VITE_API_URL`, or verified hosted bundle build settings. The local source migration therefore does not prove that the installed/hosted phone app is using FastAPI.
- The customer-business compound unique index is now required at Mongo startup. Review and deduplicate existing relationship rows and resolve any prior nonunique index before configuring production; startup intentionally fails if uniqueness cannot be enforced.
- The production `localDB` guard prevents divergent writes, but backend contracts are still missing for finance, billing invoices, staff, chat, appointments, and the general points-reward catalog. Those features are unavailable in production until their API contracts and UI error states are completed.
- Rate limiting is process-local and not shared across multiple workers/instances. Configure a shared limiter before multi-instance production traffic.
- Live MongoDB Atlas connection and actual Mongo-backed order write/read/session-isolation tests have not succeeded in this workspace. The previously observed database connection state was false; configure an isolated staging database and perform the required verification before release.
- Vercel/Render templates are prepared, but no frontend URL, backend URL, Atlas URI, CORS origins, trusted hosts, or TLS deployment has been configured or verified.
- UPI payment settlement remains manual; an administrator must reconcile the UTR independently. No automatic bank/UPI proof exists.
- The local fallback database contains user records and password hashes. It is ignored and production startup does not use it, but ensure it is excluded from all deployment artifacts and rotate any real credentials represented there.
- The complete route inventory was reviewed and targeted ownership/role regressions added; a third-party penetration test has not been performed.
- `node test_flows.mjs` still has the unrelated existing tier mismatch (`Expected MEMBER, got BASIC`); its new order API scenario passes before that later assertion.

## Verification Commands

```sh
python backend/test_backend.py
npm run build
```
