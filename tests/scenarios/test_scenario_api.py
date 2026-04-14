# tests/scenarios/test_scenario_api.py
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _target():
    return {
        "id": "target-1",
        "tenant_id": TENANT_ID,
        "name": "Acme Plumbing GmbH",
        "country": "DE",
        "industry_label": "Plumbing",
        "revenue_eur": 2_000_000,
        "employee_count": 25,
        "owner_age_estimate": 62,
        "target_scores": [{
            "overall_score": 5.9,
            "transition_score": 7.0,
            "value_score": 6.0,
            "market_score": 5.0,
            "financial_score": 4.0,
            "scored_at": "2026-01-01T00:00:00Z",
        }],
    }


def _result_row():
    return {
        "id": "result-1",
        "tenant_id": TENANT_ID,
        "target_id": "target-1",
        "rollup_scenario_id": None,
        "scenario_type": "macro_shock",
        "severity": 7,
        "description": "Rate spike",
        "score_before": {
            "overall_score": 5.9,
            "transition_score": 7.0,
            "value_score": 6.0,
            "market_score": 5.0,
            "financial_score": 4.0,
            "scored_at": "2026-01-01T00:00:00Z",
        },
        "score_deltas": {
            "overall_delta": -0.5,
            "transition_delta": 0,
            "value_delta": -1,
            "market_delta": -1,
            "financial_delta": -2,
        },
        "implications": ["A", "B", "C"],
        "acquisition_window_effect": "Window shortens.",
        "model_version": "v1",
        "run_at": "2026-01-02T00:00:00Z",
    }


def _mock_db_for_run(mock_db):
    """Set up mock DB for POST /scenarios/run: target fetch + result insert."""
    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "targets":
            m.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = _target()
        elif table_name == "scenario_results":
            m.insert.return_value.execute.return_value.data = [_result_row()]
        return m
    mock_db.table.side_effect = table_side_effect


# ─── POST /scenarios/run ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_scenario_returns_201(scenarios_client):
    client, mock_db = scenarios_client
    _mock_db_for_run(mock_db)

    service_result = {
        "score_deltas": {
            "overall_delta": -0.5,
            "transition_delta": 0,
            "value_delta": -1,
            "market_delta": -1,
            "financial_delta": -2,
        },
        "implications": ["A", "B", "C"],
        "acquisition_window_effect": "Window shortens.",
    }

    with patch("routers.scenarios.run_scenario", new_callable=AsyncMock, return_value=service_result):
        response = await client.post("/scenarios/run", json={
            "target_id": "target-1",
            "scenario_type": "macro_shock",
            "severity": 7,
            "description": "Rate spike",
        })

    assert response.status_code == 201
    body = response.json()
    assert body["scenario_type"] == "macro_shock"
    assert body["severity"] == 7
    assert body["implications"] == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_run_scenario_returns_404_when_target_not_found(scenarios_client):
    client, mock_db = scenarios_client

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "targets":
            m.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None
        return m
    mock_db.table.side_effect = table_side_effect

    response = await client.post("/scenarios/run", json={
        "target_id": "no-such-target",
        "scenario_type": "macro_shock",
        "severity": 5,
        "description": "Test",
    })

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_run_scenario_returns_400_for_invalid_type(scenarios_client):
    client, mock_db = scenarios_client

    response = await client.post("/scenarios/run", json={
        "target_id": "target-1",
        "scenario_type": "bad_type",
        "severity": 5,
        "description": "Test",
    })

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_run_scenario_returns_400_for_invalid_severity(scenarios_client):
    client, mock_db = scenarios_client

    response = await client.post("/scenarios/run", json={
        "target_id": "target-1",
        "scenario_type": "macro_shock",
        "severity": 11,
        "description": "Test",
    })

    assert response.status_code == 400


# ─── GET /scenarios/target/{id} ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_scenario_results_returns_200(scenarios_client):
    client, mock_db = scenarios_client

    res = MagicMock()
    res.data = [_result_row()]
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = res

    response = await client.get("/scenarios/target/target-1")
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["scenario_type"] == "macro_shock"


# ─── DELETE /scenarios/{id} ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_scenario_result_returns_204(scenarios_client):
    client, mock_db = scenarios_client

    response = await client.delete("/scenarios/result-1")
    assert response.status_code == 204
