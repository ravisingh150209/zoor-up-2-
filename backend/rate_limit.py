"""Small process-local abuse limiter; production multi-instance deployments need shared storage."""
import hashlib
import threading
import time
from collections import deque

from fastapi import HTTPException, status

_lock = threading.Lock()
_buckets: dict[str, deque] = {}
_operations = 0
_MAX_BUCKETS = 25000


def enforce_rate_limit(scope: str, identity: str, limit: int, window_seconds: int) -> None:
    """Allow at most `limit` attempts per hashed identity and rolling time window."""
    global _operations
    digest = hashlib.sha256(str(identity or "unknown").encode("utf-8")).hexdigest()
    key = f"{scope}:{digest}"
    now = time.monotonic()
    cutoff = now - window_seconds

    with _lock:
        _operations += 1
        bucket = _buckets.setdefault(key, deque())
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(bucket[0] + window_seconds - now))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait before trying again.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)

        if _operations % 256 == 0:
            expired = [bucket_key for bucket_key, values in _buckets.items() if not values or values[-1] <= now - 3600]
            for bucket_key in expired:
                _buckets.pop(bucket_key, None)
            while len(_buckets) > _MAX_BUCKETS:
                _buckets.pop(next(iter(_buckets)))


def reset_rate_limits() -> None:
    """Test helper; never exposed through an API route."""
    with _lock:
        _buckets.clear()