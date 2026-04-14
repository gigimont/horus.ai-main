# tests/scenarios/test_scenario_service.py
import pytest
import json
from unittest.mock import patch, MagicMock


@pytest.fixture
def sample_target():
    return {
        "id": "target-1",
        "name": "Acme Plumbing GmbH",
        "country": "DE",
        "industry_label": "Plumbing Services",
        "revenue_eur": 2_000_000,
        "employee_count": 25,
        "owner_age_estimate": 62,
        "target_scores": [{
            "transition_score": 7.0,
            "value_score": 6.0,
            "market_score": 5.0,
            "financial_score": 4.0,
            "overall_score": 5.9,
            "scored_at": "2026-01-01T00:00:00Z",
        }],
    }


def _mock_claude(deltas: dict, implications=None, window="Window shifts."):
    payload = {
        "transition_delta": deltas.get("transition", 0),
        "value_delta":      deltas.get("value", 0),
        "market_delta":     deltas.get("market", 0),
        "financial_delta":  deltas.get("financial", 0),
        "implications": implications or ["Point A.", "Point B.", "Point C."],
        "acquisition_window_effect": window,
    }
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text=json.dumps(payload))]
    return mock_msg


@pytest.mark.asyncio
async def test_run_scenario_returns_expected_keys(sample_target):
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude({"transition": 2, "value": -1})
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "macro_shock", 7, "Rate spike")

    assert "score_deltas" in result
    assert "implications" in result
    assert "acquisition_window_effect" in result


@pytest.mark.asyncio
async def test_run_scenario_deltas_match_claude_output(sample_target):
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude(
            {"transition": 2, "value": -1, "market": 0, "financial": -3}
        )
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "macro_shock", 7, "Rate spike")

    d = result["score_deltas"]
    assert d["transition_delta"] == 2
    assert d["value_delta"] == -1
    assert d["market_delta"] == 0
    assert d["financial_delta"] == -3


@pytest.mark.asyncio
async def test_overall_delta_weighted_average(sample_target):
    # transition_delta=4 × 0.35 = 1.4, rest 0 → overall = 1.4
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude({"transition": 4})
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "succession_trigger", 5, "Owner health scare")

    assert result["score_deltas"]["overall_delta"] == pytest.approx(1.4, rel=1e-3)


@pytest.mark.asyncio
async def test_overall_delta_all_dimensions(sample_target):
    # transition=2×0.35 + value=-2×0.30 + market=1×0.20 + financial=-1×0.15
    # = 0.70 - 0.60 + 0.20 - 0.15 = 0.15
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude(
            {"transition": 2, "value": -2, "market": 1, "financial": -1}
        )
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "industry_shift", 3, "New regulation")

    assert result["score_deltas"]["overall_delta"] == pytest.approx(0.15, rel=1e-3)


@pytest.mark.asyncio
async def test_implications_has_three_items(sample_target):
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude({}, implications=["A", "B", "C"])
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "macro_shock", 5, "Recession")

    assert len(result["implications"]) == 3


@pytest.mark.asyncio
async def test_raises_on_no_json(sample_target):
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Sorry, I cannot help with that.")]
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = mock_msg
        from services.scenario_service import run_scenario
        with pytest.raises(ValueError, match="no JSON"):
            await run_scenario(sample_target, "macro_shock", 5, "Test")
