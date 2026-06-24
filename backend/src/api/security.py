"""Security utilities for API authentication and authorization."""
import os
import logging
import time
import asyncio
from typing import Optional
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import yaml
from pathlib import Path
logger = logging.getLogger(__name__)
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("JWT_SECRET is not set! Cannot start in production without it.")
    logger.warning("JWT_SECRET is not set — using insecure dev default. Do NOT use in production.")
    JWT_SECRET = "INSECURE-DEV-ONLY-CHANGE-ME"
JWT_ALGORITHM = "HS256"
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)
_USER_ROLES_CACHE: dict[str, tuple[list[str], float]] = {}
_USER_ROLES_CACHE_TTL_SECONDS = 300
_config_path = Path(__file__).parent.parent.parent.parent / "config" / "roles.yaml"
try:
    with open(_config_path) as f:
        ROLES_CONFIG = yaml.safe_load(f)
except Exception as e:
    logger.warning(f"Could not load roles config: {e}")
    ROLES_CONFIG = {}
def verify_jwt_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Dependency to extract and verify the current authenticated user's discord_id.
    This function:
    1. Extracts the JWT token from the Authorization header
    2. Verifies the token signature and expiration
    3. Returns the authenticated user's discord_id
    Raises:
        HTTPException: 401 if token is missing, invalid, or expired
    Returns:
        str: The authenticated user's discord_id from the JWT token
    """
    token = credentials.credentials
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    discord_id = payload.get("sub")
    if not discord_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return discord_id
def verify_user_ownership(request_user_id: str, target_user_id: str) -> None:
    """
    Verify that the requesting user owns the resource they're trying to modify.
    This prevents users from modifying other users' portfolios, contributions, etc.
    Args:
        request_user_id: The discord_id of the authenticated user making the request
        target_user_id: The discord_id of the user whose resource is being modified
    Raises:
        HTTPException: 403 if the user does not own the resource
    """
    if request_user_id != target_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this resource",
        )
async def verify_staff_or_moderator(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    x_internal_api_key: Optional[str] = Header(None)
) -> str:
    """
    Verify that the current user has Staff, Moderator, Guild Leads, or Volunteer Dev role.
    Also allows internal API key for automated processes.
    Args:
        current_user: The discord_id of the authenticated user (from JWT token)
        x_internal_api_key: Optional internal API key for automated processes
    Returns:
        str: The discord_id if verification succeeds, or "internal" for API key auth
    Raises:
        HTTPException: 403 if the user does not have admin permissions
    """
    if x_internal_api_key and INTERNAL_API_KEY and x_internal_api_key == INTERNAL_API_KEY:
        logger.info("Internal API key authentication successful")
        return "internal"
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = verify_jwt_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    current_user = payload.get("sub")
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    admin_user_ids = []
    if current_user in admin_user_ids:
        return current_user
    discord_bot_token = os.getenv("DISCORD_TOKEN") or os.getenv("DISCORD_BOT_TOKEN")
    guild_id = os.getenv("DISCORD_GUILD_ID", "1519094303526355194")
    guild_ids = os.getenv("DISCORD_GUILD_IDS", "")
    if not discord_bot_token:
        logger.error("DISCORD_TOKEN not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin verification service unavailable"
        )
    try:
        cached_entry = _USER_ROLES_CACHE.get(current_user)
        if cached_entry:
            cached_roles, cached_at = cached_entry
            if time.time() - cached_at < _USER_ROLES_CACHE_TTL_SECONDS:
                user_roles = cached_roles
            else:
                user_roles = []
        else:
            user_roles = []
        async with httpx.AsyncClient() as client:
            guild_ids_to_check = []
            for gid in [guild_id] + [g.strip() for g in guild_ids.split(",") if g.strip()]:
                if gid and gid not in guild_ids_to_check:
                    guild_ids_to_check.append(gid)
            user_roles_set = set()
            for gid in guild_ids_to_check:
                response = None
                for _ in range(2):
                    response = await client.get(
                        f"https://discord.com/api/v10/guilds/{gid}/members/{current_user}",
                        headers={"Authorization": f"Bot {discord_bot_token}"},
                        timeout=30.0,
                    )
                    if response.status_code != 429:
                        break
                    retry_after = response.headers.get("Retry-After", "1")
                    try:
                        sleep_for = min(float(retry_after), 2.0)
                    except ValueError:
                        sleep_for = 1.0
                    logger.warning(
                        f"Discord role lookup rate-limited for {current_user} in guild {gid}; retrying in {sleep_for:.1f}s"
                    )
                    await asyncio.sleep(sleep_for)
                if response is None:
                    continue
                if response.status_code == 200:
                    member_data = response.json()
                    user_roles_set.update(str(r) for r in member_data.get("roles", []))
                elif response.status_code != 404:
                    logger.warning(f"Could not fetch user roles for {current_user} in guild {gid} - Status {response.status_code}")
            if user_roles_set:
                user_roles = list(user_roles_set)
                _USER_ROLES_CACHE[current_user] = (user_roles, time.time())
            if not user_roles:
                logger.error(f"Could not fetch user roles for {current_user} in any configured guild")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized - could not verify permissions"
                )
            admin_roles = [
                str(ROLES_CONFIG.get("roles", {}).get("Staff", "0")),
                str(ROLES_CONFIG.get("roles", {}).get("Moderator", "0")),
                str(ROLES_CONFIG.get("roles", {}).get("Guild Leader", "0")),
                str(ROLES_CONFIG.get("roles", {}).get("Volunteer Dev", "0")),
            ]
            is_admin = any(str(role_id) in admin_roles for role_id in user_roles) or current_user in admin_user_ids
            if not is_admin:
                logger.warning(f"Unauthorized admin access attempt by {current_user}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to perform this action. Only Staff, Moderator, Guild Leads, or Volunteer Dev can access this resource."
                )
            return current_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Permission verification error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized - permission check failed"
        )
