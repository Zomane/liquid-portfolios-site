"""Twitter/X integration service using twitterapi.io"""
import os
import time
import aiohttp
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple
@dataclass
class TweetData:
    """Parsed tweet data"""
    tweet_id: str
    url: str
    author_username: str
    text: str
    likes: int = 0
    retweets: int = 0
    replies: int = 0
    quotes: int = 0
    views: int = 0
    bookmarks: int = 0
    engagement_rate: float = 0.0
    media_urls: List[str] = field(default_factory=list)
    created_at: str = None
    author_followers: int = 0
    author_profile_picture: str = ""
    is_blue_verified: bool = False
    def __post_init__(self):
        if self.views > 0:
            self.engagement_rate = round(
                (self.likes + self.retweets + self.replies + self.quotes) / self.views * 100, 2
            )
@dataclass
class UserProfile:
    """Twitter user profile data"""
    user_id: str
    username: str
    name: str
    followers: int = 0
    following: int = 0
    tweet_count: int = 0
    description: str = ""
    profile_picture: str = ""
    banner_url: str = ""
    is_blue_verified: bool = False
    created_at: str = None
class TwitterService:
    """Service for Twitter/X data extraction using twitterapi.io"""
    BASE_URL = "https://api.twitterapi.io/twitter"
    _profile_cache: Dict[str, Tuple[Optional[Any], float]] = {}
    _tweet_cache: Dict[str, Tuple[Optional[Any], float]] = {}
    _stats_cache: Dict[str, Tuple[Dict[str, Any], float]] = {}
    PROFILE_CACHE_TTL = 3600
    TWEET_CACHE_TTL = 1800
    STATS_CACHE_TTL = 1800
    FAILED_REQUEST_CACHE_TTL = 3600
    _session: Optional[aiohttp.ClientSession] = None
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.getenv("TWITTER_API_KEY") or os.getenv("TWITTERAPI_KEY")
        self.headers = {}
        if self.api_key:
            self.headers["X-API-Key"] = self.api_key
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create shared aiohttp session for connection reuse."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session
    async def close(self):
        """Close the shared aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()
    def _parse_tweet_response(self, tweet_data: dict) -> TweetData:
        """Parse raw tweet response into TweetData object."""
        author = tweet_data.get("author", {})
        media_urls = []
        if tweet_data.get("media"):
            for m in tweet_data["media"]:
                if m.get("url"):
                    media_urls.append(m["url"])
                elif m.get("media_url_https"):
                    media_urls.append(m["media_url_https"])
        return TweetData(
            tweet_id=tweet_data.get("id", ""),
            url=tweet_data.get("url", ""),
            author_username=author.get("userName", ""),
            text=tweet_data.get("text", ""),
            likes=tweet_data.get("likeCount", 0),
            retweets=tweet_data.get("retweetCount", 0),
            replies=tweet_data.get("replyCount", 0),
            quotes=tweet_data.get("quoteCount", 0),
            views=tweet_data.get("viewCount", 0),
            bookmarks=tweet_data.get("bookmarkCount", 0),
            media_urls=media_urls,
            created_at=tweet_data.get("createdAt"),
            author_followers=author.get("followers", 0),
            author_profile_picture=(
                author.get("profilePicture")
                or author.get("profile_image_url_https")
                or author.get("avatar")
                or ""
            ),
            is_blue_verified=author.get("isBlueVerified", False),
        )
    async def fetch_tweet_data(self, tweet_id: str) -> Optional[TweetData]:
        """Fetch data for a single tweet with caching."""
        if not self.api_key:
            return None
        if tweet_id in self._tweet_cache:
            cached_tweet, cached_time = self._tweet_cache[tweet_id]
            if time.time() - cached_time < self.TWEET_CACHE_TTL:
                return cached_tweet
        url = f"{self.BASE_URL}/tweets"
        params = {"tweet_ids": tweet_id}
        try:
            session = await self._get_session()
            async with session.get(url, headers=self.headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("status") == "success" and data.get("tweets"):
                        tweet = self._parse_tweet_response(data["tweets"][0])
                        self._tweet_cache[tweet_id] = (tweet, time.time())
                        return tweet
        except Exception as e:
            print(f"Error fetching tweet {tweet_id}: {e}")
        self._tweet_cache[tweet_id] = (None, time.time() - self.TWEET_CACHE_TTL + self.FAILED_REQUEST_CACHE_TTL)
        return None
    async def fetch_tweets_batch(self, tweet_ids: List[str]) -> List[TweetData]:
        """Fetch data for multiple tweets at once with caching."""
        if not self.api_key or not tweet_ids:
            return []
        cached_tweets = []
        uncached_ids = []
        for tweet_id in tweet_ids:
            if tweet_id in self._tweet_cache:
                cached_tweet, cached_time = self._tweet_cache[tweet_id]
                if time.time() - cached_time < self.TWEET_CACHE_TTL:
                    if cached_tweet:
                        cached_tweets.append(cached_tweet)
                    continue
            uncached_ids.append(tweet_id)
        if uncached_ids:
            url = f"{self.BASE_URL}/tweets"
            params = {"tweet_ids": ",".join(uncached_ids)}
            try:
                session = await self._get_session()
                async with session.get(url, headers=self.headers, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("status") == "success":
                            new_tweets = [self._parse_tweet_response(t) for t in data.get("tweets", [])]
                            for tweet in new_tweets:
                                self._tweet_cache[tweet.tweet_id] = (tweet, time.time())
                            cached_tweets.extend(new_tweets)
            except Exception as e:
                print(f"Error fetching tweets batch: {e}")
        return cached_tweets
    async def fetch_user_profile(self, username: str) -> Optional[UserProfile]:
        """Fetch Twitter user profile with caching."""
        if not self.api_key:
            return None
        username = username.lstrip("@").lower()
        if username in self._profile_cache:
            cached_profile, cached_time = self._profile_cache[username]
            if time.time() - cached_time < self.PROFILE_CACHE_TTL:
                return cached_profile
        url = f"{self.BASE_URL}/user/info"
        params = {"userName": username}
        try:
            session = await self._get_session()
            async with session.get(url, headers=self.headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("status") == "success" and data.get("data"):
                        user = data["data"]
                        profile = UserProfile(
                            user_id=user.get("id", ""),
                            username=user.get("userName", username),
                            name=user.get("name", ""),
                            followers=user.get("followers", 0),
                            following=user.get("following", 0),
                            tweet_count=user.get("statusesCount", 0),
                            description=user.get("description", ""),
                            profile_picture=user.get("profilePicture", ""),
                            banner_url=user.get("coverPicture", ""),
                            is_blue_verified=user.get("isBlueVerified", False),
                            created_at=user.get("createdAt"),
                        )
                        self._profile_cache[username] = (profile, time.time())
                        return profile
        except Exception as e:
            print(f"Error fetching user profile {username}: {e}")
        self._profile_cache[username] = (None, time.time() - self.PROFILE_CACHE_TTL + self.FAILED_REQUEST_CACHE_TTL)
        return None
    async def get_user_tweets(self, username: str, limit: int = 20) -> List[TweetData]:
        """Get user's recent tweets."""
        if not self.api_key:
            return []
        url = f"{self.BASE_URL}/user/last_tweets"
        params = {"userName": username, "limit": min(limit, 100)}
        try:
            session = await self._get_session()
            async with session.get(url, headers=self.headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("status") == "success":
                        tweets = data.get("data", {}).get("tweets", [])
                        parsed_tweets = [self._parse_tweet_response(t) for t in tweets]
                        for tweet in parsed_tweets:
                            self._tweet_cache[tweet.tweet_id] = (tweet, time.time())
                        return parsed_tweets
        except Exception as e:
            print(f"Error fetching user tweets for {username}: {e}")
        return []
    def extract_profile_from_tweets(self, tweets: List[TweetData]) -> Optional[UserProfile]:
        """Extract user profile from tweets to avoid separate API call.
        This saves 1 API request by reusing author data from tweets.
        """
        if not tweets:
            return None
        first_tweet = tweets[0]
        profile = UserProfile(
            user_id="",
            username=first_tweet.author_username,
            name="",
            followers=first_tweet.author_followers,
            following=0,
            tweet_count=0,
            description="",
            profile_picture=first_tweet.author_profile_picture,
            banner_url="",
            is_blue_verified=first_tweet.is_blue_verified,
            created_at=None,
        )
        username = first_tweet.author_username.lower()
        self._profile_cache[username] = (profile, time.time())
        return profile
    def calculate_total_stats(self, tweets: List[TweetData]) -> Dict[str, Any]:
        """Calculate total engagement stats from a list of tweets."""
        if not tweets:
            return {
                "total_tweets": 0,
                "total_likes": 0,
                "total_retweets": 0,
                "total_views": 0,
                "total_replies": 0,
                "avg_likes": 0,
                "avg_views": 0,
                "avg_engagement_rate": 0,
                "overall_engagement_rate": 0,
            }
        total_likes = sum(t.likes for t in tweets)
        total_retweets = sum(t.retweets for t in tweets)
        total_views = sum(t.views for t in tweets)
        total_replies = sum(t.replies for t in tweets)
        count = len(tweets)
        overall_er = 0
        if total_views > 0:
            overall_er = round(
                (total_likes + total_retweets + total_replies) / total_views * 100, 2
            )
        return {
            "total_tweets": count,
            "total_likes": total_likes,
            "total_retweets": total_retweets,
            "total_views": total_views,
            "total_replies": total_replies,
            "avg_likes": round(total_likes / count, 1) if count > 0 else 0,
            "avg_views": round(total_views / count, 1) if count > 0 else 0,
            "avg_engagement_rate": round(sum(t.engagement_rate for t in tweets) / count, 2) if count > 0 else 0,
            "overall_engagement_rate": overall_er,
        }
    def to_dict(self, tweet: TweetData) -> Dict[str, Any]:
        """Convert TweetData to dictionary."""
        return {
            "tweet_id": tweet.tweet_id,
            "url": tweet.url,
            "author_username": tweet.author_username,
            "author_profile_picture": tweet.author_profile_picture,
            "text": tweet.text,
            "likes": tweet.likes,
            "retweets": tweet.retweets,
            "replies": tweet.replies,
            "quotes": tweet.quotes,
            "views": tweet.views,
            "bookmarks": tweet.bookmarks,
            "engagement_rate": tweet.engagement_rate,
            "media_urls": tweet.media_urls,
            "created_at": tweet.created_at,
            "author_followers": tweet.author_followers,
            "is_blue_verified": tweet.is_blue_verified,
        }
    def profile_to_dict(self, profile: UserProfile) -> Dict[str, Any]:
        """Convert UserProfile to dictionary."""
        return {
            "user_id": profile.user_id,
            "username": profile.username,
            "name": profile.name,
            "followers": profile.followers,
            "following": profile.following,
            "tweet_count": profile.tweet_count,
            "description": profile.description,
            "profile_picture": profile.profile_picture,
            "banner_url": profile.banner_url,
            "is_blue_verified": profile.is_blue_verified,
            "created_at": profile.created_at,
        }
    def clear_expired_cache(self):
        """Clear expired cache entries to prevent memory bloat."""
        current_time = time.time()
        expired_profiles = [
            k for k, (_, t) in self._profile_cache.items()
            if current_time - t > self.PROFILE_CACHE_TTL
        ]
        for k in expired_profiles:
            del self._profile_cache[k]
        expired_tweets = [
            k for k, (_, t) in self._tweet_cache.items()
            if current_time - t > self.TWEET_CACHE_TTL
        ]
        for k in expired_tweets:
            del self._tweet_cache[k]
        expired_stats = [
            k for k, (_, t) in self._stats_cache.items()
            if current_time - t > self.STATS_CACHE_TTL
        ]
        for k in expired_stats:
            del self._stats_cache[k]
    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        return {
            "profiles_cached": len(self._profile_cache),
            "tweets_cached": len(self._tweet_cache),
            "stats_cached": len(self._stats_cache),
        }
_twitter_service: Optional[TwitterService] = None
def get_twitter_service() -> TwitterService:
    """Get or create TwitterService instance."""
    global _twitter_service
    if _twitter_service is None:
        _twitter_service = TwitterService()
    return _twitter_service
async def cleanup_twitter_service():
    """Cleanup function to properly close aiohttp session.
    Should be called on application shutdown.
    """
    global _twitter_service
    if _twitter_service is not None:
        await _twitter_service.close()
        _twitter_service = None
