"""
ZOOR UP FastAPI Main Application
"""
import os
import logging
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from backend.routes.auth_routes import router as auth_router
from backend.routes.customer_routes import router as customer_router, get_customer_business_loyalty
from backend.routes.business_routes import router as business_router
from backend.routes.qr_routes import router as qr_router
from backend.routes.upload_routes import router as upload_router
from backend.routes.payment_routes import router as payment_router
from backend.routes.subscription_routes import router as subscription_router, subscriptions_router
from backend.routes.notification_routes import router as notification_router
from backend.routes.table_routes import router as table_router, customer_table_router
from backend.routes.order_routes import router as order_router
from backend.routes.staff_routes import router as staff_router
from backend.routes.finance_routes import router as finance_router
from backend.routes.chat_routes import router as chat_router
from backend.database import db_instance

IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").strip().lower() == "production"

app = FastAPI(
    title="ZOOR UP SaaS Platform API",
    version="2.0.0",
    description="Backend API for Local Business Management, Customer CRM, Loyalty, QR Digital Menu & Analytics.",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

logger = logging.getLogger("zoorup.api")

# Static file serving for uploaded photos
uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

ALLOWED_ORIGINS = [origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
if not IS_PRODUCTION:
    ALLOWED_ORIGINS.extend([
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ])
ALLOWED_ORIGINS = list(dict.fromkeys(ALLOWED_ORIGINS))

TRUSTED_HOSTS = [host.strip() for host in os.getenv("TRUSTED_HOSTS", "").split(",") if host.strip()]
if not IS_PRODUCTION:
    TRUSTED_HOSTS.extend(["localhost", "127.0.0.1", "testserver"])
TRUSTED_HOSTS = list(dict.fromkeys(TRUSTED_HOSTS))

if IS_PRODUCTION:
    if not ALLOWED_ORIGINS or any(not origin.startswith("https://") for origin in ALLOWED_ORIGINS):
        raise RuntimeError("Production CORS_ORIGINS must contain explicit HTTPS origins.")
    if not TRUSTED_HOSTS:
        raise RuntimeError("Production TRUSTED_HOSTS must be configured.")

app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
    if IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def safe_internal_error(request: Request, exc: Exception):
    logger.error("Unhandled API exception for %s %s (%s)", request.method, request.url.path, type(exc).__name__)
    message = "An internal server error occurred." if IS_PRODUCTION else str(exc)
    origin = request.headers.get("origin")
    headers = {}
    if origin and (origin in ALLOWED_ORIGINS or not IS_PRODUCTION):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(status_code=500, content={"detail": message}, headers=headers)


@app.exception_handler(RequestValidationError)
async def safe_validation_error(request: Request, exc: RequestValidationError):
    errors = [
        {"loc": error.get("loc"), "msg": error.get("msg"), "type": error.get("type")}
        for error in exc.errors()
    ]
    origin = request.headers.get("origin")
    headers = {}
    if origin and (origin in ALLOWED_ORIGINS or not IS_PRODUCTION):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(status_code=422, content={"detail": errors}, headers=headers)

# Include API Routers
app.include_router(auth_router)
app.include_router(customer_router)
app.include_router(business_router)
app.include_router(qr_router)
app.include_router(upload_router)
app.include_router(payment_router)
app.include_router(subscription_router)
app.include_router(subscriptions_router)
app.include_router(notification_router)
app.include_router(table_router)
app.include_router(customer_table_router)
app.include_router(order_router)
app.include_router(staff_router)
app.include_router(finance_router)
app.include_router(chat_router)

app.add_api_route(
    "/api/loyalty/{business_id}",
    get_customer_business_loyalty,
    methods=["GET"],
)

@app.get("/")
def root():
    return {
        "app": "ZOOR UP SaaS",
        "tagline": "Run Your Business. Turn Customers Into Regulars.",
        "status": "online",
        "version": "2.0.0"
    }

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "database": "connected" if db_instance.is_connected else "in-memory-fallback"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
