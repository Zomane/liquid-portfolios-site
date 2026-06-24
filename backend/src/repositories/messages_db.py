"""Repository for reading tweets from Discord messages.db"""
import os
import re
import sqlite3
from pathlib import Path
from typing import List, Tuple, Optional
TWITTER_CHANNEL_ID = os.getenv("TWITTER_CHANNEL_ID", "1267829631430938765")
MESSAGES_DB_PATH = os.getenv("MESSAGES_DB_PATH", "./data/messages.db")
class MessagesRepository:
    """Repository for reading Discord messages from SQLite database."""
    def __init__(self, db_path: str = None):
        self.db_path = db_path or MESSAGES_DB_PATH
        self._ensure_db_exists()
    def _ensure_db_exists(self) -> bool:
        """Check if the database file exists."""
        path = Path(self.db_path)
        return path.exists()
    def _get_connection(self) -> Optional[sqlite3.Connection]:
        """Get database connection."""
        if not self._ensure_db_exists():
            return None
        try:
            return sqlite3.connect(self.db_path)
        except Exception as e:
            print(f"Error connecting to messages.db: {e}")
            return None
    def get_user_tweets(self, user_id: int, channel_id: str = None) -> List[str]:
        """Get tweet IDs posted by user. Searches all channels if no channel_id specified."""
        conn = self._get_connection()
        if not conn:
            return []
        try:
            cursor = conn.cursor()
            if channel_id:
                cursor.execute("""
                    SELECT content FROM messages
                    WHERE author_id = ? AND channel_id = ?
                """, (str(user_id), channel_id))
            else:
                cursor.execute("""
                    SELECT content FROM messages
                    WHERE author_id = ? AND (content LIKE '%x.com/%/status/%' OR content LIKE '%twitter.com/%/status/%')
                """, (str(user_id),))
            tweet_ids = []
            for (content,) in cursor.fetchall():
                patterns = [
                    r'x\.com/\w+/status/(\d+)',
                    r'twitter\.com/\w+/status/(\d+)'
                ]
                for pattern in patterns:
                    matches = re.findall(pattern, content)
                    tweet_ids.extend(matches)
            return list(set(tweet_ids))
        except Exception as e:
            print(f"Error fetching user tweets: {e}")
            return []
        finally:
            conn.close()
    def get_user_tweet_urls(self, user_id: int, channel_id: str = None) -> Tuple[List[str], Optional[str]]:
        """Get full tweet URLs and detect Twitter username from user's posts."""
        conn = self._get_connection()
        if not conn:
            return [], None
        try:
            cursor = conn.cursor()
            if channel_id:
                cursor.execute("""
                    SELECT content FROM messages
                    WHERE author_id = ? AND channel_id = ?
                """, (str(user_id), channel_id))
            else:
                cursor.execute("""
                    SELECT content FROM messages
                    WHERE author_id = ? AND (content LIKE '%x.com/%/status/%' OR content LIKE '%twitter.com/%/status/%')
                """, (str(user_id),))
            tweet_urls = []
            detected_username = None
            for (content,) in cursor.fetchall():
                pattern = r'(https?://(?:x|twitter)\.com/(\w+)/status/(\d+))'
                matches = re.findall(pattern, content)
                for full_url, username, tweet_id in matches:
                    normalized_url = f"https://x.com/{username}/status/{tweet_id}"
                    tweet_urls.append(normalized_url)
                    if username.lower() not in ['i', 'intent', 'share']:
                        detected_username = username
            return list(set(tweet_urls)), detected_username
        except Exception as e:
            print(f"Error fetching user tweet URLs: {e}")
            return [], None
        finally:
            conn.close()
    def get_user_stats(self, user_id: int) -> dict:
        """Get basic user stats from messages database."""
        conn = self._get_connection()
        if not conn:
            return {"message_count": 0, "channels_active": 0}
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM messages WHERE author_id = ?
            """, (str(user_id),))
            message_count = cursor.fetchone()[0]
            cursor.execute("""
                SELECT COUNT(DISTINCT channel_id) FROM messages WHERE author_id = ?
            """, (str(user_id),))
            channels_active = cursor.fetchone()[0]
            return {
                "message_count": message_count,
                "channels_active": channels_active,
            }
        except Exception as e:
            print(f"Error fetching user stats: {e}")
            return {"message_count": 0, "channels_active": 0}
        finally:
            conn.close()
    def get_batch_user_stats(self, user_ids: List[int]) -> dict:
        """Get message counts for multiple users in a single query.
        Returns dict mapping discord_id -> message_count.
        """
        conn = self._get_connection()
        if not conn or not user_ids:
            return {}
        try:
            cursor = conn.cursor()
            user_ids_str = [str(uid) for uid in user_ids]
            placeholders = ','.join('?' * len(user_ids_str))
            cursor.execute(f"""
                SELECT author_id, COUNT(*) as message_count
                FROM messages
                WHERE author_id IN ({placeholders})
                GROUP BY author_id
            """, user_ids_str)
            result = {}
            for author_id, count in cursor.fetchall():
                result[author_id] = count
            for uid in user_ids_str:
                if uid not in result:
                    result[uid] = 0
            return result
        except Exception as e:
            print(f"Error fetching batch user stats: {e}")
            return {str(uid): 0 for uid in user_ids}
        finally:
            conn.close()
_messages_repository: Optional[MessagesRepository] = None
def get_messages_repository() -> MessagesRepository:
    """Get or create MessagesRepository instance."""
    global _messages_repository
    if _messages_repository is None:
        _messages_repository = MessagesRepository()
    return _messages_repository
