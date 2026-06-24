"""Twitter API routes."""
import asyncio
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from ...services.twitter_service import get_twitter_service, TwitterService
from ...repositories.messages_db import get_messages_repository, MessagesRepository
router = APIRouter(prefix="/twitter", tags=["twitter"])
def get_services() -> tuple[TwitterService, MessagesRepository]:
    """Get service instances."""
    return get_twitter_service(), get_messages_repository()
@router.get("/profile/{username}")
async def get_twitter_profile(username: str):
    """Get Twitter profile by username."""
    twitter_service, _ = get_services()
    profile = await twitter_service.fetch_user_profile(username)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found or API unavailable")
    return twitter_service.profile_to_dict(profile)
@router.post("/profiles/batch")
async def get_twitter_profiles_batch(usernames: list[str]):
    """Get multiple Twitter profiles in one request.
    OPTIMIZATION: Batch endpoint to reduce HTTP requests from frontend.
    Instead of N requests, frontend makes 1 request for N profiles.
    """
    twitter_service, _ = get_services()
    if not usernames:
        return []
    usernames = usernames[:50]
    unique_usernames = list(set(u.lstrip("@").lower() for u in usernames if u))
    profiles = []
    batch_size = 5
    for i in range(0, len(unique_usernames), batch_size):
        batch = unique_usernames[i:i + batch_size]
        batch_results = await asyncio.gather(
            *[twitter_service.fetch_user_profile(username) for username in batch],
            return_exceptions=True
        )
        for username, result in zip(batch, batch_results):
            if isinstance(result, Exception):
                continue
            if result:
                profiles.append({
                    "username": username,
                    "profile": twitter_service.profile_to_dict(result)
                })
    return profiles
@router.get("/tweet/{tweet_id}")
async def get_tweet(tweet_id: str):
    """Get single tweet data."""
    twitter_service, _ = get_services()
    tweet = await twitter_service.fetch_tweet_data(tweet_id)
    if not tweet:
        raise HTTPException(status_code=404, detail="Tweet not found or API unavailable")
    return twitter_service.to_dict(tweet)
@router.get("/tweets")
async def get_tweets(tweet_ids: str = Query(..., description="Comma-separated tweet IDs")):
    """Get multiple tweets data."""
    twitter_service, _ = get_services()
    ids_list = [tid.strip() for tid in tweet_ids.split(",") if tid.strip()]
    if not ids_list:
        return []
    tweets = await twitter_service.fetch_tweets_batch(ids_list[:20])
    return [twitter_service.to_dict(t) for t in tweets]
@router.get("/stats/{discord_id}")
async def get_twitter_stats(discord_id: str):
    """Get Twitter engagement stats for a Discord user."""
    twitter_service, messages_repo = get_services()
    tweet_urls, detected_username = messages_repo.get_user_tweet_urls(int(discord_id))
    tweet_ids = messages_repo.get_user_tweets(int(discord_id))
    if not detected_username:
        return {
            "total_likes": 0,
            "total_retweets": 0,
            "total_replies": 0,
            "total_views": 0,
            "tweet_count": len(tweet_ids),
            "avg_engagement_rate": 0,
        }
    if tweet_ids:
        tweets_data = await twitter_service.fetch_tweets_batch(tweet_ids[:20])
    else:
        tweets_data = await twitter_service.get_user_tweets(detected_username, limit=20)
    stats = twitter_service.calculate_total_stats(tweets_data)
    return {
        "total_likes": stats.get("total_likes", 0),
        "total_retweets": stats.get("total_retweets", 0),
        "total_replies": stats.get("total_replies", 0),
        "total_views": stats.get("total_views", 0),
        "tweet_count": len(tweet_ids),
        "avg_engagement_rate": stats.get("avg_engagement_rate", 0),
        "overall_engagement_rate": stats.get("overall_engagement_rate", 0),
    }
@router.get("/user/{discord_id}/tweets")
async def get_user_tweet_ids(discord_id: str):
    """Get tweet IDs posted by a Discord user in the Twitter channel."""
    _, messages_repo = get_services()
    tweet_urls, detected_username = messages_repo.get_user_tweet_urls(int(discord_id))
    tweet_ids = messages_repo.get_user_tweets(int(discord_id))
    return {
        "tweet_ids": tweet_ids,
        "tweet_urls": tweet_urls,
        "detected_username": detected_username,
        "count": len(tweet_ids),
    }
@router.get("/portfolio/{discord_id}/stats")
async def get_portfolio_twitter_stats(discord_id: str):
    """Get Twitter stats from portfolio tweets (fetches from Twitter API)."""
    import re
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from ...models import get_db, Portfolio
    twitter_service, _ = get_services()
    async for db in get_db():
        result = await db.execute(
            select(Portfolio).where(Portfolio.discord_id == discord_id).order_by(Portfolio.created_at.desc()).limit(1)
        )
        portfolio = result.scalar_one_or_none()
        if not portfolio or not portfolio.tweets:
            return {
                "total_likes": 0,
                "total_retweets": 0,
                "total_replies": 0,
                "total_views": 0,
                "tweet_count": 0,
                "avg_engagement_rate": 0,
                "tweets": [],
            }
        tweet_ids = []
        for t in portfolio.tweets:
            match = re.search(r'/status/(\d+)', t.tweet_url)
            if match:
                tweet_ids.append(match.group(1))
        if not tweet_ids:
            return {
                "total_likes": 0,
                "total_retweets": 0,
                "total_replies": 0,
                "total_views": 0,
                "tweet_count": len(portfolio.tweets),
                "avg_engagement_rate": 0,
                "tweets": [],
            }
        tweets_data = await twitter_service.fetch_tweets_batch(tweet_ids[:20])
        if not tweets_data:
            return {
                "total_likes": 0,
                "total_retweets": 0,
                "total_replies": 0,
                "total_views": 0,
                "tweet_count": len(tweet_ids),
                "avg_engagement_rate": 0,
                "tweets": [],
            }
        stats = twitter_service.calculate_total_stats(tweets_data)
        return {
            "total_likes": stats.get("total_likes", 0),
            "total_retweets": stats.get("total_retweets", 0),
            "total_replies": stats.get("total_replies", 0),
            "total_views": stats.get("total_views", 0),
            "tweet_count": len(tweet_ids),
            "avg_engagement_rate": stats.get("avg_engagement_rate", 0),
            "overall_engagement_rate": stats.get("overall_engagement_rate", 0),
            "tweets": [twitter_service.to_dict(t) for t in tweets_data],
        }
@router.get("/user/{discord_id}/full")
async def get_user_twitter_full(discord_id: str):
    """Get full Twitter data for a Discord user (profile + stats + tweets).
    OPTIMIZATION: Fetches tweets first, then extracts profile from tweets
    to avoid duplicate API call (saves 1 request per call).
    """
    twitter_service, messages_repo = get_services()
    tweet_urls, detected_username = messages_repo.get_user_tweet_urls(int(discord_id))
    tweet_ids = messages_repo.get_user_tweets(int(discord_id))
    result = {
        "tweet_ids": tweet_ids,
        "tweet_urls": tweet_urls,
        "detected_username": detected_username,
        "tweet_count": len(tweet_ids),
        "profile": None,
        "stats": None,
        "recent_tweets": [],
    }
    if detected_username:
        tweets_data = await twitter_service.get_user_tweets(detected_username, limit=20)
        if tweets_data:
            profile = twitter_service.extract_profile_from_tweets(tweets_data)
            if profile:
                result["profile"] = twitter_service.profile_to_dict(profile)
            result["stats"] = twitter_service.calculate_total_stats(tweets_data)
            result["recent_tweets"] = [twitter_service.to_dict(t) for t in tweets_data[:5]]
    return result
@router.get("/cache/stats")
async def get_cache_stats():
    """Get Twitter API cache statistics."""
    twitter_service, _ = get_services()
    stats = twitter_service.get_cache_stats()
    return {
        "cache_enabled": True,
        "cache_type": "in-memory",
        "profiles_cached": stats["profiles_cached"],
        "tweets_cached": stats["tweets_cached"],
        "stats_cached": stats["stats_cached"],
        "profile_ttl_seconds": twitter_service.PROFILE_CACHE_TTL,
        "tweet_ttl_seconds": twitter_service.TWEET_CACHE_TTL,
    }
@router.post("/cache/clear")
async def clear_cache():
    """Clear expired Twitter API cache entries."""
    twitter_service, _ = get_services()
    twitter_service.clear_expired_cache()
    return {
        "success": True,
        "message": "Expired cache entries cleared",
        "remaining": twitter_service.get_cache_stats(),
    }
