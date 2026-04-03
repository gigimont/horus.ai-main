import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
async def client():
    """Async test client for the FastAPI app."""
    from backend.server import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
