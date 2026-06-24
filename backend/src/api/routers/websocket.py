"""WebSocket endpoint for real-time portfolio updates."""
import logging
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ws", tags=["websocket"])
class ConnectionManager:
    """Manage WebSocket connections for broadcasting."""
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"✅ WebSocket connected. Total connections: {len(self.active_connections)}")
    def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection."""
        self.active_connections.discard(websocket)
        logger.info(f"❌ WebSocket disconnected. Total connections: {len(self.active_connections)}")
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients."""
        if not self.active_connections:
            return
        message_json = json.dumps(message)
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message_json)
            except Exception as e:
                logger.warning(f"Failed to send to connection: {e}")
                disconnected.add(connection)
        for connection in disconnected:
            self.disconnect(connection)
        if self.active_connections:
            logger.info(f"📡 Broadcasted to {len(self.active_connections)} clients: {message.get('type')}")
manager = ConnectionManager()
@router.websocket("/portfolios")
async def websocket_portfolios(websocket: WebSocket):
    """WebSocket endpoint for portfolio updates.
    Clients connect to this endpoint to receive real-time updates
    when portfolios are created, updated, reviewed, or deleted.
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
async def broadcast_portfolio_update(event_type: str, portfolio_id: int = None, discord_id: str = None):
    """Broadcast portfolio update to all connected clients.
    Args:
        event_type: Type of event (created, updated, reviewed, deleted)
        portfolio_id: Portfolio ID (optional)
        discord_id: Discord ID (optional)
    """
    message = {
        "type": "portfolio_update",
        "event": event_type,
        "portfolio_id": portfolio_id,
        "discord_id": discord_id,
        "timestamp": None,
    }
    await manager.broadcast(message)
