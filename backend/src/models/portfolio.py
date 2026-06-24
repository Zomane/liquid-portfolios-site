"""Portfolio models."""
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, LargeBinary, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base
class PortfolioStatus(str, Enum):
    """Portfolio status enum."""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    PENDING_VOTE = "pending_vote"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROMOTED = "promoted"
class Portfolio(Base):
    """User portfolio for role promotion."""
    __tablename__ = "portfolios"
    __table_args__ = (
        Index('idx_status_submitted', 'status', 'submitted_at'),
        Index('idx_discord_status', 'discord_id', 'status'),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    discord_id: Mapped[str] = mapped_column(String(20), index=True)
    notion_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    proof_of_use_image: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    proof_of_use_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    twitter_handle: Mapped[str | None] = mapped_column(String(50), nullable=True)
    achievements: Mapped[str | None] = mapped_column(Text, nullable=True)
    other_works: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=PortfolioStatus.DRAFT.value)
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewer_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    review_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    user = relationship("User", back_populates="portfolios")
    tweets = relationship("PortfolioTweet", back_populates="portfolio", lazy="selectin")
    status_timeline = relationship("PortfolioStatusTimeline", back_populates="portfolio", lazy="selectin")
    history = relationship("PortfolioHistory", back_populates="portfolio", lazy="selectin")
    votes = relationship("PortfolioVote", back_populates="portfolio", lazy="selectin")
class PortfolioStatusTimeline(Base):
    """Timeline tracking for portfolio status changes during review process."""
    __tablename__ = "portfolio_status_timeline"
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), index=True)
    discord_id: Mapped[str] = mapped_column(String(20), index=True)
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), index=True)
    action: Mapped[str | None] = mapped_column(String(50), nullable=True)
    changed_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    portfolio = relationship("Portfolio")
class PortfolioHistory(Base):
    """Archived portfolio history after promotion."""
    __tablename__ = "portfolio_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    discord_id: Mapped[str] = mapped_column(String(20), index=True)
    from_role: Mapped[str] = mapped_column(String(50))
    to_role: Mapped[str] = mapped_column(String(50))
    snapshot_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    promoted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    portfolio = relationship("Portfolio", back_populates="history")
class PortfolioTweet(Base):
    """Tweets used in portfolios."""
    __tablename__ = "portfolio_tweets"
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    tweet_url: Mapped[str] = mapped_column(String(500))
    tweet_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    portfolio = relationship("Portfolio", back_populates="tweets")
class PortfolioVote(Base):
    """Legacy portfolio vote records kept for old database compatibility."""
    __tablename__ = "portfolio_votes"
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    voter_discord_id: Mapped[str] = mapped_column(String(20), index=True)
    vote_type: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    portfolio = relationship("Portfolio", back_populates="votes")
class PortfolioVoteFeedback(Base):
    """Legacy portfolio vote feedback kept for old database compatibility."""
    __tablename__ = "portfolio_vote_feedback"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "voter_discord_id", name="uq_portfolio_feedback_voter"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"), index=True)
    voter_discord_id: Mapped[str] = mapped_column(String(20), index=True)
    voter_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    feedback_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
class UserSavedTweet(Base):
    """User's saved tweets that persist across portfolio deletions."""
    __tablename__ = "user_saved_tweets"
    id: Mapped[int] = mapped_column(primary_key=True)
    discord_id: Mapped[str] = mapped_column(String(20), index=True)
    tweet_url: Mapped[str] = mapped_column(String(500))
    tweet_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
