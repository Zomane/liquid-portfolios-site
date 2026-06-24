"""Twitter API integration tests."""
import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import app
from src.services.twitter_service import TwitterService, TweetData, UserProfile
@pytest.fixture
def anyio_backend():
    return "asyncio"
@pytest.fixture
def twitter_service():
    """Create TwitterService instance."""
    return TwitterService()
class TestTwitterService:
    """Test TwitterService class."""
    def test_service_init_without_key(self):
        """Test service initialization without API key."""
        service = TwitterService(api_key=None)
        assert service.api_key is None
        assert service.headers == {}
    def test_service_init_with_key(self):
        """Test service initialization with API key."""
        service = TwitterService(api_key="test_key")
        assert service.api_key == "test_key"
        assert service.headers["X-API-Key"] == "test_key"
    def test_calculate_total_stats_empty(self):
        """Test stats calculation with empty list."""
        service = TwitterService()
        stats = service.calculate_total_stats([])
        assert stats["total_tweets"] == 0
        assert stats["total_likes"] == 0
        assert stats["total_views"] == 0
    def test_calculate_total_stats(self):
        """Test stats calculation with tweets."""
        service = TwitterService()
        tweets = [
            TweetData(
                tweet_id="1",
                url="https://x.com/user/status/1",
                author_username="user1",
                text="Test tweet 1",
                likes=100,
                retweets=20,
                replies=10,
                views=1000,
            ),
            TweetData(
                tweet_id="2",
                url="https://x.com/user/status/2",
                author_username="user1",
                text="Test tweet 2",
                likes=200,
                retweets=40,
                replies=20,
                views=2000,
            ),
        ]
        stats = service.calculate_total_stats(tweets)
        assert stats["total_tweets"] == 2
        assert stats["total_likes"] == 300
        assert stats["total_retweets"] == 60
        assert stats["total_views"] == 3000
        assert stats["total_replies"] == 30
    def test_tweet_data_engagement_rate(self):
        """Test TweetData engagement rate calculation."""
        tweet = TweetData(
            tweet_id="1",
            url="https://x.com/user/status/1",
            author_username="user",
            text="Test",
            likes=100,
            retweets=50,
            replies=25,
            quotes=25,
            views=2000,
        )
        assert tweet.engagement_rate == 10.0
    def test_to_dict(self):
        """Test TweetData to dict conversion."""
        service = TwitterService()
        tweet = TweetData(
            tweet_id="123",
            url="https://x.com/user/status/123",
            author_username="testuser",
            text="Hello world",
            likes=50,
        )
        result = service.to_dict(tweet)
        assert result["tweet_id"] == "123"
        assert result["author_username"] == "testuser"
        assert result["likes"] == 50
    def test_profile_to_dict(self):
        """Test UserProfile to dict conversion."""
        service = TwitterService()
        profile = UserProfile(
            user_id="456",
            username="testuser",
            name="Test User",
            followers=1000,
            following=500,
        )
        result = service.profile_to_dict(profile)
        assert result["user_id"] == "456"
        assert result["username"] == "testuser"
        assert result["followers"] == 1000
@pytest.mark.anyio
async def test_twitter_profile_endpoint():
    """Test Twitter profile endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/twitter/profile/testuser")
        assert response.status_code in [200, 404]
@pytest.mark.anyio
async def test_twitter_tweet_endpoint():
    """Test Twitter tweet endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/twitter/tweet/1234567890")
        assert response.status_code in [200, 404]
@pytest.mark.anyio
async def test_twitter_tweets_batch_endpoint():
    """Test Twitter tweets batch endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/twitter/tweets?tweet_ids=123,456,789")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
@pytest.mark.anyio
async def test_twitter_stats_endpoint():
    """Test Twitter stats endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/twitter/stats/123456789")
        assert response.status_code == 200
        data = response.json()
        assert "total_likes" in data
        assert "tweet_count" in data
@pytest.mark.anyio
async def test_twitter_user_tweets_endpoint():
    """Test Twitter user tweets endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/twitter/user/123456789/tweets")
        assert response.status_code == 200
        data = response.json()
        assert "tweet_ids" in data
        assert "count" in data
@pytest.mark.anyio
async def test_twitter_user_full_endpoint():
    """Test Twitter user full data endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/twitter/user/123456789/full")
        assert response.status_code == 200
        data = response.json()
        assert "tweet_ids" in data
        assert "profile" in data
        assert "stats" in data
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
