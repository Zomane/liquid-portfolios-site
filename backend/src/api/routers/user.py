"""User API routes."""
from datetime import datetime, timedelta
import json
import os
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
import yaml
from ..schemas.user import UserResponse, UserStats, UserDashboard, ServerStats, LeaderboardEntry, MyStatsResponse, ActivityLevel
from ...models import get_db, User, Portfolio, PortfolioHistory, PortfolioStatus, PortfolioStatusTimeline
router = APIRouter(prefix="/user", tags=["user"])
ROLES_CONFIG = {}
_config_path = Path(__file__).parent.parent.parent.parent.parent / "config" / "roles.yaml"
try:
    with open(_config_path) as f:
        ROLES_CONFIG = yaml.safe_load(f)
except Exception as e:
    print(f"Warning: Could not load roles.yaml: {e}")
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "")
DISCORD_GUILD_IDS = [guild_id.strip() for guild_id in os.getenv("DISCORD_GUILD_IDS", "").split(",") if guild_id.strip()]
DISCORD_API_BASE = "https://discord.com/api/v10"
def _format_role_display_name(role_name: str) -> str:
    """Format role names to Title Case with no special characters."""
    cleaned = re.sub(r"[^a-zA-Z0-9\s_]", " ", role_name or "")
    cleaned = cleaned.replace("_", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.title()
async def _fetch_discord_member_role_ids(discord_id: str) -> list[str]:
    """Fetch Discord member role IDs from configured guilds."""
    if not DISCORD_TOKEN:
        return []
    guild_ids = []
    if DISCORD_GUILD_ID:
        guild_ids.append(DISCORD_GUILD_ID)
    guild_ids.extend([guild_id for guild_id in DISCORD_GUILD_IDS if guild_id not in guild_ids])
    if not guild_ids:
        return []
    try:
        timeout_config = httpx.Timeout(timeout=15.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            headers = {"Authorization": f"Bot {DISCORD_TOKEN}"}
            for guild_id in guild_ids:
                response = await client.get(
                    f"{DISCORD_API_BASE}/guilds/{guild_id}/members/{discord_id}",
                    headers=headers,
                )
                if response.status_code == 200:
                    member_data = response.json()
                    return [str(role_id) for role_id in member_data.get("roles", [])]
        return []
    except Exception as e:
        error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
        print(f"Error fetching Discord member roles for {discord_id}: {error_detail}")
        return []
async def _get_highest_community_role(discord_id: str) -> str | None:
    """Get highest community role name from roles.yaml based on user's Discord roles."""
    community_roles = ROLES_CONFIG.get("roles", {}).get("community", {})
    if not community_roles:
        return None
    user_role_ids = await _fetch_discord_member_role_ids(discord_id)
    if not user_role_ids:
        return None
    highest_role = None
    for role_name, role_id in community_roles.items():
        normalized_role_name = (role_name or "").strip().lower().replace("_", " ")
        if normalized_role_name == "event winner":
            continue
        if str(role_id) in user_role_ids:
            highest_role = role_name
    return _format_role_display_name(highest_role) if highest_role else None
def _get_highest_role_from_tier(guild_name: str, tier: int) -> tuple[str, int] | None:
    """Get the highest role name for a guild member based on tier."""
    if not ROLES_CONFIG:
        return None
    guilds = ROLES_CONFIG.get("roles", {}).get("guilds", {})
    guild = guilds.get(guild_name.lower())
    if not guild:
        return None
    roles = guild.get("roles", {})
    matching_roles = []
    for role_name, role_data in roles.items():
        role_tier = role_data.get("tier", 0)
        if role_tier <= tier:
            matching_roles.append((role_name, role_tier))
    if not matching_roles:
        return None
    matching_roles.sort(key=lambda x: x[1], reverse=True)
    highest_role_name = matching_roles[0][0]
    highest_tier = matching_roles[0][1]
    return (highest_role_name.title(), highest_tier)
async def _fetch_discord_avatar(discord_id: str) -> str | None:
    """Fetch user's avatar URL from Discord API."""
    if not DISCORD_TOKEN:
        return None
    try:
        timeout_config = httpx.Timeout(timeout=15.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            headers = {"Authorization": f"Bot {DISCORD_TOKEN}"}
            response = await client.get(
                f"{DISCORD_API_BASE}/users/{discord_id}",
                headers=headers,
            )
            if response.status_code == 200:
                user_data = response.json()
                if user_data.get("avatar"):
                    return f"https://cdn.discordapp.com/avatars/{discord_id}/{user_data['avatar']}.png?size=512"
            return None
    except Exception as e:
        error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
        print(f"Error fetching Discord avatar for {discord_id}: {error_detail}")
        return None
@router.get("/{discord_id}/stats", response_model=UserStats)
async def get_user_stats(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get user statistics with Discord API data and highest role."""
    result = await db.execute(select(User).where(User.discord_id == discord_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    portfolio_count = await db.execute(
        select(func.count(Portfolio.id)).where(Portfolio.discord_id == discord_id)
    )
    portfolios_submitted = portfolio_count.scalar() or 0
    highest_role = await _get_highest_community_role(discord_id)
    highest_tier = None
    avatar_url = await _fetch_discord_avatar(discord_id)
    if not avatar_url:
        avatar_url = user.avatar_url
    from ...repositories.messages_db import get_messages_repository
    messages_repo = get_messages_repository()
    real_stats = messages_repo.get_user_stats(int(discord_id))
    message_count = real_stats.get("message_count", 0)
    return UserStats(
        discord_id=user.discord_id,
        username=user.username,
        avatar_url=avatar_url,
        message_count=message_count,
        portfolios_submitted=portfolios_submitted,
        quests_completed=0,
        highest_role=highest_role,
        highest_tier=highest_tier,
        guild=None,
        guild_tier=None,
    )
@router.get("/{discord_id}/tweets")
async def get_user_tweets(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get user's shared tweets from portfolios or saved tweets."""
    from ...models import UserSavedTweet
    result = await db.execute(
        select(Portfolio)
        .where(Portfolio.discord_id == discord_id)
        .order_by(Portfolio.created_at.desc())
        .limit(1)
    )
    portfolio = result.scalar_one_or_none()
    if portfolio and portfolio.tweets:
        return [
            {
                "tweet_url": t.tweet_url,
                "content": t.content,
                "tweet_id": t.tweet_id,
            }
            for t in portfolio.tweets
        ]
    saved_result = await db.execute(
        select(UserSavedTweet).where(UserSavedTweet.discord_id == discord_id)
    )
    saved_tweets = saved_result.scalars().all()
    return [
        {
            "tweet_url": t.tweet_url,
            "content": None,
            "tweet_id": t.tweet_id,
        }
        for t in saved_tweets
    ]
@router.get("/{discord_id}/dashboard", response_model=UserDashboard)
async def get_user_dashboard(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get comprehensive dashboard data."""
    result = await db.execute(select(User).where(User.discord_id == discord_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    stats = await get_user_stats(discord_id, db)
    from ...repositories.messages_db import get_messages_repository
    messages_repo = get_messages_repository()
    real_stats = messages_repo.get_user_stats(int(discord_id))
    real_message_count = real_stats.get("message_count", 0)
    portfolio_result = await db.execute(
        select(Portfolio).where(Portfolio.discord_id == discord_id).order_by(Portfolio.created_at.desc()).limit(1)
    )
    portfolio = portfolio_result.scalar_one_or_none()
    portfolio_data = None
    if portfolio:
        can_resubmit = True
        cooldown_ends = None
        days_remaining = None
        hours_remaining = None
        minutes_remaining = None
        RESUBMIT_COOLDOWN_MINUTES = int(os.getenv("RESUBMIT_COOLDOWN_MINUTES", "10080"))
        PROMOTION_COOLDOWN_MINUTES = int(os.getenv("PROMOTION_COOLDOWN_MINUTES", "30240"))
        if portfolio.status == PortfolioStatus.REJECTED.value and portfolio.reviewed_at:
            cooldown_ends = portfolio.reviewed_at + timedelta(minutes=RESUBMIT_COOLDOWN_MINUTES)
            now = datetime.utcnow()
            if now < cooldown_ends:
                can_resubmit = False
                time_remaining = cooldown_ends - now
                days_remaining = time_remaining.days
                hours_remaining = (time_remaining.seconds // 3600)
                minutes_remaining = (time_remaining.seconds % 3600) // 60
        elif portfolio.status == PortfolioStatus.PROMOTED.value and portfolio.promoted_at:
            cooldown_ends = portfolio.promoted_at + timedelta(minutes=PROMOTION_COOLDOWN_MINUTES)
            now = datetime.utcnow()
            if now < cooldown_ends:
                can_resubmit = False
                time_remaining = cooldown_ends - now
                days_remaining = time_remaining.days
                hours_remaining = (time_remaining.seconds // 3600)
                minutes_remaining = (time_remaining.seconds % 3600) // 60
        other_works = portfolio.other_works
        if other_works and isinstance(other_works, str):
            try:
                other_works = json.loads(other_works)
            except:
                other_works = []
        portfolio_tweets = [t.tweet_url for t in portfolio.tweets]
        portfolio_data = {
            "id": portfolio.id,
            "status": portfolio.status,
            "target_role": portfolio.target_role,
            "rejection_reason": portfolio.rejection_reason,
            "review_feedback": portfolio.review_feedback,
            "can_resubmit": can_resubmit,
            "cooldown_ends": cooldown_ends.isoformat() if cooldown_ends else None,
            "days_remaining": days_remaining,
            "hours_remaining": hours_remaining,
            "minutes_remaining": minutes_remaining,
            "data": {
                "twitter_handle": portfolio.twitter_handle,
                "notion_url": portfolio.notion_url,
                "bio": portfolio.bio,
                "achievements": portfolio.achievements,
                "other_works": other_works,
                "selected_tweets": portfolio_tweets,
                "proof_of_use_filename": portfolio.proof_of_use_filename,
            }
        }
    portfolio_history_result = await db.execute(
        select(Portfolio).where(Portfolio.discord_id == discord_id, Portfolio.status != 'draft').order_by(Portfolio.submitted_at.desc())
    )
    portfolio_history = [
        {
            "id": p.id,
            "status": p.status,
            "target_role": p.target_role,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
            "created_at": p.created_at.isoformat(),
        }
        for p in portfolio_history_result.scalars().all()
    ]
    recent_contributions = []
    tweets = await get_user_tweets(discord_id, db)
    guild_info = None
    history_result = await db.execute(
        select(PortfolioHistory).where(PortfolioHistory.discord_id == discord_id).order_by(PortfolioHistory.promoted_at.desc())
    )
    promotion_history = [
        {
            "from_role": h.from_role,
            "to_role": h.to_role,
            "promoted_at": h.promoted_at.isoformat(),
        }
        for h in history_result.scalars().all()
    ]
    achievements = {
        "first_portfolio_submitted": len(portfolio_history) > 0,
        "promoted": len(promotion_history) > 0,
        "multiple_submissions": len(portfolio_history) > 1,
    }
    dashboard_portfolio_status = portfolio.status if portfolio else None
    if (
        portfolio
        and portfolio.status == PortfolioStatus.DRAFT.value
        and portfolio.review_feedback
    ):
        dashboard_portfolio_status = "changes_requested"
    return UserDashboard(
        user=UserResponse(
            discord_id=user.discord_id,
            username=user.username,
            avatar_url=user.avatar_url,
            message_count=real_message_count,
            contribution_points=user.contribution_points,
            created_at=user.created_at,
        ),
        stats=stats,
        portfolio_status=dashboard_portfolio_status,
        portfolio=portfolio_data,
        portfolio_history=portfolio_history,
        recent_contributions=recent_contributions,
        recent_tweets=tweets,
        guild_info=guild_info,
        promotion_history=promotion_history,
        achievements=achievements,
    )
@router.get("/server/stats", response_model=ServerStats)
async def get_server_stats(db: AsyncSession = Depends(get_db)):
    """Get server statistics."""
    total_users = await db.execute(select(func.count(User.id)))
    total_portfolios = await db.execute(select(func.count(Portfolio.id)))
    pending_portfolios = await db.execute(
        select(func.count(Portfolio.id)).where(Portfolio.status == "submitted")
    )
    approved_portfolios = await db.execute(
        select(func.count(Portfolio.id)).where(Portfolio.status == "promoted")
    )
    return ServerStats(
        total_users=total_users.scalar() or 0,
        total_portfolios=total_portfolios.scalar() or 0,
        pending_portfolios=pending_portfolios.scalar() or 0,
        approved_portfolios=approved_portfolios.scalar() or 0,
        total_contributions=0,
        active_quests=0,
    )
@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(limit: int = 10, db: AsyncSession = Depends(get_db)):
    """Get top users by contribution points."""
    result = await db.execute(
        select(User).order_by(User.contribution_points.desc()).limit(limit)
    )
    users = result.scalars().all()
    leaderboard = []
    for i, user in enumerate(users, 1):
        leaderboard.append(LeaderboardEntry(
            rank=i,
            discord_id=user.discord_id,
            username=user.username,
            avatar_url=user.avatar_url,
            points=user.contribution_points,
            contributions=0,
        ))
    return leaderboard
@router.get("/{discord_id}/discord-stats")
async def get_discord_activity_stats(discord_id: str):
    """Get real Discord activity stats from messages.db."""
    from ...repositories.messages_db import get_messages_repository
    messages_repo = get_messages_repository()
    stats = messages_repo.get_user_stats(int(discord_id))
    return {
        "message_count": stats.get("message_count", 0),
        "channels_active": stats.get("channels_active", 0),
    }
def _calculate_activity_level(message_count: int) -> tuple[ActivityLevel, ActivityLevel | None]:
    """Calculate current and next activity level based on message count."""
    levels = [
        {"level": "newcomer", "min": 0, "max": 499, "description": "Just getting started"},
        {"level": "regular", "min": 500, "max": 999, "description": "Regular contributor"},
        {"level": "active", "min": 1000, "max": 1999, "description": "Active community member"},
        {"level": "expert", "min": 2000, "max": 4999, "description": "Expert contributor"},
        {"level": "legendary", "min": 5000, "max": None, "description": "Legendary status"},
    ]
    current_level = None
    next_level = None
    for i, level_data in enumerate(levels):
        if level_data["max"] is None:
            if message_count >= level_data["min"]:
                progress = 100.0
                current_level = ActivityLevel(
                    level=level_data["level"],
                    min_messages=level_data["min"],
                    max_messages=level_data["max"],
                    progress_percentage=progress
                )
                next_level = None
                break
        else:
            if level_data["min"] <= message_count <= level_data["max"]:
                range_size = level_data["max"] - level_data["min"] + 1
                progress = ((message_count - level_data["min"]) / range_size) * 100
                current_level = ActivityLevel(
                    level=level_data["level"],
                    min_messages=level_data["min"],
                    max_messages=level_data["max"],
                    progress_percentage=round(progress, 1)
                )
                if i + 1 < len(levels):
                    next_data = levels[i + 1]
                    next_level = ActivityLevel(
                        level=next_data["level"],
                        min_messages=next_data["min"],
                        max_messages=next_data["max"],
                        progress_percentage=0.0
                    )
                break
    return current_level, next_level
@router.get("/{discord_id}/my-stats", response_model=MyStatsResponse)
async def get_my_stats(discord_id: str, db: AsyncSession = Depends(get_db)):
    """Get complete stats for /my-stats page."""
    result = await db.execute(select(User).where(User.discord_id == discord_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    submission_count = await db.execute(
        select(func.count(PortfolioStatusTimeline.id)).where(
            PortfolioStatusTimeline.discord_id == discord_id,
            PortfolioStatusTimeline.action == "submit"
        )
    )
    portfolios_submitted = submission_count.scalar() or 0
    approvals_count_query = await db.execute(
        select(func.count(PortfolioStatusTimeline.id)).where(
            PortfolioStatusTimeline.discord_id == discord_id,
            PortfolioStatusTimeline.action == "approve"
        )
    )
    approvals_count = approvals_count_query.scalar() or 0
    rejections_count_query = await db.execute(
        select(func.count(PortfolioStatusTimeline.id)).where(
            PortfolioStatusTimeline.discord_id == discord_id,
            PortfolioStatusTimeline.action == "reject"
        )
    )
    rejections_count = rejections_count_query.scalar() or 0
    approval_rejection_ratio = None
    if rejections_count > 0:
        approval_rejection_ratio = round(approvals_count / rejections_count, 2)
    highest_role = await _get_highest_community_role(discord_id)
    highest_tier = None
    guild_name = None
    guild_tier = None
    quests_completed = 0
    guild_members_payload = []
    avatar_url = await _fetch_discord_avatar(discord_id)
    if not avatar_url:
        avatar_url = user.avatar_url
    from ...repositories.messages_db import get_messages_repository
    messages_repo = get_messages_repository()
    real_stats = messages_repo.get_user_stats(int(discord_id))
    message_count = real_stats.get("message_count", 0)
    current_level, next_level = _calculate_activity_level(message_count)
    messages_per_portfolio = None
    if portfolios_submitted > 0:
        messages_per_portfolio = round(message_count / portfolios_submitted, 1)
    messages_per_quest = None
    if quests_completed > 0:
        messages_per_quest = round(message_count / quests_completed, 1)
    activity_descriptions = {
        "newcomer": "Just getting started in the community",
        "regular": "Regular contributor to discussions",
        "active": "Active and engaged community member",
        "expert": "Expert contributor with deep involvement",
        "legendary": "Legendary status - top tier contributor"
    }
    activity_stage = activity_descriptions.get(current_level.level, "Active member")
    return MyStatsResponse(
        discord_id=user.discord_id,
        username=user.username,
        avatar_url=avatar_url,
        message_count=message_count,
        portfolios_submitted=portfolios_submitted,
        quests_completed=quests_completed,
        approvals_count=approvals_count,
        rejections_count=rejections_count,
        approval_rejection_ratio=approval_rejection_ratio,
        guild=guild_name,
        guild_tier=guild_tier,
        guild_members=guild_members_payload,
        highest_role=highest_role,
        highest_tier=highest_tier,
        activity_level=current_level,
        next_level=next_level,
        messages_per_portfolio=messages_per_portfolio,
        messages_per_quest=messages_per_quest,
        activity_stage=activity_stage,
    )
