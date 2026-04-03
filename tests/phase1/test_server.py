"""Phase 1: Foundation — API Tests

These tests are pre-written. Your job is to make them pass.
"""

import pytest


class TestHealthEndpoint:
    async def test_health_returns_200(self, client):
        response = await client.get("/api/health")
        assert response.status_code == 200

    async def test_health_returns_ok_status(self, client):
        response = await client.get("/api/health")
        data = response.json()
        assert data == {"status": "ok"}


class TestStaticFiles:
    async def test_root_returns_html(self, client):
        response = await client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
