"""Regression tests for promoted-portfolio tweet reuse validation."""
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
import pytest
from httpx import ASGITransport, AsyncClient
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-tests")
os.environ.setdefault("ENVIRONMENT", "development")
from main import app
from src.api.security import get_current_user
from src.models import Portfolio, PortfolioStatus, PortfolioTweet
from src.models.base import get_db
from tests.test_security import auth_headers, get_csrf
@pytest.fixture
def anyio_backend():
    return "asyncio"
@pytest.mark.anyio
async def test_submit_rejects_tweets_reused_from_promoted_portfolio():
    """Submitting for the next tier must not reuse tweets from the promoted portfolio."""
    discord_id = "111111111111111111"
    promoted_portfolio = Portfolio(
        id=1,
        user_id=1,
        discord_id=discord_id,
        status=PortfolioStatus.PROMOTED.value,
        promoted_at=datetime.utcnow() - timedelta(days=30),
        tweets=[
            PortfolioTweet(
                tweet_url="https://twitter.com/example/status/12345?ref_src=twsrc%5Etfw",
                tweet_id=None,
            )
        ],
    )
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = promoted_portfolio
    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result
    mock_session.refresh = AsyncMock()
    async def mock_get_db():
        yield mock_session
    transport = ASGITransport(app=app)
    app.dependency_overrides[get_db] = mock_get_db
    app.dependency_overrides[get_current_user] = lambda: discord_id
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            csrf_token, cookies = await get_csrf(client)
            response = await client.post(
                "/api/portfolio/submit",
                json={
                    "discord_id": discord_id,
                    "bio": "Updated application",
                    "twitter_handle": "example_handle",
                    "achievements": "New wins",
                    "target_role": "Current",
                    "tweets": [
                        {"tweet_url": "https://x.com/example/status/12345", "tweet_id": None},
                        {"tweet_url": "https://x.com/example/status/20001", "tweet_id": "20001"},
                        {"tweet_url": "https://x.com/example/status/20002", "tweet_id": "20002"},
                        {"tweet_url": "https://x.com/example/status/20003", "tweet_id": "20003"},
                        {"tweet_url": "https://x.com/example/status/20004", "tweet_id": "20004"},
                        {"tweet_url": "https://x.com/example/status/20005", "tweet_id": "20005"},
                    ],
                },
                headers={
                    **auth_headers(discord_id),
                    "X-CSRF-Token": csrf_token,
                },
                cookies=cookies,
            )
        assert response.status_code == 400
        assert "submit new tweets" in response.json()["detail"].lower()
        assert "status/12345" in response.json()["detail"]
        mock_session.commit.assert_not_called()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
