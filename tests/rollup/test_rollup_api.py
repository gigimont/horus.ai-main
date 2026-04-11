"""
API integration tests for /rollup endpoints.
DB and Claude are fully mocked — only the HTTP routing and response
contract are exercised.
"""
import pytest
from unittest.mock import MagicMock

TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _scenario(**overrides):
    """Minimal rollup_scenarios row dict."""
    base = {
        "id": "scenario-1",
        "tenant_id": TENANT_ID,
        "name": "Test Rollup",
        "description": None,
        "status": "draft",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "created_by": None,
        "updated_by": None,
    }
    return {**base, **overrides}


# ─── GET /rollup/ ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_scenarios_returns_200(rollup_client):
    client, mock_db = rollup_client

    result = MagicMock()
    result.data = [
        {**_scenario(), "rollup_scenario_targets": [{"id": "t1"}, {"id": "t2"}]},
    ]
    mock_db.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = result

    response = await client.get("/rollup/")
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    # rollup_scenario_targets is replaced with target_count
    assert body["data"][0]["target_count"] == 2
    assert "rollup_scenario_targets" not in body["data"][0]


# ─── POST /rollup/ ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_scenario_returns_201(rollup_client):
    client, mock_db = rollup_client

    result = MagicMock()
    result.data = [_scenario(name="New Rollup")]
    mock_db.table.return_value.insert.return_value.execute.return_value = result

    response = await client.post("/rollup/", json={"name": "New Rollup"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "New Rollup"
    assert body["status"] == "draft"


@pytest.mark.asyncio
async def test_create_scenario_with_description(rollup_client):
    client, mock_db = rollup_client

    result = MagicMock()
    result.data = [_scenario(name="HVAC Roll-up", description="3 HVAC targets in DACH region")]
    mock_db.table.return_value.insert.return_value.execute.return_value = result

    response = await client.post("/rollup/", json={
        "name": "HVAC Roll-up",
        "description": "3 HVAC targets in DACH region",
    })
    assert response.status_code == 201
    assert response.json()["description"] == "3 HVAC targets in DACH region"


# ─── GET /rollup/{id} ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_scenario_returns_200(rollup_client):
    client, mock_db = rollup_client

    result = MagicMock()
    result.data = {**_scenario(), "rollup_scenario_targets": []}
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = result

    response = await client.get("/rollup/scenario-1")
    assert response.status_code == 200
    assert response.json()["name"] == "Test Rollup"


@pytest.mark.asyncio
async def test_get_scenario_returns_404_when_not_found(rollup_client):
    client, mock_db = rollup_client

    result = MagicMock()
    result.data = None  # Supabase returns None when .single() finds nothing
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = result

    response = await client.get("/rollup/does-not-exist")
    assert response.status_code == 404


# ─── DELETE /rollup/{id} ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_scenario_returns_204(rollup_client):
    client, mock_db = rollup_client

    # _get_scenario is called first to verify ownership
    get_result = MagicMock()
    get_result.data = {**_scenario(), "rollup_scenario_targets": []}
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = get_result

    response = await client.delete("/rollup/scenario-1")
    assert response.status_code == 204


# ─── GET /rollup/{id}/financials ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_financials_endpoint_returns_computed_model(rollup_client):
    """Financials endpoint runs compute_financials() on the scenario's targets."""
    client, mock_db = rollup_client

    result = MagicMock()
    result.data = {
        **_scenario(),
        "rollup_scenario_targets": [{
            "target_id": "tgt-1",
            "sequence_order": 0,
            "entry_multiple": 6.0,
            "ebitda_margin_pct": 20.0,
            "ebitda_margin_source": "ai",
            "synergy_pct": 0.0,
            "revenue_uplift_pct": 0.0,
            "debt_pct": 50.0,
            "integration_cost_eur": 0,
            "hold_period_years": 5,
            "targets": {"revenue_eur": 1_000_000, "name": "Plumbing GmbH"},
        }],
    }
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = result

    response = await client.get("/rollup/scenario-1/financials")
    assert response.status_code == 200
    body = response.json()

    # revenue = 1_000_000 × 20% = 200_000
    assert body["targets"][0]["ebitda"] == 200_000
    # entry_cost = 200_000 × 6 = 1_200_000
    assert body["targets"][0]["entry_cost"] == 1_200_000
    # combined totals
    assert body["combined"]["total_revenue"] == 1_000_000
    assert body["combined"]["total_ebitda_pre_synergy"] == 200_000


# ─── E2E: create scenario → verify financials ─────────────────────────────────

@pytest.mark.asyncio
async def test_e2e_create_then_verify_financials(rollup_client):
    """
    End-to-end flow:
      1. POST /rollup/ — create a new scenario
      2. GET /rollup/{id}/financials — verify financials for a pre-seeded target

    DB is mocked for both calls; Claude is not invoked.
    Asserts that the full HTTP path works and the financial model is correct.
    """
    client, mock_db = rollup_client
    SCENARIO_ID = "e2e-scenario"

    # ── Step 1: create scenario ──
    create_result = MagicMock()
    create_result.data = [_scenario(id=SCENARIO_ID, name="E2E Rollup")]
    mock_db.table.return_value.insert.return_value.execute.return_value = create_result

    resp = await client.post("/rollup/", json={"name": "E2E Rollup"})
    assert resp.status_code == 201
    assert resp.json()["id"] == SCENARIO_ID

    # ── Step 2: verify financials ──
    # revenue = 2_000_000, margin = 25%, multiple = 5, debt = 60%
    # ebitda = 500_000, entry = 2_500_000, debt = 1_500_000, equity = 1_000_000
    # synergy = 500_000 × 10% = 50_000 → proforma_ebitda = 550_000
    get_result = MagicMock()
    get_result.data = {
        **_scenario(id=SCENARIO_ID, name="E2E Rollup"),
        "rollup_scenario_targets": [{
            "target_id": "acme-id",
            "sequence_order": 0,
            "entry_multiple": 5.0,
            "ebitda_margin_pct": 25.0,
            "ebitda_margin_source": "ai",
            "synergy_pct": 10.0,
            "revenue_uplift_pct": 0.0,
            "debt_pct": 60.0,
            "integration_cost_eur": 100_000,
            "hold_period_years": 5,
            "targets": {"revenue_eur": 2_000_000, "name": "Acme Plumbing GmbH"},
        }],
    }
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value = get_result

    resp = await client.get(f"/rollup/{SCENARIO_ID}/financials")
    assert resp.status_code == 200
    body = resp.json()

    assert body["targets"][0]["ebitda"] == 500_000
    assert body["targets"][0]["entry_cost"] == 2_500_000
    assert body["targets"][0]["debt"] == 1_500_000
    assert body["targets"][0]["equity_in"] == 1_000_000
    assert body["targets"][0]["synergy_value"] == 50_000
    assert body["combined"]["proforma_ebitda"] == 550_000
    assert body["combined"]["total_integration_cost"] == 100_000
