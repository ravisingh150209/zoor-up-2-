"""
ZOOR UP Authentication & Security Utilities
"""
import os
import secrets
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from backend.database import get_collection

_environment = os.getenv("ENVIRONMENT", "development").strip().lower()
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
if _environment == "production":
    if len(JWT_SECRET) < 32 or len(set(JWT_SECRET)) < 16 or JWT_SECRET.lower().startswith(("replace", "changeme", "your-")):
        raise RuntimeError("JWT_SECRET must be configured with at least 32 characters in production.")
elif not JWT_SECRET:
    _secret_file = os.path.join(os.path.dirname(__file__), ".jwt_secret")
    if os.path.exists(_secret_file):
        try:
            with open(_secret_file, "r", encoding="utf-8") as f:
                JWT_SECRET = f.read().strip()
        except Exception:
            JWT_SECRET = ""
    if not JWT_SECRET or len(JWT_SECRET) < 32:
        JWT_SECRET = secrets.token_urlsafe(48)
        try:
            with open(_secret_file, "w", encoding="utf-8") as f:
                f.write(JWT_SECRET)
        except Exception:
            pass
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
if ACCESS_TOKEN_EXPIRE_MINUTES < 1 or ACCESS_TOKEN_EXPIRE_MINUTES > 43200:
    raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be between 1 and 43200.")

security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again."
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token."
        )

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is required."
        )
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")

    users_col = get_collection("users")
    user = users_col.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    
    return user

async def get_optional_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security)) -> Optional[dict]:
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub") or payload.get("user_id") or payload.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")

    users_col = get_collection("users")
    user = users_col.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    
    return user

def require_role(allowed_roles: List[str]):
    normalized_allowed = [r.upper() for r in allowed_roles]
    if "CUSTOMER" in normalized_allowed:
        normalized_allowed.append("customer")
    if "BUSINESS_OWNER" in normalized_allowed:
        normalized_allowed.extend(["BUSINESS", "BUSINESS_OWNER", "business", "business_owner"])

    async def role_checker(user: dict = Depends(get_current_user)):
        user_role = (user.get("role") or "").upper()
        if user_role not in [r.upper() for r in normalized_allowed]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker
