"""Background cache warmer for portfolio data."""
import asyncio
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
logger = logging.getLogger(__name__)
class PortfolioCacheWarmer:
    """Background task to warm up portfolio cache."""
    def __init__(self, session_factory: async_sessionmaker):
        self.session_factory = session_factory
        self.task: Optional[asyncio.Task] = None
        self.running = False
    async def start(self):
        """Start the cache warmer background task."""
        if self.running:
            logger.warning("Cache warmer is already running")
            return
        self.running = True
        self.task = asyncio.create_task(self._run())
        logger.info("✅ Portfolio cache warmer started")
    async def stop(self):
        """Stop the cache warmer background task."""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("🛑 Portfolio cache warmer stopped")
    async def _run(self):
        """Main loop for cache warming."""
        await asyncio.sleep(10)
        while self.running:
            try:
                await self._warm_cache()
            except Exception as e:
                logger.error(f"Error warming cache: {e}")
            await asyncio.sleep(120)
    async def _warm_cache(self):
        """Warm up the portfolio cache by fetching data."""
        try:
            import httpx
            import os
            base_url = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
            logger.info("🔥 Warming portfolio cache...")
        except Exception as e:
            logger.error(f"Failed to warm cache: {e}")
_cache_warmer: Optional[PortfolioCacheWarmer] = None
def initialize_cache_warmer(session_factory: async_sessionmaker) -> PortfolioCacheWarmer:
    """Initialize the cache warmer."""
    global _cache_warmer
    if _cache_warmer is None:
        _cache_warmer = PortfolioCacheWarmer(session_factory)
    return _cache_warmer
def get_cache_warmer() -> Optional[PortfolioCacheWarmer]:
    """Get the cache warmer instance."""
    return _cache_warmer
