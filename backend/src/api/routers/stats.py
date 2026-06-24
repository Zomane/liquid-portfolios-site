"""Stats API routes."""
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from ...models import get_db, User, Portfolio
from ..security import verify_staff_or_moderator
router = APIRouter(prefix="/stats", tags=["stats"])
MESSAGES_DB = Path(__file__).parent.parent.parent.parent.parent / "data" / "messages.db"
def get_message_stats():
    """Get message statistics from messages.db."""
    if not MESSAGES_DB.exists():
        return None
    try:
        conn = sqlite3.connect(str(MESSAGES_DB))
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM messages")
        total_messages = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(DISTINCT author_id) FROM messages")
        total_users = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM messages WHERE date(created_at) = date('now')")
        messages_today = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM messages WHERE date(created_at) = date('now', '-1 day')")
        messages_yesterday = cursor.fetchone()[0]
        trend = 0
        if messages_yesterday > 0:
            trend = round(((messages_today - messages_yesterday) / messages_yesterday) * 100)
        cursor.execute("SELECT COUNT(DISTINCT author_id) FROM messages WHERE created_at > datetime('now', '-7 days')")
        active_users_week = cursor.fetchone()[0]
        cursor.execute("""
            SELECT date(created_at) as day, COUNT(*) as cnt
            FROM messages
            WHERE created_at > datetime('now', '-14 days')
            GROUP BY day
            ORDER BY day ASC
        """)
        daily_messages = [{"period": row[0], "message_count": row[1]} for row in cursor.fetchall()]
        cursor.execute("""
            SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as cnt
            FROM messages
            WHERE created_at > datetime('now', '-56 days')
            GROUP BY week
            ORDER BY week ASC
        """)
        weekly_messages = [{"period": row[0], "message_count": row[1]} for row in cursor.fetchall()]
        cursor.execute("""
            SELECT author_name, COUNT(*) as cnt
            FROM messages
            WHERE created_at > datetime('now', '-7 days')
            GROUP BY author_id
            ORDER BY cnt DESC
            LIMIT 10
        """)
        top_week = [{"username": row[0], "points": row[1]} for row in cursor.fetchall()]
        cursor.execute("""
            SELECT author_name, COUNT(*) as cnt
            FROM messages
            WHERE created_at > datetime('now', '-30 days')
            GROUP BY author_id
            ORDER BY cnt DESC
            LIMIT 10
        """)
        top_month = [{"username": row[0], "points": row[1]} for row in cursor.fetchall()]
        cursor.execute("""
            SELECT author_name, COUNT(*) as cnt
            FROM messages
            WHERE created_at > datetime('now', '-1 day')
            GROUP BY author_id
            ORDER BY cnt DESC
            LIMIT 10
        """)
        top_day = [{"username": row[0], "points": row[1]} for row in cursor.fetchall()]
        conn.close()
        return {
            "server": {
                "total_users": total_users,
                "total_messages": total_messages,
                "messages_today": messages_today,
                "messages_trend": trend,
                "active_users_week": active_users_week,
            },
            "daily_messages": daily_messages,
            "weekly_messages": weekly_messages,
            "top_contributors": {
                "day": top_day,
                "week": top_week,
                "month": top_month,
            },
        }
    except Exception as e:
        print(f"Error getting message stats: {e}")
        return None
@router.get("/dashboard")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Get dashboard statistics."""
    message_stats = get_message_stats()
    total_users = await db.execute(select(func.count(User.id)))
    portfolio_stats = {}
    for status in ["draft", "submitted", "pending_vote", "approved", "rejected", "promoted"]:
        count = await db.execute(
            select(func.count(Portfolio.id)).where(Portfolio.status == status)
        )
        portfolio_stats[status] = count.scalar() or 0
    guild_counts = {guild_name: 0 for guild_name in ["traders", "content", "designers"]}
    portfolio_distribution = [
        {"name": status.replace("_", " ").title(), "value": count}
        for status, count in portfolio_stats.items()
        if count > 0
    ]
    response = {
        "users": {
            "total": total_users.scalar() or 0,
        },
        "portfolios": portfolio_stats,
        "portfolio_distribution": portfolio_distribution,
        "contributions": {
            "total": 0,
            "featured": 0,
        },
        "guilds": guild_counts,
        "quests": {
            "active": 0,
        },
    }
    if message_stats:
        response.update(message_stats)
    return response
@router.get("/portfolios")
async def get_all_portfolios(
    status: str = None,
    limit: int = 50,
    offset: int = 0,
    current_user: str = Depends(verify_staff_or_moderator),
    db: AsyncSession = Depends(get_db),
):
    """List all portfolios with optional status filter.
    SECURITY: Only Staff, Moderator, Guild Leads, or Volunteer Dev can list all portfolios.
    """
    query = select(Portfolio).order_by(Portfolio.created_at.desc())
    if status:
        query = query.where(Portfolio.status == status)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    portfolios = result.scalars().all()
    portfolio_list = []
    for p in portfolios:
        user_result = await db.execute(select(User).where(User.id == p.user_id))
        user = user_result.scalar_one_or_none()
        portfolio_list.append({
            "id": p.id,
            "discord_id": p.discord_id,
            "username": user.username if user else "Unknown",
            "status": p.status,
            "target_role": p.target_role,
            "ai_score": p.ai_score,
            "created_at": p.created_at.isoformat(),
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
        })
    count_query = select(func.count(Portfolio.id))
    if status:
        count_query = count_query.where(Portfolio.status == status)
    total = await db.execute(count_query)
    return {
        "portfolios": portfolio_list,
        "total": total.scalar() or 0,
        "limit": limit,
        "offset": offset,
    }
