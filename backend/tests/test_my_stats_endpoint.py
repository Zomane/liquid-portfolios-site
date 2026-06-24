"""Integration tests for /my-stats endpoint."""
import pytest
from httpx import AsyncClient, ASGITransport
from src.models import async_session, init_db, User, PortfolioStatusTimeline
from datetime import datetime
from sqlalchemy import delete
from unittest.mock import patch
@pytest.mark.asyncio
async def test_my_stats_endpoint_success():
    """Test successful my-stats response."""
    from main import app
    await init_db()
    async with async_session() as db:
        await db.execute(delete(PortfolioStatusTimeline).where(PortfolioStatusTimeline.discord_id == "123456789012345678"))
        await db.execute(delete(User).where(User.discord_id == "123456789012345678"))
        user = User(
            discord_id="123456789012345678",
            username="TestUser",
            message_count=0,
            created_at=datetime.utcnow(),
        )
        db.add(user)
        await db.flush()
        db.add_all([
            PortfolioStatusTimeline(
                portfolio_id=1,
                discord_id="123456789012345678",
                from_status=None,
                to_status="submitted",
                action="submit",
            ),
            PortfolioStatusTimeline(
                portfolio_id=2,
                discord_id="123456789012345678",
                from_status="draft",
                to_status="submitted",
                action="submit",
            ),
        ])
        await db.commit()
    class FakeMessagesRepo:
        def get_user_stats(self, discord_id: int):
            return {"message_count": 1250}
    transport = ASGITransport(app=app)
    with patch("src.repositories.messages_db.get_messages_repository", return_value=FakeMessagesRepo()):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/user/123456789012345678/my-stats")
        assert response.status_code == 200
        data = response.json()
        assert data["discord_id"] == "123456789012345678"
        assert data["username"] == "TestUser"
        assert data["message_count"] == 1250
        assert data["portfolios_submitted"] == 2
        assert data["quests_completed"] == 0
        assert data["activity_level"]["level"] == "active"
        assert data["activity_level"]["min_messages"] == 1000
        assert data["activity_level"]["max_messages"] == 1999
        assert 0 <= data["activity_level"]["progress_percentage"] <= 100
        assert data["next_level"] is not None
        assert data["next_level"]["level"] == "expert"
        assert data["messages_per_portfolio"] is not None
        assert data["messages_per_quest"] is None
        assert data["activity_stage"] is not None
@pytest.mark.asyncio
async def test_my_stats_user_not_found():
    """Test 404 for non-existent user."""
    from main import app
    await init_db()
    async with async_session() as db:
        await db.execute(delete(User).where(User.discord_id == "999999999999999999"))
        await db.commit()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/user/999999999999999999/my-stats")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
@pytest.mark.asyncio
async def test_activity_levels():
    """Test activity level calculations."""
    from src.api.routers.user import _calculate_activity_level
    level, next_level = _calculate_activity_level(250)
    assert level.level == "newcomer"
    assert level.min_messages == 0
    assert level.max_messages == 499
    assert next_level.level == "regular"
    level, next_level = _calculate_activity_level(750)
    assert level.level == "regular"
    assert next_level.level == "active"
    level, next_level = _calculate_activity_level(1500)
    assert level.level == "active"
    assert next_level.level == "expert"
    level, next_level = _calculate_activity_level(3000)
    assert level.level == "expert"
    assert next_level.level == "legendary"
    level, next_level = _calculate_activity_level(10000)
    assert level.level == "legendary"
    assert next_level is None
    assert level.progress_percentage == 100.0
@pytest.mark.asyncio
async def test_my_stats_without_guild():
    """Test my-stats for user without guild membership."""
    await init_db()
    async with async_session() as db:
        await db.execute(delete(User).where(User.discord_id == "999888777666555444"))
        user = User(
            discord_id="999888777666555444",
            username="NoGuildUser",
            message_count=500,
            created_at=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
    from main import app
    class FakeMessagesRepo:
        def get_user_stats(self, discord_id: int):
            return {"message_count": 500}
    transport = ASGITransport(app=app)
    with patch("src.repositories.messages_db.get_messages_repository", return_value=FakeMessagesRepo()):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/user/999888777666555444/my-stats")
        assert response.status_code == 200
        data = response.json()
        assert data["guild"] is None
        assert data["guild_tier"] is None
        assert data["highest_role"] is None
        assert data["quests_completed"] == 0
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
