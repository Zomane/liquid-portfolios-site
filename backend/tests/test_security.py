"""
Security tests — verifies all vulnerability fixes.
Tests cover:
1. Auth required on protected endpoints
2. CSRF protection
3. Self-review prevention
4. Input validation (max length, patterns)
5. Security headers
6. JWT secret defaults
7. CORS configuration
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock
from jose import jwt
from datetime import datetime, timedelta
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-tests")
os.environ.setdefault("ENVIRONMENT", "development")
from main import app
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
def make_jwt(discord_id: str = "111111111111111111", username: str = "TestUser", days: int = 7) -> str:
    payload = {
        "sub": discord_id,
        "username": username,
        "avatar": None,
        "exp": datetime.utcnow() + timedelta(days=days),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
def auth_headers(discord_id: str = "111111111111111111") -> dict:
    return {"Authorization": f"Bearer {make_jwt(discord_id)}"}
def expired_jwt() -> str:
    payload = {
        "sub": "111111111111111111",
        "username": "Expired",
        "exp": datetime.utcnow() - timedelta(days=1),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
@pytest.fixture
def anyio_backend():
    return "asyncio"
_csrf_cache = {"token": None, "cookies": None}
async def get_csrf(client: AsyncClient) -> tuple:
    """Fetch CSRF token once and cache it."""
    if _csrf_cache["token"] is None:
        resp = await client.get("/api/csrf-token")
        assert resp.status_code == 200
        _csrf_cache["token"] = resp.json()["csrf_token"]
        _csrf_cache["cookies"] = resp.cookies
    return _csrf_cache["token"], _csrf_cache["cookies"]
class TestAuthRequired:
    @pytest.mark.anyio
    async def test_portfolio_list_all_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/portfolio/list/all")
            assert resp.status_code in (401, 403)
    @pytest.mark.anyio
    async def test_stats_portfolios_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/stats/portfolios")
            assert resp.status_code in (401, 403)
    @pytest.mark.anyio
    async def test_expired_token_rejected(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            csrf_token, cookies = await get_csrf(c)
            resp = await c.post(
                "/api/portfolio/submit",
                json={"discord_id": "123456789012345678", "username": "Test"},
                headers={
                    "Authorization": f"Bearer {expired_jwt()}",
                    "X-CSRF-Token": csrf_token,
                },
                cookies=cookies,
            )
            assert resp.status_code == 401
class TestCSRFProtection:
    @pytest.mark.anyio
    async def test_post_without_csrf_rejected(self):
        """POST without CSRF token must return 403."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.post(
                "/api/portfolio/submit",
                json={"discord_id": "123456789012345678", "username": "Test"},
                headers=auth_headers(),
            )
            assert resp.status_code == 403
            assert "CSRF" in resp.json().get("detail", "")
    @pytest.mark.anyio
    async def test_post_with_wrong_csrf_rejected(self):
        """POST with wrong CSRF token must return 403."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            _, cookies = await get_csrf(c)
            resp = await c.post(
                "/api/portfolio/submit",
                json={"discord_id": "123456789012345678", "username": "Test"},
                headers={**auth_headers(), "X-CSRF-Token": "wrong-token"},
                cookies=cookies,
            )
            assert resp.status_code == 403
            assert "CSRF" in resp.json().get("detail", "")
    @pytest.mark.anyio
    async def test_get_requests_exempt_from_csrf(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/health")
            assert resp.status_code == 200
    @pytest.mark.anyio
    async def test_csrf_token_endpoint_works(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/csrf-token")
            assert resp.status_code == 200
            data = resp.json()
            assert "csrf_token" in data
            assert len(data["csrf_token"]) > 20
            assert "csrf_token" in resp.cookies
class TestSelfReviewPrevention:
    @pytest.mark.anyio
    async def test_self_review_blocked(self):
        """User must not be able to approve their own portfolio."""
        transport = ASGITransport(app=app)
        discord_id = "244517221618024450"
        from src.api.security import verify_staff_or_moderator
        app.dependency_overrides[verify_staff_or_moderator] = lambda: discord_id
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                csrf_token, cookies = await get_csrf(c)
                resp = await c.post(
                    "/api/portfolio/review",
                    json={
                        "discord_id": discord_id,
                        "reviewer_id": discord_id,
                        "action": "approve",
                        "feedback": "self-approve attempt",
                    },
                    headers={
                        **auth_headers(discord_id),
                        "X-CSRF-Token": csrf_token,
                    },
                    cookies=cookies,
                )
                assert resp.status_code == 403
                assert "cannot review your own" in resp.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(verify_staff_or_moderator, None)
    @pytest.mark.anyio
    async def test_review_different_user_passes_self_check(self):
        """Staff reviewing someone else should not hit self-review block."""
        transport = ASGITransport(app=app)
        reviewer_id = "999999999999999999"
        portfolio_owner = "111111111111111111"
        from src.api.security import verify_staff_or_moderator
        from src.models.base import get_db
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result
        async def mock_get_db():
            yield mock_session
        app.dependency_overrides[verify_staff_or_moderator] = lambda: reviewer_id
        app.dependency_overrides[get_db] = mock_get_db
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                csrf_token, cookies = await get_csrf(c)
                resp = await c.post(
                    "/api/portfolio/review",
                    json={
                        "discord_id": portfolio_owner,
                        "reviewer_id": reviewer_id,
                        "action": "approve",
                        "feedback": "looks good",
                    },
                    headers={
                        **auth_headers(reviewer_id),
                        "X-CSRF-Token": csrf_token,
                    },
                    cookies=cookies,
                )
                assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(verify_staff_or_moderator, None)
            app.dependency_overrides.pop(get_db, None)
class TestInputValidation:
    @pytest.mark.anyio
    async def test_portfolio_create_invalid_discord_id(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            csrf_token, cookies = await get_csrf(c)
            resp = await c.post(
                "/api/portfolio/submit",
                json={"discord_id": "not-a-number!", "username": "Test"},
                headers={**auth_headers(), "X-CSRF-Token": csrf_token},
                cookies=cookies,
            )
            assert resp.status_code == 422
    @pytest.mark.anyio
    async def test_portfolio_create_discord_id_too_long(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            csrf_token, cookies = await get_csrf(c)
            resp = await c.post(
                "/api/portfolio/submit",
                json={"discord_id": "1" * 50, "username": "Test"},
                headers={**auth_headers(), "X-CSRF-Token": csrf_token},
                cookies=cookies,
            )
            assert resp.status_code == 422
    @pytest.mark.anyio
    async def test_portfolio_update_bio_too_long(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            csrf_token, cookies = await get_csrf(c)
            resp = await c.put(
                "/api/portfolio/123456789012345678",
                json={"bio": "x" * 3000},
                headers={**auth_headers(), "X-CSRF-Token": csrf_token},
                cookies=cookies,
            )
            assert resp.status_code == 422
    @pytest.mark.anyio
    async def test_review_action_validated(self):
        transport = ASGITransport(app=app)
        reviewer_id = "999999999999999999"
        from src.api.security import verify_staff_or_moderator
        app.dependency_overrides[verify_staff_or_moderator] = lambda: reviewer_id
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                csrf_token, cookies = await get_csrf(c)
                resp = await c.post(
                    "/api/portfolio/review",
                    json={
                        "discord_id": "123456789012345678",
                        "reviewer_id": reviewer_id,
                        "action": "delete_everything",
                        "feedback": "haha",
                    },
                    headers={
                        **auth_headers(reviewer_id),
                        "X-CSRF-Token": csrf_token,
                    },
                    cookies=cookies,
                )
                assert resp.status_code == 422
        finally:
            app.dependency_overrides.pop(verify_staff_or_moderator, None)
class TestSecurityHeaders:
    @pytest.mark.anyio
    async def test_security_headers_present(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/health")
            assert resp.status_code == 200
            assert resp.headers.get("X-Content-Type-Options") == "nosniff"
            assert resp.headers.get("X-Frame-Options") == "DENY"
            assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
            assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
            assert "camera=()" in resp.headers.get("Permissions-Policy", "")
    @pytest.mark.anyio
    async def test_hsts_only_in_production(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/health")
            if os.getenv("ENVIRONMENT") != "production":
                assert "Strict-Transport-Security" not in resp.headers
class TestJWTSecret:
    def test_jwt_secret_not_default_in_security(self):
        from src.api.security import JWT_SECRET as sec_secret
        assert sec_secret != "your-secret-key-change-in-production"
    def test_jwt_secret_not_default_in_auth(self):
        from src.api.routers.auth import JWT_SECRET as auth_secret
        assert auth_secret != "your-secret-key-change-in-production"
class TestCORSConfig:
    @pytest.mark.anyio
    async def test_cors_rejects_unknown_origin(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.options(
                "/api/health",
                headers={
                    "Origin": "https://evil-site.com",
                    "Access-Control-Request-Method": "POST",
                },
            )
            allow_origin = resp.headers.get("Access-Control-Allow-Origin", "")
            assert "evil-site.com" not in allow_origin
    @pytest.mark.anyio
    async def test_cors_allows_known_origin(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.options(
                "/api/health",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
            allow_origin = resp.headers.get("Access-Control-Allow-Origin", "")
            assert allow_origin == "http://localhost:5173"
class TestHealthCheck:
    @pytest.mark.anyio
    async def test_health(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            resp = await c.get("/api/health")
            assert resp.status_code == 200
            assert resp.json()["status"] == "healthy"
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
