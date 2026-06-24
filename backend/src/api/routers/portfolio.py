"""Portfolio API routes."""
import os
import json
import mimetypes
import time
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
import httpx
from ..security import get_current_user, verify_user_ownership, verify_staff_or_moderator
from ..schemas.portfolio import (
    PortfolioUpdate,
    PortfolioResponse,
    PortfolioSubmit,
    PortfolioReview,
    CanResubmitResponse,
    PortfolioHistoryResponse,
    PortfolioStatusTimelineResponse,
)
from ...models import get_db, User, Portfolio, PortfolioHistory, PortfolioStatusTimeline, PortfolioTweet, PortfolioStatus, PortfolioVote, PortfolioVoteFeedback
from ...services.twitter_service import get_twitter_service
from ...utils.image_handler import validate_and_process_image
from ...repositories.messages_db import get_messages_repository
from .websocket import broadcast_portfolio_update
import logging
import yaml
import re
_portfolio_list_cache: Dict[str, Tuple[Any, float]] = {}
_discord_members_cache: Dict[str, Tuple[Any, float]] = {}
CACHE_TTL_SECONDS = 120
DISCORD_CACHE_TTL_SECONDS = 300
TWEET_STATUS_URL_RE = re.compile(r"(?:https?://)?(?:www\.)?(?:x\.com|twitter\.com)/[^/]+/status/(\d+)", re.IGNORECASE)
def invalidate_portfolio_list_cache():
    """Invalidate the portfolio list cache when portfolios are modified."""
    global _portfolio_list_cache
    _portfolio_list_cache.clear()
    logger.info("Portfolio list cache invalidated")
def _normalize_tweet_identifier(tweet_url: Optional[str], tweet_id: Optional[str]) -> Optional[str]:
    """Normalize tweet identifiers so the same post matches across URL variants."""
    if tweet_id and tweet_id.strip():
        return f"id:{tweet_id.strip()}"
    if not tweet_url:
        return None
    normalized_url = tweet_url.strip()
    if not normalized_url:
        return None
    match = TWEET_STATUS_URL_RE.search(normalized_url)
    if match:
        return f"id:{match.group(1)}"
    normalized_url = re.sub(r"[?#].*$", "", normalized_url).rstrip("/").lower()
    return f"url:{normalized_url}" if normalized_url else None
def _get_reused_promoted_tweets(existing_tweets, submitted_tweets) -> list[str]:
    """Return submitted tweets that were already used in the last promoted portfolio."""
    existing_identifiers: Dict[str, str] = {}
    for tweet in existing_tweets:
        identifier = _normalize_tweet_identifier(tweet.tweet_url, tweet.tweet_id)
        if identifier and identifier not in existing_identifiers:
            existing_identifiers[identifier] = tweet.tweet_url or tweet.tweet_id or "tweet"
    reused_tweets: list[str] = []
    seen_identifiers: set[str] = set()
    for tweet in submitted_tweets:
        identifier = _normalize_tweet_identifier(tweet.tweet_url, tweet.tweet_id)
        if identifier and identifier in existing_identifiers and identifier not in seen_identifiers:
            reused_tweets.append(tweet.tweet_url or existing_identifiers[identifier])
            seen_identifiers.add(identifier)
    return reused_tweets
async def get_discord_member_cached(discord_id: str, force_refresh: bool = False) -> Optional[dict]:
    """Get Discord member data with caching to avoid rate limits."""
    global _discord_members_cache
    if not force_refresh and discord_id in _discord_members_cache:
        cached_data, cached_time = _discord_members_cache[discord_id]
        if time.time() - cached_time < DISCORD_CACHE_TTL_SECONDS:
            return cached_data
    if not DISCORD_BOT_TOKEN:
        return None
    try:
        guild_id = os.getenv("DISCORD_GUILD_ID", "1519094303526355194")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://discord.com/api/v10/guilds/{guild_id}/members/{discord_id}",
                headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
                timeout=5.0,
            )
            if response.status_code == 200:
                member_data = response.json()
                _discord_members_cache[discord_id] = (member_data, time.time())
                return member_data
    except httpx.TimeoutException:
        logger.warning(f"Discord API timeout for member {discord_id}")
        return None
    except Exception as e:
        logger.warning(f"Failed to fetch Discord member {discord_id}: {e}")
    return None
_guild_members_batch_cache: Optional[Tuple[dict, float]] = None
async def get_all_guild_members_cached() -> dict:
    """Fetch all guild members in one batch call and cache for 5 minutes.
    Returns dict mapping discord_id -> member_data.
    """
    global _guild_members_batch_cache
    if _guild_members_batch_cache:
        cached_data, cached_time = _guild_members_batch_cache
        if time.time() - cached_time < DISCORD_CACHE_TTL_SECONDS:
            return cached_data
    if not DISCORD_BOT_TOKEN:
        return {}
    try:
        guild_id = os.getenv("DISCORD_GUILD_ID", "1519094303526355194")
        all_members = {}
        async with httpx.AsyncClient() as client:
            after = 0
            for page in range(10):
                url = f"https://discord.com/api/v10/guilds/{guild_id}/members?limit=1000&after={after}"
                response = await client.get(
                    url,
                    headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
                    timeout=10.0,
                )
                if response.status_code != 200:
                    logger.warning(f"Discord API error on page {page}: {response.status_code}")
                    break
                members = response.json()
                if not members:
                    break
                for member in members:
                    user_id = member.get("user", {}).get("id")
                    if user_id:
                        all_members[user_id] = member
                after = members[-1]['user']['id']
                if len(members) < 1000:
                    break
        _guild_members_batch_cache = (all_members, time.time())
        logger.info(f"✅ Cached {len(all_members)} guild members")
        return all_members
    except Exception as e:
        logger.warning(f"Failed to fetch guild members batch: {e}")
        return {}
def get_role_progression_from_member(member_data: Optional[dict], target_guild: str) -> Optional[str]:
    """Compute role progression from cached member data without API calls.
    Returns string like "Drip → Frame" or "— → Drip" or None.
    """
    if not member_data or not target_guild:
        return None
    _, guild_data = _get_guild_config(target_guild)
    if not guild_data:
        return None
    tier_roles = {}
    for role_name, role_data in guild_data.get("roles", {}).items():
        tier = role_data.get("tier")
        role_id = role_data.get("id")
        if tier and role_id:
            if tier not in tier_roles:
                tier_roles[tier] = {}
            tier_roles[tier][role_id] = role_name
    if not tier_roles:
        return None
    user_roles = member_data.get("roles", [])
    current_tier = 0
    current_role_name = None
    for tier in sorted(tier_roles.keys(), reverse=True):
        for role_id, role_name in tier_roles[tier].items():
            if role_id in user_roles:
                current_tier = tier
                current_role_name = role_name.title()
                break
        if current_tier > 0:
            break
    next_tier = current_tier + 1
    if next_tier > max(tier_roles.keys()):
        return None
    next_role_name = None
    target_tier = next_tier if current_tier > 0 else 1
    if target_tier in tier_roles:
        for role_id, role_name in tier_roles[target_tier].items():
            next_role_name = role_name.title()
            break
    if current_role_name and next_role_name:
        return f"{current_role_name} → {next_role_name}"
    elif next_role_name:
        return f"Droplet → {next_role_name}"
    return None
_config_path = Path(__file__).parent.parent.parent.parent.parent / "config" / "roles.yaml"
with open(_config_path) as f:
    ROLES_CONFIG = yaml.safe_load(f)
def _get_guild_config(target_guild: Optional[str]) -> tuple[Optional[str], Optional[dict]]:
    """Return canonical guild key and config for traders/content/designers."""
    if not target_guild:
        return None, None
    target_name = target_guild.lower()
    guilds_config = ROLES_CONFIG.get("roles", {}).get("guilds", {})
    guild_config = guilds_config.get(target_name)
    if not guild_config:
        return None, None
    return target_name, guild_config
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)
router = APIRouter(prefix="/portfolio", tags=["portfolio"])
DISCORD_BOT_TOKEN = os.getenv("DISCORD_TOKEN")
REVIEW_CHANNEL_ID = os.getenv("REVIEW_CHANNEL_ID", "")
RESUBMIT_COOLDOWN_MINUTES = int(os.getenv("RESUBMIT_COOLDOWN_MINUTES", "10080"))
PROMOTION_COOLDOWN_MINUTES = int(os.getenv("PROMOTION_COOLDOWN_MINUTES", "30240"))
logger.info(f"=== PORTFOLIO CHANNEL CONFIG ===")
logger.info(f"REVIEW_CHANNEL_ID: {REVIEW_CHANNEL_ID or 'NOT SET'}")
logger.info(f"DISCORD_BOT_TOKEN: {'SET' if DISCORD_BOT_TOKEN else 'NOT SET'}")
logger.info(f"================================")
async def check_user_max_tier(discord_id: str, target_guild: str) -> Tuple[bool, Optional[str]]:
    """
    Check if user has already reached max tier (tier 3) for a guild.
    Returns (is_max_tier, role_name) tuple.
    """
    if not DISCORD_BOT_TOKEN or not target_guild:
        return False, None
    parent_guild_key, guild_data = _get_guild_config(target_guild)
    if not guild_data:
        logger.warning(f"No guild config found for target: {target_guild}")
        return False, None
    tier_3_roles = {}
    for role_name, role_data in guild_data.get("roles", {}).items():
        if role_data.get("tier") == 3:
            tier_3_roles[role_data.get("id")] = role_name
    if not tier_3_roles:
        logger.warning(f"No tier 3 roles found for guild: {parent_guild_key}")
        return False, None
    try:
        guild_id = os.getenv("DISCORD_GUILD_ID", "1519094303526355194")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://discord.com/api/v10/guilds/{guild_id}/members/{discord_id}",
                headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
                timeout=30.0,
            )
            if response.status_code == 200:
                member_data = response.json()
                user_roles = member_data.get("roles", [])
                for role_id in user_roles:
                    if role_id in tier_3_roles:
                        role_name = tier_3_roles[role_id].title()
                        logger.info(f"User {discord_id} already has tier 3 role: {role_name} ({role_id})")
                        return True, role_name
            else:
                logger.warning(f"Failed to fetch user roles: {response.status_code}")
    except Exception as e:
        logger.error(f"Error checking user max tier: {e}")
    return False, None
async def get_current_guild_role(discord_id: str, target_guild: str) -> Optional[str]:
    """
    Get the user's current role in the specified guild.
    Returns the role name (e.g., "Drip", "Frame") or None if no role.
    Uses cached Discord member data to avoid rate limits.
    """
    if not DISCORD_BOT_TOKEN or not target_guild:
        return None
    _, guild_data = _get_guild_config(target_guild)
    if not guild_data:
        return None
    tier_roles = {}
    for role_name, role_data in guild_data.get("roles", {}).items():
        tier = role_data.get("tier")
        role_id = role_data.get("id")
        if tier and role_id:
            if tier not in tier_roles:
                tier_roles[tier] = {}
            tier_roles[tier][role_id] = role_name
    if not tier_roles:
        return None
    member_data = await get_discord_member_cached(discord_id)
    if member_data:
        user_roles = member_data.get("roles", [])
        for tier in sorted(tier_roles.keys(), reverse=True):
            for role_id, role_name in tier_roles[tier].items():
                if role_id in user_roles:
                    return role_name.title()
    return None
async def get_next_tier_role(discord_id: str, target_guild: str, force_refresh: bool = False) -> Tuple[Optional[str], Optional[str]]:
    """
    Get the next tier role to assign for a user.
    Checks user's current tier in the guild and returns the next tier role ID and name.
    Returns (role_id, role_name) tuple.
    Uses cached Discord member data by default. Pass force_refresh=True before
    assigning a role so promotion decisions use the latest Discord roles.
    """
    if not DISCORD_BOT_TOKEN or not target_guild:
        return None, None
    parent_guild_key, guild_data = _get_guild_config(target_guild)
    if not guild_data:
        logger.warning(f"No guild config found for target: {target_guild}")
        return None, None
    tier_roles = {}
    for role_name, role_data in guild_data.get("roles", {}).items():
        tier = role_data.get("tier")
        role_id = role_data.get("id")
        if tier and role_id:
            if tier not in tier_roles:
                tier_roles[tier] = {}
            tier_roles[tier][role_id] = role_name
    if not tier_roles:
        logger.warning(f"No tier roles found for guild: {parent_guild_key}")
        return None, None
    user_current_tier = 0
    member_data = await get_discord_member_cached(discord_id, force_refresh=force_refresh)
    if member_data:
        user_roles = member_data.get("roles", [])
        for tier in sorted(tier_roles.keys(), reverse=True):
            for role_id in tier_roles[tier].keys():
                if role_id in user_roles:
                    user_current_tier = tier
                    logger.info(f"   User {discord_id} current tier: {tier}")
                    break
            if user_current_tier > 0:
                break
    next_tier = user_current_tier + 1
    if next_tier > max(tier_roles.keys()):
        logger.warning(f"User already at max tier for {parent_guild_key}")
        return None, None
    target_tier = next_tier if user_current_tier > 0 else 1
    if target_tier in tier_roles:
        for role_id, role_name in tier_roles[target_tier].items():
            logger.info(f"   Next tier role: {role_name.title()} (tier {target_tier}) - ID: {role_id}")
            return role_id, role_name.title()
    return None, None
async def send_discord_embed(channel_id: str, embed: dict, components: Optional[list] = None) -> Optional[str]:
    """Send embed message to Discord channel with optional voting buttons."""
    logger.info(f"📤 send_discord_embed called")
    logger.info(f"   Channel ID: {channel_id}")
    logger.info(f"   Bot Token: {'SET' if DISCORD_BOT_TOKEN else 'NOT SET'}")
    if not DISCORD_BOT_TOKEN:
        logger.error("❌ DISCORD_BOT_TOKEN is not set! Cannot send message.")
        return None
    if not channel_id:
        logger.error("❌ channel_id is empty! Cannot send message.")
        return None
    async with httpx.AsyncClient() as client:
        payload = {"embeds": [embed]}
        if components:
            payload["components"] = components
        url = f"https://discord.com/api/v10/channels/{channel_id}/messages"
        logger.info(f"   Sending to: {url}")
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=30.0,
        )
        if response.status_code == 200:
            msg_id = response.json().get("id")
            logger.info(f"✅ Message sent successfully! Message ID: {msg_id}")
            return msg_id
        logger.error(f"❌ Discord API error: {response.status_code} - {response.text}")
        return None
async def send_discord_embed_with_content(channel_id: str, content: str, embed: dict, components: Optional[list] = None) -> Optional[str]:
    """Send message with content (user mention) and embed to Discord channel with optional voting buttons."""
    logger.info(f"📤 send_discord_embed_with_content called")
    logger.info(f"   Channel ID: {channel_id}")
    logger.info(f"   Content: {content}")
    logger.info(f"   Bot Token: {'SET' if DISCORD_BOT_TOKEN else 'NOT SET'}")
    if not DISCORD_BOT_TOKEN:
        logger.error("❌ DISCORD_BOT_TOKEN is not set! Cannot send message.")
        return None
    if not channel_id:
        logger.error("❌ channel_id is empty! Cannot send message.")
        return None
    async with httpx.AsyncClient() as client:
        payload = {
            "content": content,
            "embeds": [embed]
        }
        if components:
            payload["components"] = components
        url = f"https://discord.com/api/v10/channels/{channel_id}/messages"
        logger.info(f"   Sending to: {url}")
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=30.0,
        )
        if response.status_code == 200:
            msg_id = response.json().get("id")
            logger.info(f"✅ Message sent successfully! Message ID: {msg_id}")
            return msg_id
        logger.error(f"❌ Discord API error: {response.status_code} - {response.text}")
        return None
async def send_discord_dm(user_id: str, embed: dict, file_path: str = None) -> bool:
    """Send DM to Discord user with optional file attachment."""
    logger.info(f"📨 send_discord_dm called")
    logger.info(f"   User ID: {user_id}")
    logger.info(f"   Bot Token: {'SET' if DISCORD_BOT_TOKEN else 'NOT SET'}")
    if not DISCORD_BOT_TOKEN:
        logger.error("❌ DISCORD_BOT_TOKEN is not set! Cannot send DM.")
        return False
    if not user_id:
        logger.error("❌ user_id is empty! Cannot send DM.")
        return False
    try:
        async with httpx.AsyncClient() as client:
            logger.info(f"   Creating DM channel with user {user_id}...")
            create_dm_response = await client.post(
                "https://discord.com/api/v10/users/@me/channels",
                headers={
                    "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                    "Content-Type": "application/json"
                },
                json={"recipient_id": user_id},
                timeout=10.0,
            )
            if create_dm_response.status_code != 200:
                logger.error(f"❌ Failed to create DM channel: {create_dm_response.status_code} - {create_dm_response.text}")
                return False
            dm_channel = create_dm_response.json()
            channel_id = dm_channel.get("id")
            if not channel_id:
                logger.error("❌ No channel_id in DM creation response")
                return False
            logger.info(f"   DM channel created: {channel_id}")
            logger.info(f"   Sending DM message...")
            if file_path and os.path.exists(file_path):
                import json
                payload = {
                    "payload_json": json.dumps({"embeds": [embed]})
                }
                files = {
                    "file": open(file_path, "rb")
                }
                send_response = await client.post(
                    f"https://discord.com/api/v10/channels/{channel_id}/messages",
                    headers={
                        "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                    },
                    data=payload,
                    files=files,
                    timeout=10.0,
                )
            else:
                send_response = await client.post(
                    f"https://discord.com/api/v10/channels/{channel_id}/messages",
                    headers={
                        "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                        "Content-Type": "application/json"
                    },
                    json={"embeds": [embed]},
                    timeout=10.0,
                )
            if send_response.status_code == 200:
                logger.info(f"✅ DM sent successfully to user {user_id}")
                return True
            else:
                logger.error(f"❌ Failed to send DM: {send_response.status_code} - {send_response.text}")
                return False
    except httpx.TimeoutException:
        logger.error(f"❌ Timeout sending DM to user {user_id}")
        return False
    except Exception as e:
        logger.error(f"❌ Exception sending DM to {user_id}: {e}")
        return False
GUILD_LEADERS = {}
@router.get("/list/all")
async def list_all_portfolios(
    status: Optional[str] = None,
    current_user: str = Depends(verify_staff_or_moderator),
    db: AsyncSession = Depends(get_db),
):
    """List all portfolios for Lead review.
    SECURITY: Only Staff, Moderator, Guild Leads, or Volunteer Dev can list all portfolios.
    Guild Leads see only portfolios for their guild.
    """
    user_guilds = GUILD_LEADERS.get(current_user, None)
    if user_guilds:
        cache_key = f"portfolios_list_{status or 'all'}_guild_{'_'.join(user_guilds)}"
    else:
        cache_key = f"portfolios_list_{status or 'all'}"
    if cache_key in _portfolio_list_cache:
        cached_data, cached_time = _portfolio_list_cache[cache_key]
        if time.time() - cached_time < CACHE_TTL_SECONDS:
            logger.debug(f"✅ Cache HIT for {cache_key}")
            return cached_data
    logger.debug(f"❌ Cache MISS for {cache_key}, fetching from DB...")
    from sqlalchemy.orm import selectinload
    query = select(Portfolio).options(selectinload(Portfolio.user)).order_by(Portfolio.submitted_at.desc().nullsfirst())
    if status:
        query = query.where(Portfolio.status == status)
    result = await db.execute(query)
    portfolios = result.scalars().all()
    messages_repo = get_messages_repository()
    message_counts = {}
    try:
        discord_ids = [int(p.discord_id) for p in portfolios]
        message_counts = messages_repo.get_batch_user_stats(discord_ids)
    except Exception as e:
        logger.warning(f"Failed to batch fetch message counts: {e}")
        message_counts = {}
    guild_members = {}
    if DISCORD_BOT_TOKEN:
        try:
            guild_members = await get_all_guild_members_cached()
            logger.debug(f"✅ Loaded {len(guild_members)} guild members from cache")
        except Exception as e:
            logger.warning(f"Failed to fetch guild members batch: {e}")
    portfolio_list = []
    for p in portfolios:
        if user_guilds:
            target_role = (p.target_role or "").lower()
            if target_role not in user_guilds:
                continue
        user = p.user
        message_count = message_counts.get(p.discord_id, 0)
        role_progression = None
        if p.target_role and guild_members:
            member_data = guild_members.get(p.discord_id)
            if member_data:
                role_progression = get_role_progression_from_member(member_data, p.target_role)
        portfolio_list.append({
            "id": p.id,
            "discord_id": p.discord_id,
            "username": user.username if user else "Unknown",
            "avatar_url": user.avatar_url if user else None,
            "status": p.status,
            "bio": p.bio,
            "twitter_handle": p.twitter_handle,
            "achievements": p.achievements,
            "target_role": p.target_role,
            "current_role": p.current_role,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "tweets": [{"tweet_url": t.tweet_url, "tweet_id": t.tweet_id} for t in p.tweets],
            "message_count": message_count,
            "role_progression": role_progression,
        })
    _portfolio_list_cache[cache_key] = (portfolio_list, time.time())
    logger.debug(f"✅ Cached result for {cache_key}")
    return portfolio_list
@router.get("/{discord_id}", response_model=PortfolioResponse)
async def get_portfolio(discord_id: str, include_promoted: bool = True, db: AsyncSession = Depends(get_db)):
    """Get portfolio by Discord ID.
    By default, includes PROMOTED portfolios to allow editing/resubmitting for next tier.
    Set include_promoted=false to exclude PROMOTED portfolios from dashboard view.
    """
    query = select(Portfolio).where(Portfolio.discord_id == discord_id)
    if not include_promoted:
        query = query.where(Portfolio.status != PortfolioStatus.PROMOTED.value)
    query = query.order_by(Portfolio.created_at.desc()).limit(1)
    result = await db.execute(query)
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio
@router.get("/{discord_id}/proof-image")
async def get_portfolio_proof_image(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get proof of use image for a portfolio."""
    result = await db.execute(
        select(Portfolio).where(Portfolio.discord_id == discord_id)
        .order_by(Portfolio.created_at.desc())
        .limit(1)
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio or not portfolio.proof_of_use_image:
        raise HTTPException(status_code=404, detail="Proof image not found")
    content_type, _ = mimetypes.guess_type(portfolio.proof_of_use_filename or "")
    return Response(
        content=portfolio.proof_of_use_image,
        media_type=content_type or "image/jpeg",
    )
async def _apply_portfolio_update(
    portfolio: Portfolio,
    data: PortfolioUpdate | PortfolioSubmit,
    db: AsyncSession,
    replace_tweets: bool = True,
):
    """Apply shared editable portfolio fields."""
    portfolio.bio = data.bio
    portfolio.twitter_handle = data.twitter_handle
    portfolio.achievements = data.achievements
    portfolio.notion_url = data.notion_url
    portfolio.target_role = data.target_role
    if data.other_works is not None:
        portfolio.other_works = json.dumps(data.other_works)
    if data.proof_of_use_image is not None:
        image_bytes, filename, error = validate_and_process_image(
            data.proof_of_use_image,
            data.proof_of_use_filename
        )
        if error:
            raise HTTPException(status_code=400, detail=f"Image upload failed: {error}")
        portfolio.proof_of_use_image = image_bytes
        portfolio.proof_of_use_filename = filename
        portfolio.notion_url = None
    if replace_tweets and data.tweets is not None:
        await db.refresh(portfolio, ["tweets"])
        for tweet in portfolio.tweets:
            await db.delete(tweet)
        for tweet_data in data.tweets:
            tweet = PortfolioTweet(
                portfolio_id=portfolio.id,
                tweet_url=tweet_data.tweet_url,
                tweet_id=tweet_data.tweet_id,
                content=tweet_data.content,
            )
            db.add(tweet)
    portfolio.updated_at = datetime.utcnow()
@router.put("/{discord_id}", response_model=PortfolioResponse)
async def save_portfolio(
    discord_id: str,
    data: PortfolioUpdate,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a portfolio draft without submitting it for review."""
    verify_user_ownership(current_user, discord_id)
    user_result = await db.execute(select(User).where(User.discord_id == discord_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(Portfolio)
        .where(
            Portfolio.discord_id == discord_id,
            Portfolio.status.in_([
                PortfolioStatus.DRAFT.value,
                PortfolioStatus.REJECTED.value,
                PortfolioStatus.SUBMITTED.value,
            ]),
        )
        .order_by(Portfolio.created_at.desc())
        .limit(1)
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        portfolio = Portfolio(
            user_id=user.id,
            discord_id=discord_id,
            status=PortfolioStatus.DRAFT.value,
        )
        db.add(portfolio)
        await db.flush()
    if portfolio.status == PortfolioStatus.SUBMITTED.value:
        raise HTTPException(status_code=400, detail="Submitted portfolios cannot be edited")
    portfolio.status = PortfolioStatus.DRAFT.value
    await _apply_portfolio_update(portfolio, data, db)
    await db.commit()
    await db.refresh(portfolio)
    await db.refresh(portfolio, ["tweets"])
    invalidate_portfolio_list_cache()
    return portfolio
@router.post("/submit", response_model=PortfolioResponse)
async def submit_portfolio(
    data: PortfolioSubmit,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Submit portfolio for review - creates or updates portfolio and submits it."""
    verify_user_ownership(current_user, data.discord_id)
    if not data.twitter_handle:
        raise HTTPException(status_code=400, detail="Twitter handle is required")
    if not data.tweets or len(data.tweets) < 6:
        tweet_count = len(data.tweets) if data.tweets else 0
        raise HTTPException(
            status_code=400,
            detail=f"You must add at least 6 tweets to your portfolio. Currently you have {tweet_count} tweet(s)."
        )
    if data.target_role:
        has_max_tier, tier_3_role_name = await check_user_max_tier(data.discord_id, data.target_role)
        if has_max_tier:
            raise HTTPException(
                status_code=400,
                detail=f"You have already reached the maximum tier ({tier_3_role_name}) for this guild path. You cannot submit a portfolio for further progression."
            )
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.discord_id == data.discord_id,
            Portfolio.status.in_([
                PortfolioStatus.DRAFT.value,
                PortfolioStatus.SUBMITTED.value,
                PortfolioStatus.REJECTED.value,
                PortfolioStatus.PROMOTED.value
            ])
        ).order_by(Portfolio.created_at.desc()).limit(1)
    )
    portfolio = result.scalar_one_or_none()
    if portfolio and portfolio.status == PortfolioStatus.REJECTED.value and portfolio.reviewed_at:
        cooldown_ends = portfolio.reviewed_at + timedelta(minutes=RESUBMIT_COOLDOWN_MINUTES)
        now = datetime.utcnow()
        if now < cooldown_ends:
            time_remaining = cooldown_ends - now
            days_remaining = time_remaining.days
            hours_remaining = (time_remaining.seconds // 3600)
            minutes_remaining = (time_remaining.seconds % 3600) // 60
            raise HTTPException(
                status_code=400,
                detail=f"You cannot resubmit yet. Please wait {days_remaining} days, {hours_remaining} hours, and {minutes_remaining} minutes before resubmitting your portfolio."
            )
    if portfolio and portfolio.status == PortfolioStatus.PROMOTED.value and portfolio.promoted_at:
        cooldown_ends = portfolio.promoted_at + timedelta(minutes=PROMOTION_COOLDOWN_MINUTES)
        now = datetime.utcnow()
        if now < cooldown_ends:
            time_remaining = cooldown_ends - now
            days_remaining = time_remaining.days
            hours_remaining = (time_remaining.seconds // 3600)
            minutes_remaining = (time_remaining.seconds % 3600) // 60
            raise HTTPException(
                status_code=400,
                detail=f"You cannot apply for the next tier yet. Please wait {days_remaining} days, {hours_remaining} hours, and {minutes_remaining} minutes before submitting a new portfolio."
            )
        await db.refresh(portfolio, ["tweets"])
        reused_tweets = _get_reused_promoted_tweets(portfolio.tweets, data.tweets or [])
        if reused_tweets:
            reused_preview = ", ".join(reused_tweets[:3])
            if len(reused_tweets) > 3:
                reused_preview += ", ..."
            raise HTTPException(
                status_code=400,
                detail=(
                    "You must submit new tweets when applying for the next tier. "
                    f"Remove tweets already used in your promoted portfolio: {reused_preview}"
                ),
            )
    if not portfolio:
        user_result = await db.execute(
            select(User).where(User.discord_id == data.discord_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        portfolio = Portfolio(
            user_id=user.id,
            discord_id=data.discord_id,
            status=PortfolioStatus.SUBMITTED.value,
        )
        db.add(portfolio)
        await db.flush()
        old_status = None
    else:
        old_status = portfolio.status
        if old_status == PortfolioStatus.PROMOTED.value:
            await db.execute(
                delete(PortfolioVote).where(PortfolioVote.portfolio_id == portfolio.id)
            )
            logger.info(f"🗳️ Cleared old votes for promoted portfolio (discord_id: {data.discord_id}, portfolio_id: {portfolio.id})")
    await _apply_portfolio_update(portfolio, data, db, replace_tweets=data.tweets is not None)
    portfolio.status = PortfolioStatus.SUBMITTED.value
    portfolio.submitted_at = datetime.utcnow()
    timeline_entry = PortfolioStatusTimeline(
        portfolio_id=portfolio.id,
        discord_id=data.discord_id,
        from_status=old_status,
        to_status=PortfolioStatus.SUBMITTED.value,
        action="submit",
        changed_by=None,
        notes="Resubmitting for next tier promotion" if old_status == PortfolioStatus.PROMOTED.value else ("Portfolio created and submitted" if old_status is None else None),
        changed_at=datetime.utcnow(),
    )
    db.add(timeline_entry)
    await db.commit()
    await db.refresh(portfolio)
    invalidate_portfolio_list_cache()
    logger.info(f"✅ Portfolio submitted and cache invalidated for {data.discord_id}")
    await broadcast_portfolio_update("submitted", portfolio.id, data.discord_id)
    return portfolio
@router.post("/review")
async def review_portfolio(
    data: PortfolioReview,
    current_user: str = Depends(verify_staff_or_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Review a submitted portfolio and finalize it when approved.
    SECURITY: Only Staff, Moderator, Guild Leads, or Volunteer Dev can review portfolios.
    SECURITY: Reviewer cannot review their own portfolio (self-review prevention).
    """
    verify_user_ownership(current_user, data.reviewer_id)
    if current_user == data.discord_id:
        logger.warning(f"🚫 Self-review attempt blocked - User {current_user} tried to review their own portfolio")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot review your own portfolio."
        )
    logger.info(f"")
    logger.info(f"{'='*50}")
    logger.info(f"🔍 PORTFOLIO REVIEW STARTED")
    logger.info(f"{'='*50}")
    logger.info(f"   Discord ID: {data.discord_id}")
    logger.info(f"   Reviewer: {data.reviewer_id}")
    logger.info(f"   Action: {data.action}")
    logger.info(f"   Feedback: {data.feedback}")
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.discord_id == data.discord_id,
            Portfolio.status == PortfolioStatus.SUBMITTED.value
        ).order_by(Portfolio.created_at.desc()).limit(1)
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        logger.error(f"❌ No submitted portfolio found for {data.discord_id}")
        raise HTTPException(status_code=404, detail="No submitted portfolio found")
    logger.info(f"   Portfolio ID: {portfolio.id}")
    logger.info(f"   Current Status: {portfolio.status}")
    if data.action == "approve":
        portfolio.status = PortfolioStatus.PENDING_VOTE.value
    elif data.action == "request_changes":
        portfolio.status = PortfolioStatus.DRAFT.value
    elif data.action == "reject":
        portfolio.status = PortfolioStatus.REJECTED.value
    else:
        logger.error(f"❌ Invalid action: {data.action}")
        raise HTTPException(status_code=400, detail=f"Invalid action: {data.action}")
    portfolio.reviewer_id = data.reviewer_id
    portfolio.reviewed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(portfolio)
    logger.info(f"🔒 Portfolio {portfolio.id} status locked to {portfolio.status}")
    user_result = await db.execute(select(User).where(User.id == portfolio.user_id))
    user = user_result.scalar_one_or_none()
    username = user.username if user else "Unknown"
    avatar_url = user.avatar_url if user else None
    logger.info(f"   Username: {username}")
    discord_message_id = None
    if data.action == "approve":
        await db.execute(delete(PortfolioVote).where(PortfolioVote.portfolio_id == portfolio.id))
        await db.execute(delete(PortfolioVoteFeedback).where(PortfolioVoteFeedback.portfolio_id == portfolio.id))
        portfolio.review_feedback = data.feedback
        await db.commit()
        finalize_result = await finalize_portfolio(
            discord_id=data.discord_id,
            current_user=current_user,
            db=db,
        )
        finalize_result["review_feedback"] = data.feedback
        return finalize_result
    elif data.action == "request_changes":
        portfolio.review_feedback = data.feedback
        portfolio.rejection_reason = None
        logger.info(f"")
        logger.info(f"📨 SENDING REQUEST_CHANGES DM")
        logger.info(f"   User Discord ID: {data.discord_id}")
        logger.info(f"   Feedback: {data.feedback}")
        frontend_url = os.getenv("FRONTEND_URL", "https://liquid.community")
        portfolio_url = f"{frontend_url}/portfolio"
        dm_embed = {
            "title": "⚠️ portfolio needs changes",
            "color": 0xF59E0B,
            "fields": [
                {"name": "**feedback**", "value": data.feedback if data.feedback else "no feedback provided", "inline": False},
                {"name": "**next steps**", "value": f"update your portfolio based on the feedback and resubmit when ready.\n\n[edit portfolio]({portfolio_url})", "inline": False},
            ],
            "image": {"url": "https://files.catbox.moe/db9slo.png"},
        }
        dm_sent = await send_discord_dm(data.discord_id, dm_embed)
        if dm_sent:
            logger.info(f"✅ Request-changes DM sent successfully!")
        else:
            logger.warning(f"⚠️ Failed to send request-changes DM (user may have DMs disabled)")
    elif data.action == "reject":
        portfolio.rejection_reason = data.feedback
        logger.info(f"")
        logger.info(f"📨 SENDING REJECTION DM")
        logger.info(f"   User Discord ID: {data.discord_id}")
        logger.info(f"   Rejection reason: {data.feedback}")
        frontend_url = os.getenv("FRONTEND_URL", "https://liquid.community")
        portfolio_url = f"{frontend_url}/portfolios/{data.discord_id}"
        cooldown_days = RESUBMIT_COOLDOWN_MINUTES // (24 * 60)
        cooldown_ends = datetime.utcnow() + timedelta(minutes=RESUBMIT_COOLDOWN_MINUTES)
        cooldown_timestamp = int(cooldown_ends.timestamp())
        dm_embed = {
            "title": "<:no:1471388886683877416> portfolio rejected",
            "color": 0xFF4444,
            "fields": [
                {"name": "**reason**", "value": data.feedback if data.feedback else "no reason provided", "inline": False},
                {"name": "**resubmission cooldown**", "value": f"you can resubmit (<t:{cooldown_timestamp}:R>)", "inline": False},
                {"name": "**next steps**", "value": f"update your portfolio based on the feedback and resubmit after the previously mentioned period.\n\n[view portfolio]({portfolio_url})", "inline": False},
            ],
            "image": {"url": "https://files.catbox.moe/db9slo.png"},
        }
        dm_sent = await send_discord_dm(data.discord_id, dm_embed)
        if dm_sent:
            logger.info(f"✅ Rejection DM sent successfully!")
        else:
            logger.warning(f"⚠️ Failed to send rejection DM (user may have DMs disabled)")
    old_status = PortfolioStatus.SUBMITTED.value
    new_status = portfolio.status
    timeline_entry = PortfolioStatusTimeline(
        portfolio_id=portfolio.id,
        discord_id=data.discord_id,
        from_status=old_status,
        to_status=new_status,
        action=data.action,
        changed_by=data.reviewer_id,
        notes=data.feedback,
        changed_at=datetime.utcnow(),
    )
    db.add(timeline_entry)
    await db.commit()
    invalidate_portfolio_list_cache()
    logger.info(f"✅ Portfolio reviewed and cache invalidated for {data.discord_id}")
    event_type = "approved" if data.action == "approve" else "rejected"
    await broadcast_portfolio_update(event_type, portfolio.id, data.discord_id)
    return {
        "success": True,
        "status": portfolio.status,
        "discord_message_id": discord_message_id,
    }
@router.delete("/{discord_id}")
async def delete_portfolio(
    discord_id: str,
    current_user: str = Depends(verify_staff_or_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Delete a portfolio and related records, but preserve tweets.
    SECURITY: Only Staff, Moderator, Guild Leads, or Volunteer Dev can delete portfolios.
    """
    from sqlalchemy import delete
    from ...models import UserSavedTweet
    result = await db.execute(
        select(Portfolio).where(Portfolio.discord_id == discord_id)
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    portfolio_id = portfolio.id
    if portfolio.tweets:
        await db.execute(delete(UserSavedTweet).where(UserSavedTweet.discord_id == discord_id))
        for tweet in portfolio.tweets:
            saved_tweet = UserSavedTweet(
                discord_id=discord_id,
                tweet_url=tweet.tweet_url,
                tweet_id=tweet.tweet_id,
            )
            db.add(saved_tweet)
    await db.execute(delete(PortfolioVote).where(PortfolioVote.portfolio_id == portfolio_id))
    await db.execute(delete(PortfolioTweet).where(PortfolioTweet.portfolio_id == portfolio_id))
    await db.execute(delete(Portfolio).where(Portfolio.id == portfolio_id))
    await db.commit()
    invalidate_portfolio_list_cache()
    logger.info(f"✅ Portfolio deleted and cache invalidated for {discord_id}")
    await broadcast_portfolio_update("deleted", portfolio_id, discord_id)
    return {"success": True}
@router.delete("/admin/user/{discord_id}")
async def delete_user_all_data(
    discord_id: str,
    current_user: str = Depends(verify_staff_or_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Delete all user data needed by the portfolio site.
    SECURITY: Only Staff, Moderator, Guild Leads, or Volunteer Dev can delete user data.
    """
    from ...models import UserSavedTweet
    logger.info(f"")
    logger.info(f"{'='*60}")
    logger.info(f"🗑️ DELETE USER DATA REQUEST")
    logger.info(f"{'='*60}")
    logger.info(f"   Target Discord ID: {discord_id}")
    logger.info(f"   Initiated by: {current_user}")
    try:
        portfolios_result = await db.execute(
            select(Portfolio).where(Portfolio.discord_id == discord_id)
        )
        portfolios = portfolios_result.scalars().all()
        for portfolio in portfolios:
            await db.execute(delete(PortfolioVote).where(PortfolioVote.portfolio_id == portfolio.id))
            await db.execute(delete(PortfolioVoteFeedback).where(PortfolioVoteFeedback.portfolio_id == portfolio.id))
            await db.execute(delete(PortfolioTweet).where(PortfolioTweet.portfolio_id == portfolio.id))
            await db.execute(delete(PortfolioHistory).where(PortfolioHistory.portfolio_id == portfolio.id))
            await db.execute(delete(PortfolioStatusTimeline).where(PortfolioStatusTimeline.portfolio_id == portfolio.id))
        await db.execute(delete(PortfolioHistory).where(PortfolioHistory.discord_id == discord_id))
        await db.execute(delete(PortfolioStatusTimeline).where(PortfolioStatusTimeline.discord_id == discord_id))
        await db.execute(delete(Portfolio).where(Portfolio.discord_id == discord_id))
        await db.execute(delete(UserSavedTweet).where(UserSavedTweet.discord_id == discord_id))
        await db.execute(delete(User).where(User.discord_id == discord_id))
        await db.commit()
        invalidate_portfolio_list_cache()
        logger.info(f"✅ USER DATA DELETED SUCCESSFULLY")
        logger.info(f"   All records for {discord_id} have been removed from the database")
        return {"success": True, "message": f"User {discord_id} and all associated data have been deleted"}
    except Exception as e:
        logger.error(f"❌ ERROR DELETING USER DATA: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete user data: {str(e)}")
@router.get("/{discord_id}/can-resubmit", response_model=CanResubmitResponse)
async def can_resubmit(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Check if user can resubmit after rejection or apply for next tier after promotion."""
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.discord_id == discord_id,
            Portfolio.status == PortfolioStatus.REJECTED.value
        ).order_by(Portfolio.reviewed_at.desc())
    )
    portfolio = result.scalar_one_or_none()
    if portfolio and portfolio.reviewed_at:
        cooldown_ends = portfolio.reviewed_at + timedelta(minutes=RESUBMIT_COOLDOWN_MINUTES)
        now = datetime.utcnow()
        if now >= cooldown_ends:
            return CanResubmitResponse(can_resubmit=True)
        days_remaining = (cooldown_ends - now).days + 1
        return CanResubmitResponse(
            can_resubmit=False,
            cooldown_ends=cooldown_ends,
            days_remaining=days_remaining,
        )
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.discord_id == discord_id,
            Portfolio.status == PortfolioStatus.PROMOTED.value
        ).order_by(Portfolio.promoted_at.desc())
    )
    portfolio = result.scalar_one_or_none()
    if portfolio and portfolio.promoted_at:
        cooldown_ends = portfolio.promoted_at + timedelta(minutes=PROMOTION_COOLDOWN_MINUTES)
        now = datetime.utcnow()
        if now >= cooldown_ends:
            return CanResubmitResponse(can_resubmit=True)
        days_remaining = (cooldown_ends - now).days + 1
        return CanResubmitResponse(
            can_resubmit=False,
            cooldown_ends=cooldown_ends,
            days_remaining=days_remaining,
        )
    return CanResubmitResponse(can_resubmit=True)
@router.get("/{discord_id}/history", response_model=list[PortfolioHistoryResponse])
async def get_history(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get portfolio promotion history."""
    result = await db.execute(
        select(PortfolioHistory).where(
            PortfolioHistory.discord_id == discord_id
        ).order_by(PortfolioHistory.promoted_at.desc())
    )
    history = result.scalars().all()
    return history
@router.get("/{discord_id}/timeline", response_model=list[PortfolioStatusTimelineResponse])
async def get_portfolio_timeline(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get portfolio status timeline (all status changes throughout review process)."""
    timeline_result = await db.execute(
        select(PortfolioStatusTimeline).where(
            PortfolioStatusTimeline.discord_id == discord_id
        ).order_by(PortfolioStatusTimeline.changed_at.asc())
    )
    timeline_entries = timeline_result.scalars().all()
    if not timeline_entries:
        return []
    result = await db.execute(
        select(Portfolio).where(
            Portfolio.discord_id == discord_id
        ).order_by(Portfolio.created_at.desc()).limit(1)
    )
    portfolio = result.scalar_one_or_none()
    resolved_target_role = portfolio.target_role if portfolio else None
    if portfolio and portfolio.target_role:
        _, role_name = await get_next_tier_role(discord_id, portfolio.target_role, force_refresh=True)
        if role_name:
            resolved_target_role = role_name
    entries_with_role = []
    for entry in timeline_entries:
        entry_dict = {
            "id": entry.id,
            "from_status": entry.from_status,
            "to_status": entry.to_status,
            "action": entry.action,
            "changed_by": entry.changed_by,
            "notes": entry.notes,
            "changed_at": entry.changed_at,
            "target_role": resolved_target_role,
        }
        entries_with_role.append(entry_dict)
    return entries_with_role
async def finalize_portfolio(
    discord_id: str,
    current_user: str = Depends(verify_staff_or_moderator),
    db: AsyncSession = Depends(get_db),
):
    """Finalize an approved portfolio after reviewer approval.
    This function is called internally by review_portfolio().
    """
    global _guild_members_batch_cache
    result = await db.execute(
        select(Portfolio)
        .where(
            Portfolio.discord_id == discord_id,
            Portfolio.status == PortfolioStatus.PENDING_VOTE.value
        )
        .with_for_update()
    )
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="No pending portfolio found or already finalized")
    portfolio.status = PortfolioStatus.PROMOTED.value
    portfolio.promoted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(portfolio)
    logger.info(f"🔒 Portfolio {portfolio.id} status locked to {portfolio.status}")
    user_result = await db.execute(select(User).where(User.id == portfolio.user_id))
    user = user_result.scalar_one_or_none()
    promoted_role_id = None
    promoted_role_name = None
    logger.info(f"")
    logger.info(f"🎖️ ROLE ASSIGNMENT INITIATED")
    logger.info(f"   User Discord ID: {discord_id}")
    logger.info(f"   Portfolio ID: {portfolio.id}")
    if DISCORD_BOT_TOKEN:
        try:
            guild_id = os.getenv("DISCORD_GUILD_ID", "1519094303526355194")
            target_name = (portfolio.target_role or "").lower()
            logger.info(f"   Target Name: {target_name}")
            logger.info(f"   Discord Guild ID: {guild_id}")
            guilds_config = ROLES_CONFIG.get("roles", {}).get("guilds", {})
            guild_config = guilds_config.get(target_name, {})
            logger.info(f"   Guild Config Found: {bool(guild_config)}")
            promoted_role_id, promoted_role_name = await get_next_tier_role(
                discord_id,
                portfolio.target_role or target_name,
                force_refresh=True,
            )
            if not promoted_role_id:
                logger.warning(f"❌ Could not determine next tier role for user {discord_id} in {target_name}")
            logger.info(f"   Promoted Role Name: {promoted_role_name}")
            if promoted_role_id:
                logger.info(f"   🔄 Calling Discord API...")
                async with httpx.AsyncClient() as client:
                    logger.info(f"   ➕ ADDING NEW TIER ROLE")
                    api_url = f"https://discord.com/api/v10/guilds/{guild_id}/members/{discord_id}/roles/{promoted_role_id}"
                    logger.info(f"   API Endpoint: {api_url}")
                    try:
                        response = await client.put(
                            api_url,
                            headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
                            timeout=30.0,
                        )
                        logger.info(f"   Discord API Response Code: {response.status_code}")
                        if response.status_code == 204:
                            _discord_members_cache.pop(discord_id, None)
                            _guild_members_batch_cache = None
                            logger.info(f"✅ ROLE ASSIGNED SUCCESSFULLY!")
                            logger.info(f"   User {discord_id} → Role {promoted_role_name} ({promoted_role_id})")
                        elif response.status_code == 404:
                            logger.error(f"❌ Discord API Error: 404 Not Found")
                            logger.error(f"   User or Role not found in guild")
                            logger.error(f"   User ID: {discord_id}")
                            logger.error(f"   Role ID: {promoted_role_id}")
                            logger.error(f"   Guild ID: {guild_id}")
                        elif response.status_code == 403:
                            logger.error(f"❌ Discord API Error: 403 Forbidden")
                            logger.error(f"   Bot lacks permission to assign this role")
                            logger.error(f"   Ensure bot role is ABOVE target role in server settings")
                        elif response.status_code == 401:
                            logger.error(f"❌ Discord API Error: 401 Unauthorized")
                            logger.error(f"   Bot token is invalid or expired")
                        else:
                            logger.warning(f"⚠️ Discord API Warning")
                            logger.warning(f"   Status: {response.status_code}")
                            logger.warning(f"   Response: {response.text}")
                    except httpx.TimeoutException:
                        logger.error(f"❌ Discord API Timeout")
                        logger.error(f"   Request timed out after 30 seconds")
                    except httpx.RequestError as req_err:
                        logger.error(f"❌ Discord API Request Error")
                        logger.error(f"   Network error: {req_err}")
            else:
                logger.warning(f"❌ NO ROLE ID FOUND")
                logger.warning(f"   Target '{target_name}' has no 'role_id' in roles.yaml")
        except Exception as e:
            logger.error(f"❌ ROLE ASSIGNMENT FAILED")
            logger.error(f"   Error: {e}")
            logger.error(f"   Exception Type: {type(e).__name__}")
            import traceback
            logger.error(f"   Traceback: {traceback.format_exc()}")
    history = PortfolioHistory(
        portfolio_id=portfolio.id,
        discord_id=discord_id,
        from_role=portfolio.current_role or "Droplet",
        to_role=promoted_role_name or "Unknown",
    )
    db.add(history)
    portfolio.reviewed_at = datetime.utcnow()
    logger.info(f"✅ MARKED PORTFOLIO AS PROMOTED")
    logger.info(f"   Portfolio ID: {portfolio.id}")
    logger.info(f"   Status: PROMOTED")
    logger.info(f"   Portfolio remains visible to reviewers for audit purposes")
    logger.info(f"   User {discord_id} can now submit a new portfolio for next tier")
    timeline_action = "promoted"
    timeline_notes = f"Promoted role: {promoted_role_name}" if promoted_role_name else "Promotion approved"
    timeline_entry = PortfolioStatusTimeline(
        portfolio_id=portfolio.id,
        discord_id=discord_id,
        from_status=PortfolioStatus.SUBMITTED.value,
        to_status=portfolio.status,
        action=timeline_action,
        changed_by=current_user,
        notes=timeline_notes,
        changed_at=datetime.utcnow(),
    )
    db.add(timeline_entry)
    await db.commit()
    invalidate_portfolio_list_cache()
    logger.info(f"✅ Portfolio finalized and cache invalidated for {discord_id}")
    event_type = "promoted"
    await broadcast_portfolio_update(event_type, portfolio.id, discord_id)
    return {
        "success": True,
        "status": portfolio.status,
        "discord_id": discord_id,
        "username": user.username if user else "Unknown",
        "to_role": portfolio.target_role,
        "promoted_role_id": promoted_role_id,
        "promoted_role_name": promoted_role_name,
    }
