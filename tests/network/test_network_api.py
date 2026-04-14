# tests/network/test_network_api.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../apps/api'))

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

TENANT_ID = "00000000-0000-0000-0000-000000000001"
SCENARIO_ID = "11111111-0000-0000-0000-000000000001"
TARGET_ID_A = "aaaaaaaa-0000-0000-0000-000000000001"
TARGET_ID_B = "bbbbbbbb-0000-0000-0000-000000000002"

MOCK_EDGE = {
    "id": "edge-1",
    "scenario_id": SCENARIO_ID,
    "source_target_id": TARGET_ID_A,
    "dest_target_id": TARGET_ID_B,
    "edge_type": "supply_chain",
    "strength": 0.8,
    "description": "Both supply automotive OEMs",
    "metadata": {},
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

MOCK_TARGETS_ROWS = [
    {"targets": {"id": TARGET_ID_A, "name": "Stahl GmbH", "industry_label": "Metal", "city": "Stuttgart", "country": "DE", "revenue_eur": 8000000, "employee_count": 120, "description": "", "target_scores": [{"overall_score": 7.5}]}},
    {"targets": {"id": TARGET_ID_B, "name": "Metall AG", "industry_label": "Metal", "city": "Munich", "country": "DE", "revenue_eur": 6000000, "employee_count": 90, "description": "", "target_scores": [{"overall_score": 6.0}]}},
]


def make_db(scenario_exists=True, edges=None, targets_rows=None):
    db = MagicMock()

    def table_side_effect(name):
        t = MagicMock()
        t.select.return_value = t
        t.eq.return_value = t
        t.insert.return_value = t
        t.delete.return_value = t
        t.single.return_value = t

        if name == "rollup_scenarios":
            t.execute.return_value = MagicMock(
                data={"id": SCENARIO_ID, "name": "Test Scenario", "tenant_id": TENANT_ID} if scenario_exists else None
            )
        elif name == "rollup_scenario_targets":
            t.execute.return_value = MagicMock(data=targets_rows if targets_rows is not None else MOCK_TARGETS_ROWS)
        elif name == "network_edges":
            t.execute.return_value = MagicMock(data=edges if edges is not None else [MOCK_EDGE])

        return t

    db.table.side_effect = table_side_effect
    return db


@pytest.fixture
def app():
    from main import app
    return app


def test_analyse_returns_201(app):
    from dependencies import get_db, get_tenant_id
    db = make_db()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    try:
        with patch("routers.network.analyse_network", new_callable=AsyncMock) as mock_analyse:
            mock_analyse.return_value = [
                {"source_target_id": TARGET_ID_A, "dest_target_id": TARGET_ID_B,
                 "edge_type": "supply_chain", "strength": 0.8, "description": "Connected"}
            ]
            with TestClient(app) as c:
                res = c.post(f"/network/analyse/{SCENARIO_ID}")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 201
    data = res.json()
    assert data["edges_created"] == 1
    assert data["target_count"] == 2


def test_analyse_404_unknown_scenario(app):
    from dependencies import get_db, get_tenant_id
    db = make_db(scenario_exists=False)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    try:
        with TestClient(app) as c:
            res = c.post(f"/network/analyse/{SCENARIO_ID}")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 404


def test_get_network_returns_nodes_and_edges(app):
    from dependencies import get_db, get_tenant_id
    db = make_db()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    try:
        with TestClient(app) as c:
            res = c.get(f"/network/{SCENARIO_ID}")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    data = res.json()
    assert "nodes" in data
    assert "edges" in data


def test_get_stats_returns_metrics(app):
    from dependencies import get_db, get_tenant_id
    db = make_db()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    try:
        with TestClient(app) as c:
            res = c.get(f"/network/{SCENARIO_ID}/stats")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    data = res.json()
    assert "total_edges" in data
    assert "avg_strength" in data
    assert "edge_type_distribution" in data


def test_delete_network_returns_204(app):
    from dependencies import get_db, get_tenant_id
    db = make_db()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    try:
        with TestClient(app) as c:
            res = c.delete(f"/network/{SCENARIO_ID}")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 204
