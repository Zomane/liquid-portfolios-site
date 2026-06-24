"""Discord OAuth2 authentication routes."""
import asyncio
import os
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path
from urllib.parse import quote
import httpx
import yaml
from fastapi import APIRouter, HTTPException, Query, Response, Request, Depends
from fastapi.responses import RedirectResponse
from jose import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address
from ...models import get_db, User
router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)
_config_path = Path(__file__).parent.parent.parent.parent.parent / "config" / "roles.yaml"
with open(_config_path) as f:
    ROLES_CONFIG = yaml.safe_load(f)
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    import logging as _log
    if os.getenv("ENVIRONMENT") == "production":
        raise RuntimeError("JWT_SECRET is not set! Cannot start in production without it.")
    _log.getLogger(__name__).warning("JWT_SECRET is not set — using insecure dev default. Do NOT use in production.")
    JWT_SECRET = "INSECURE-DEV-ONLY-CHANGE-ME"
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7
DISCORD_API_BASE = "https://discord.com/api/v10"
DISCORD_OAUTH_URL = "https://discord.com/api/oauth2"
GUILD_ID = os.getenv("DISCORD_GUILD_ID", "1519094303526355194")
GUILD_IDS = os.getenv("DISCORD_GUILD_IDS", "").split(",") if os.getenv("DISCORD_GUILD_IDS") else []
HTTP_TIMEOUT = 15.0
HTTP_CONNECT_TIMEOUT = 10.0
MAX_RETRIES = 3
RETRY_BACKOFF_FACTOR = 1.5
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict
class UserInfo(BaseModel):
    id: str
    username: str
    discriminator: str
    avatar: Optional[str]
    global_name: Optional[str]
def create_jwt_token(user_data: dict) -> str:
    """Create a JWT token for the user."""
    expire = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    to_encode = {
        "sub": user_data["id"],
        "username": user_data.get("global_name") or user_data["username"],
        "avatar": user_data.get("avatar"),
        "exp": expire,
    }
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
def verify_jwt_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.JWTError:
        return None
async def _make_http_request_with_retry(method: str, url: str, **kwargs):
    """Make an HTTP request with retry logic and timeouts."""
    timeout_config = httpx.Timeout(
        timeout=HTTP_TIMEOUT,
        connect=HTTP_CONNECT_TIMEOUT,
    )
    last_exception = None
    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                if method.upper() == "GET":
                    return await client.get(url, **kwargs)
                elif method.upper() == "POST":
                    return await client.post(url, **kwargs)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
        except (httpx.ConnectTimeout, httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError, httpx.TransportError) as e:
            last_exception = e
            if attempt < MAX_RETRIES - 1:
                wait_time = RETRY_BACKOFF_FACTOR ** attempt
                error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
                print(f"[WARN] HTTP request failed (attempt {attempt + 1}/{MAX_RETRIES}): {error_detail}. Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
                print(f"[ERROR] HTTP request failed after {MAX_RETRIES} attempts: {error_detail}")
    raise last_exception or httpx.ConnectError(f"Failed to connect to {url}")
async def get_user_guilds(user_roles: list[str], discord_icons: dict = None) -> list[dict]:
    """Get guilds that a user belongs to based on their Discord roles, with custom icons."""
    if discord_icons is None:
        discord_icons = {}
    guilds = []
    guilds_config = ROLES_CONFIG.get("roles", {}).get("guilds", {})
    normalized_user_roles = [str(role_id) for role_id in user_roles]
    for guild_key, guild_data in guilds_config.items():
        guild_role_id = str(guild_data.get("role_id", ""))
        if not guild_role_id:
            continue
        if guild_role_id in normalized_user_roles:
            guild_info = {
                "id": guild_key,
                "name": guild_data.get("name", guild_key),
                "role_id": guild_role_id,
                "icon": discord_icons.get(guild_role_id),
                "is_custom_icon": guild_role_id in discord_icons,
            }
            guild_roles = guild_data.get("roles", {})
            tier_info = None
            for tier_key, tier_data in guild_roles.items():
                tier_role_id = str(tier_data.get("id", ""))
                if tier_role_id in normalized_user_roles:
                    tier_info = {
                        "id": tier_key,
                        "role_id": tier_role_id,
                        "tier": tier_data.get("tier"),
                        "icon": discord_icons.get(tier_role_id),
                    }
                    break
            if tier_info:
                guild_info["tier"] = tier_info
            guilds.append(guild_info)
    return guilds
async def fetch_discord_role_icons(guild_id: str) -> dict:
    """Fetch role information from Discord API including custom icons."""
    bot_token = os.getenv("DISCORD_TOKEN") or os.getenv("DISCORD_BOT_TOKEN")
    if not bot_token:
        return {}
    timeout_config = httpx.Timeout(timeout=15.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            response = await client.get(
                f"{DISCORD_API_BASE}/guilds/{guild_id}/roles",
                headers={"Authorization": f"Bot {bot_token}"},
            )
            if response.status_code == 200:
                roles_data = response.json()
                role_icons = {}
                for role in roles_data:
                    role_id = str(role.get("id", ""))
                    if role.get("icon"):
                        icon_hash = role["icon"]
                        icon_url = f"https://cdn.discordapp.com/role-icons/{role_id}/{icon_hash}.png"
                        role_icons[role_id] = icon_url
                    elif role.get("unicode_emoji"):
                        role_icons[role_id] = role["unicode_emoji"]
                return role_icons
    except Exception as e:
        error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
        print(f"Failed to fetch Discord role icons: {error_detail}")
    return {}
async def get_role_names(user_roles: list[str], guild_id: str = None) -> list[dict]:
    """Get human-readable role names from role IDs with custom Discord icons."""
    role_names = []
    roles_config = ROLES_CONFIG.get("roles", {})
    processed_ids = set()
    discord_icons = {}
    if guild_id:
        discord_icons = await fetch_discord_role_icons(guild_id)
    elif GUILD_IDS:
        for gid in GUILD_IDS:
            if gid.strip():
                discord_icons.update(await fetch_discord_role_icons(gid.strip()))
    if not discord_icons and GUILD_ID:
        discord_icons = await fetch_discord_role_icons(GUILD_ID)
    fallback_icons = {
        "Staff": "👑",
        "Automata": "🤖",
        "Moderator": "🛡️",
        "TestReviewer": "🧪",
        "droplet": "💧",
        "wave": "🌊",
        "tide": "🌊",
        "current": "💧",
        "all_in_liquid": "💎",
        "founding_droplets": "💧",
        "liquid_frens": "🤝",
        "tsunami": "🌊",
        "event winner": "🏆",
        "traders": "📈",
        "content": "✍️",
        "designers": "🎨",
        "tide_tier": "🌊",
        "degen": "🎲",
        "speculator": "📊",
        "drip": "💧",
        "frame": "🖼️",
        "orator": "🎤",
        "ink": "🖊️",
        "sketch": "✏️",
        "sculptor": "🗿",
    }
    admin_role_keys = ["Staff", "Automata", "Moderator", "TestReviewer"]
    for role_key in admin_role_keys:
        role_id = roles_config.get(role_key)
        if isinstance(role_id, str) and str(role_id) in [str(r) for r in user_roles]:
            if role_id not in processed_ids:
                icon = discord_icons.get(role_id) or fallback_icons.get(role_key, "⭐")
                role_names.append({
                    "id": role_id,
                    "name": role_key,
                    "icon": icon,
                    "is_custom_icon": role_id in discord_icons
                })
                processed_ids.add(role_id)
    community_roles = roles_config.get("community", {})
    for role_name, role_id in community_roles.items():
        if str(role_id) in [str(r) for r in user_roles]:
            if role_id not in processed_ids:
                display_name = role_name.replace("_", " ").title()
                icon = discord_icons.get(str(role_id)) or fallback_icons.get(role_name, "⭐")
                role_names.append({
                    "id": role_id,
                    "name": display_name,
                    "icon": icon,
                    "is_custom_icon": str(role_id) in discord_icons
                })
                processed_ids.add(role_id)
    guilds_config = roles_config.get("guilds", {})
    for guild_key, guild_data in guilds_config.items():
        guild_role_id = str(guild_data.get("role_id", ""))
        if guild_role_id in [str(r) for r in user_roles]:
            if guild_role_id not in processed_ids:
                guild_name = guild_data.get('name', guild_key).capitalize()
                icon = discord_icons.get(guild_role_id) or fallback_icons.get(guild_key, "⭐")
                role_names.append({
                    "id": guild_role_id,
                    "name": guild_name,
                    "icon": icon,
                    "is_custom_icon": guild_role_id in discord_icons
                })
                processed_ids.add(guild_role_id)
        guild_roles = guild_data.get("roles", {})
        for tier_key, tier_data in guild_roles.items():
            tier_role_id = str(tier_data.get("id", ""))
            if tier_role_id in [str(r) for r in user_roles]:
                if tier_role_id not in processed_ids:
                    tier_name = tier_key.capitalize()
                    icon = discord_icons.get(tier_role_id) or fallback_icons.get(tier_key, "⭐")
                    role_names.append({
                        "id": tier_role_id,
                        "name": tier_name,
                        "icon": icon,
                        "is_custom_icon": tier_role_id in discord_icons
                    })
                    processed_ids.add(tier_role_id)
    return role_names
@router.get("/login")
@limiter.limit("5/minute")
async def discord_login(request: Request):
    """Redirect to Discord OAuth2 authorization page."""
    if not DISCORD_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")
    scopes = "identify guilds"
    encoded_redirect_uri = quote(DISCORD_REDIRECT_URI, safe='')
    oauth_url = (
        f"{DISCORD_OAUTH_URL}/authorize"
        f"?client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={encoded_redirect_uri}"
        f"&response_type=code"
        f"&scope={scopes}"
    )
    return RedirectResponse(url=oauth_url)
@router.get("/callback")
@limiter.limit("10/minute")
async def discord_callback(request: Request):
    """Handle Discord OAuth2 callback."""
    print(f"[DEBUG] Callback endpoint hit - raw URL: {request.url}")
    print(f"[DEBUG] Query params: {request.query_params}")
    code = request.query_params.get("code")
    error = request.query_params.get("error")
    print(f"[DEBUG] OAuth callback received - code: {code}, error: {error}")
    if error:
        raise HTTPException(status_code=400, detail=f"Discord OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received from Discord")
    if not DISCORD_CLIENT_ID or not DISCORD_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Discord OAuth not configured")
    try:
        token_response = await _make_http_request_with_retry(
            "POST",
            f"{DISCORD_OAUTH_URL}/token",
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        print(f"[DEBUG] Token response status: {token_response.status_code}")
        if token_response.status_code != 200:
            print(f"[DEBUG] Token exchange failed: {token_response.status_code} - {token_response.text}")
            raise HTTPException(status_code=400, detail="Failed to exchange code for token")
        token_data = token_response.json()
        access_token = token_data["access_token"]
        user_response = await _make_http_request_with_retry(
            "GET",
            f"{DISCORD_API_BASE}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_response.status_code != 200:
            print(f"[DEBUG] User fetch failed: {user_response.status_code} - {user_response.text}")
            raise HTTPException(status_code=400, detail="Failed to get user info")
        user_data = user_response.json()
    except HTTPException:
        raise
    except Exception as e:
        error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
        print(f"[ERROR] Exception during OAuth: {error_detail}")
        raise HTTPException(status_code=503, detail="OAuth service temporarily unavailable. Please try again.")
    print(f"[DEBUG] OAuth successful for user: {user_data.get('id')}")
    jwt_token = create_jwt_token(user_data)
    redirect_url = f"{FRONTEND_URL}/auth/callback?token={jwt_token}"
    print(f"[DEBUG] Redirecting to: {redirect_url}")
    return RedirectResponse(url=redirect_url)
@router.get("/me")
@limiter.limit("30/minute")
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Get current user from JWT token and create/update user in database."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    discord_id = payload["sub"]
    username = payload["username"]
    avatar_url = None
    if payload.get("avatar"):
        avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{payload['avatar']}.png"
    roles = []
    bot_token = os.getenv("DISCORD_TOKEN") or os.getenv("DISCORD_BOT_TOKEN")
    if bot_token:
        try:
            timeout_config = httpx.Timeout(
                timeout=HTTP_TIMEOUT,
                connect=HTTP_CONNECT_TIMEOUT,
            )
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                guild_ids_to_check = [GUILD_ID] + GUILD_IDS
                aggregated_roles = set()
                for guild_id in guild_ids_to_check:
                    if not guild_id:
                        continue
                    guild_id = guild_id.strip()
                    if not guild_id:
                        continue
                    member_response = await client.get(
                        f"{DISCORD_API_BASE}/guilds/{guild_id}/members/{discord_id}",
                        headers={"Authorization": f"Bot {bot_token}"},
                    )
                    if member_response.status_code == 200:
                        member_data = member_response.json()
                        member_roles = member_data.get("roles", [])
                        print(f"Found user in guild {guild_id}, roles: {member_roles}")
                        aggregated_roles.update(str(r) for r in member_roles)
                    else:
                        print(f"User not found in guild {guild_id} (status: {member_response.status_code})")
                roles = list(aggregated_roles)
        except Exception as e:
            error_detail = f"{type(e).__name__}: {e}" if str(e) else repr(e)
            print(f"Failed to fetch member roles: {error_detail}")
    print(f"Returning user with roles: {roles}")
    discord_icons = {}
    guild_ids_to_check = [GUILD_ID] + GUILD_IDS
    for gid in guild_ids_to_check:
        if gid and gid.strip():
            discord_icons.update(await fetch_discord_role_icons(gid.strip()))
    user_guilds = await get_user_guilds(roles, discord_icons)
    role_info = await get_role_names(roles, guild_id=GUILD_ID)
    result = await db.execute(select(User).where(User.discord_id == discord_id))
    user = result.scalar_one_or_none()
    if not user:
        user = User(
            discord_id=discord_id,
            username=username,
            avatar_url=avatar_url,
        )
        db.add(user)
        print(f"Created new user: {discord_id} ({username})")
    else:
        user.username = username
        user.avatar_url = avatar_url
        print(f"Updated user: {discord_id} ({username})")
    await db.commit()
    return {
        "id": discord_id,
        "discord_id": discord_id,
        "username": username,
        "avatar_url": avatar_url,
        "roles": roles,
        "role_info": role_info,
        "guilds": user_guilds,
        "has_guild_access": len(user_guilds) > 0,
    }
@router.post("/logout")
async def logout():
    """Logout endpoint (client-side token removal)."""
    return {"message": "Logged out successfully"}
