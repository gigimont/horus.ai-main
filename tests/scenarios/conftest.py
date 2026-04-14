# tests/scenarios/conftest.py
import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.dGVzdA",
)
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../apps/api")))

import pytest
from unittest.mock import MagicMock
from httpx import AsyncClient, ASGITransport

TENANT_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
async def scenarios_client():
    """Async HTTP client for scenarios routes with mocked DB and tenant."""
    from main import app
    from dependencies import get_db, get_tenant_id

    mock_db = MagicMock()
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    app.dependency_overrides[get_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, mock_db

    app.dependency_overrides.clear()
