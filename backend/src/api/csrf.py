"""CSRF protection middleware and utilities for FastAPI."""
import secrets
from typing import Optional
from datetime import datetime, timedelta
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware
import logging
logger = logging.getLogger(__name__)
CSRF_TOKEN_LENGTH = 32
CSRF_TOKEN_EXPIRY_HOURS = 24
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "csrf_token"
class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce CSRF protection on state-changing requests."""
    def __init__(self, app, secret_key: str, exempt_paths: Optional[list] = None):
        super().__init__(app)
        self.secret_key = secret_key.encode() if isinstance(secret_key, str) else secret_key
        self.exempt_paths = exempt_paths or [
            "/api/auth/callback",
            "/api/auth/login",
            "/api/health",
            "/docs",
            "/openapi.json",
        ]
    async def dispatch(self, request: Request, call_next):
        if request.method not in ["POST", "PUT", "PATCH", "DELETE"]:
            return await call_next(request)
        path = request.url.path
        if any(path.startswith(exempt) for exempt in self.exempt_paths):
            return await call_next(request)
        csrf_token_header = request.headers.get(CSRF_HEADER_NAME)
        csrf_token_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        if not csrf_token_header or not csrf_token_cookie:
            logger.warning(f"CSRF token missing - Path: {path}, Method: {request.method}")
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing. Please refresh the page and try again."},
            )
        if not self._verify_csrf_token(csrf_token_cookie, csrf_token_header):
            logger.warning(f"CSRF token invalid - Path: {path}, Method: {request.method}")
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token invalid. Please refresh the page and try again."},
            )
        response = await call_next(request)
        return response
    def _verify_csrf_token(self, cookie_token: str, header_token: str) -> bool:
        """Verify CSRF token using constant-time comparison."""
        try:
            if not secrets.compare_digest(cookie_token, header_token):
                return False
            return True
        except Exception as e:
            logger.error(f"CSRF token verification error: {e}")
            return False
def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)
def set_csrf_cookie(response: Response, token: str) -> None:
    """Set CSRF token in cookie."""
    import os
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=CSRF_TOKEN_EXPIRY_HOURS * 3600,
    )
def get_csrf_token_from_request(request: Request) -> Optional[str]:
    """Get CSRF token from request cookie."""
    return request.cookies.get(CSRF_COOKIE_NAME)
async def require_csrf_token(request: Request) -> str:
    """Dependency to require valid CSRF token."""
    csrf_token_header = request.headers.get(CSRF_HEADER_NAME)
    csrf_token_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    if not csrf_token_header or not csrf_token_cookie:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing"
        )
    if not secrets.compare_digest(csrf_token_cookie, csrf_token_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token invalid"
        )
    return csrf_token_header
