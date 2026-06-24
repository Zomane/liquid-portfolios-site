"""User schemas."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
class UserResponse(BaseModel):
    """User response."""
    discord_id: str
    username: str
    avatar_url: Optional[str] = None
    message_count: int = 0
    contribution_points: int = 0
    created_at: datetime
    class Config:
        from_attributes = True
class UserStats(BaseModel):
    """User statistics."""
    discord_id: str
    username: str
    avatar_url: Optional[str] = None
    message_count: int
    portfolios_submitted: int
    quests_completed: int
    highest_role: Optional[str] = None
    highest_tier: Optional[int] = None
    guild: Optional[str] = None
    guild_tier: Optional[int] = None
class TweetInfo(BaseModel):
    """Tweet information."""
    tweet_url: str
    content: Optional[str] = None
    metrics: Optional[dict] = None
class UserDashboard(BaseModel):
    """Comprehensive user dashboard."""
    user: UserResponse
    stats: UserStats
    portfolio_status: Optional[str] = None
    portfolio: Optional[dict] = None
    portfolio_history: List[dict] = []
    recent_contributions: List[dict] = []
    recent_tweets: List[TweetInfo] = []
    guild_info: Optional[dict] = None
    promotion_history: List[dict] = []
    achievements: Optional[dict] = {}
class ServerStats(BaseModel):
    """Server statistics."""
    total_users: int
    total_portfolios: int
    pending_portfolios: int
    approved_portfolios: int
    total_contributions: int
    active_quests: int
class LeaderboardEntry(BaseModel):
    """Leaderboard entry."""
    rank: int
    discord_id: str
    username: str
    avatar_url: Optional[str] = None
    points: int
    contributions: int
class ActivityLevel(BaseModel):
    """Activity level information."""
    level: str
    min_messages: int
    max_messages: Optional[int] = None
    progress_percentage: float
class GuildMembership(BaseModel):
    """Guild membership summary for my-stats."""
    guild: str
    tier: int
class MyStatsResponse(BaseModel):
    """Complete my-stats page response."""
    discord_id: str
    username: str
    avatar_url: Optional[str] = None
    message_count: int
    portfolios_submitted: int
    quests_completed: int
    approvals_count: int = 0
    rejections_count: int = 0
    approval_rejection_ratio: Optional[float] = None
    guild: Optional[str] = None
    guild_tier: Optional[int] = None
    guild_members: List[GuildMembership] = []
    highest_role: Optional[str] = None
    highest_tier: Optional[int] = None
    activity_level: ActivityLevel
    next_level: Optional[ActivityLevel] = None
    messages_per_portfolio: Optional[float] = None
    messages_per_quest: Optional[float] = None
    activity_stage: str
