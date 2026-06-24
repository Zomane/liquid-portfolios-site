"""Portfolio schemas."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, validator
class PortfolioTweetSchema(BaseModel):
    """Tweet schema for portfolio."""
    tweet_url: str = Field(..., max_length=512)
    tweet_id: Optional[str] = Field(None, max_length=64)
    content: Optional[str] = Field(None, max_length=2000)
    metrics: Optional[dict] = None
class PortfolioUpdate(BaseModel):
    """Update portfolio data."""
    bio: Optional[str] = Field(None, max_length=2000)
    twitter_handle: Optional[str] = Field(None, max_length=64)
    achievements: Optional[str] = Field(None, max_length=5000)
    notion_url: Optional[str] = Field(None, max_length=512)
    target_role: Optional[str] = Field(None, max_length=64)
    tweets: Optional[List[PortfolioTweetSchema]] = Field(None, max_length=100)
    other_works: Optional[List[str]] = Field(None, max_length=10)
    proof_of_use_image: Optional[str] = None
    proof_of_use_filename: Optional[str] = Field(None, max_length=255)
    @validator('other_works', each_item=True)
    def validate_other_works_item(cls, v):
        if v and len(v) > 512:
            raise ValueError('Each work URL must be at most 512 characters')
        return v
class PortfolioSubmit(BaseModel):
    """Submit portfolio for review - now includes all portfolio data."""
    discord_id: str = Field(..., max_length=32, pattern=r"^\d+$")
    bio: Optional[str] = Field(None, max_length=2000)
    twitter_handle: Optional[str] = Field(None, max_length=64)
    achievements: Optional[str] = Field(None, max_length=5000)
    notion_url: Optional[str] = Field(None, max_length=512)
    target_role: Optional[str] = Field(None, max_length=64)
    tweets: Optional[List[PortfolioTweetSchema]] = Field(None, max_length=100)
    other_works: Optional[List[str]] = Field(None, max_length=10)
    proof_of_use_image: Optional[str] = None
    proof_of_use_filename: Optional[str] = Field(None, max_length=255)
    @validator('other_works', each_item=True)
    def validate_other_works_item(cls, v):
        if v and len(v) > 512:
            raise ValueError('Each work URL must be at most 512 characters')
        return v
class PortfolioReview(BaseModel):
    """Review portfolio request."""
    discord_id: str = Field(..., max_length=32, pattern=r"^\d+$")
    reviewer_id: str = Field(..., max_length=32, pattern=r"^\d+$")
    action: str = Field(..., pattern="^(approve|reject|request_changes)$")
    feedback: Optional[str] = Field(None, max_length=2000)
class PortfolioResponse(BaseModel):
    """Portfolio response."""
    id: int
    discord_id: str
    status: str
    bio: Optional[str] = None
    twitter_handle: Optional[str] = None
    achievements: Optional[str] = None
    notion_url: Optional[str] = None
    target_role: Optional[str] = None
    current_role: Optional[str] = None
    ai_score: Optional[int] = None
    ai_feedback: Optional[str] = None
    review_feedback: Optional[str] = None
    rejection_reason: Optional[str] = None
    other_works: Optional[List[str]] = None
    proof_of_use_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    tweets: List[PortfolioTweetSchema] = []
    @validator('other_works', pre=True)
    def parse_other_works(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except:
                return []
        return v
    class Config:
        from_attributes = True
class CanResubmitResponse(BaseModel):
    """Can resubmit check response."""
    can_resubmit: bool
    cooldown_ends: Optional[datetime] = None
    days_remaining: Optional[int] = None
class PortfolioHistoryResponse(BaseModel):
    """Portfolio history response."""
    from_role: str
    to_role: str
    promoted_at: datetime
    snapshot_data: Optional[dict] = None
    class Config:
        from_attributes = True
class PortfolioStatusTimelineResponse(BaseModel):
    """Portfolio status timeline response."""
    id: int
    from_status: Optional[str] = None
    to_status: str
    action: Optional[str] = None
    changed_by: Optional[str] = None
    notes: Optional[str] = None
    changed_at: datetime
    target_role: Optional[str] = None
    class Config:
        from_attributes = True
