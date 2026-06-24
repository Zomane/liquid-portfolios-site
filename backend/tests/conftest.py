"""Pytest configuration and fixtures."""
import pytest
import asyncio
import sys
import os
import importlib
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR in sys.path:
    sys.path.remove(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)
loaded_src = sys.modules.get("src")
if loaded_src and not getattr(loaded_src, "__file__", "").startswith(BACKEND_DIR):
    del sys.modules["src"]
importlib.import_module("src.models")
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()
@pytest.fixture
def anyio_backend():
    return "asyncio"
