"""FastAPI Backend for Liquid Discord Bot."""
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Response, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
frontend_url = os.getenv("FRONTEND_URL")
cors_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://tryliquid.xyz",
    "https://buildwithliquid.xyz",
]
if frontend_url and frontend_url not in cors_origins:
    cors_origins.append(frontend_url)
from src.models import init_db
from src.api import (
    portfolio_router,
    user_router,
    stats_router,
    auth_router,
    twitter_router,
    websocket_router,
)
from src.services.twitter_service import cleanup_twitter_service
from src.api.csrf import CSRFProtectionMiddleware, generate_csrf_token, set_csrf_cookie
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
limiter = Limiter(key_func=get_remote_address)
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if os.getenv("ENVIRONMENT") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and background tasks on startup."""
    await init_db()
    yield
    await cleanup_twitter_service()
app = FastAPI(
    title="Liquid API",
    description="Backend API for Liquid Discord Bot",
    version="1.0.0",
    lifespan=lifespan,
)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log validation errors for debugging."""
    logger.error("=" * 80)
    logger.error("❌ VALIDATION ERROR")
    logger.error("=" * 80)
    logger.error(f"   Path: {request.method} {request.url.path}")
    logger.error(f"   Client: {request.client.host if request.client else 'unknown'}")
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error["loc"])
        logger.error(f"   Field: {field}")
        logger.error(f"   Error: {error['msg']}")
        logger.error(f"   Type: {error['type']}")
        if "ctx" in error:
            logger.error(f"   Context: {error['ctx']}")
    logger.error("=" * 80)
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityHeadersMiddleware)
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    import logging as _log
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("JWT_SECRET is not set! Cannot start in production without it.")
    _log.getLogger(__name__).warning(
        "JWT_SECRET is not set — using insecure dev default. Do NOT use in production."
    )
    JWT_SECRET = "INSECURE-DEV-ONLY-CHANGE-ME"
app.add_middleware(
    CSRFProtectionMiddleware,
    secret_key=JWT_SECRET,
    exempt_paths=[
        "/api/auth/callback",
        "/api/auth/login",
        "/api/health",
        "/api/twitter/profiles/batch",
        "/docs",
        "/openapi.json",
        "/redoc",
    ]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-CSRF-Token",
        "Accept",
        "Origin",
    ],
    expose_headers=["X-CSRF-Token"],
)
app.include_router(portfolio_router, prefix="/api")
app.include_router(user_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(twitter_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")
images_path = Path(__file__).parent.parent / "src" / "images"
if images_path.exists():
    app.mount("/static/images", StaticFiles(directory=str(images_path)), name="images")
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "liquid-api"}
@app.get("/api/csrf-token")
@limiter.limit("10/minute")
async def get_csrf_token(request: Request, response: Response):
    """Get CSRF token for the current session."""
    token = generate_csrf_token()
    set_csrf_cookie(response, token)
    return {"csrf_token": token}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )
