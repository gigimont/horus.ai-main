"""
Unit tests for compute_financials() in apps/api/services/rollup_service.py.
Pure function — no DB, no Claude, no fixtures needed.
"""
from services.rollup_service import compute_financials


def make_target(**overrides):
    """Minimal rollup_scenario_target dict with sensible defaults."""
    base = {
        "target_id": "abc-123",
        "targets": {"revenue_eur": 1_000_000, "name": "Test Co"},
        "ebitda_margin_pct": 20.0,
        "entry_multiple": 6.0,
        "debt_pct": 50.0,
        "synergy_pct": 0.0,
        "revenue_uplift_pct": 0.0,
        "integration_cost_eur": 0,
        "sequence_order": 0,
    }
    return {**base, **overrides}


# --- empty list ---

def test_empty_targets_returns_zero_combined():
    result = compute_financials([])
    assert result["targets"] == []
    assert result["combined"]["total_revenue"] == 0
    assert result["combined"]["total_ebitda_pre_synergy"] == 0
    assert result["combined"]["proforma_ebitda"] == 0
    assert result["combined"]["total_entry_cost"] == 0
    assert result["combined"]["equity_return_pct"] == 0


# --- per-target fields ---

def test_ebitda_is_revenue_times_margin():
    # revenue = 1_000_000, margin = 20 % → ebitda = 200_000
    result = compute_financials([make_target(ebitda_margin_pct=20)])
    assert result["targets"][0]["ebitda"] == 200_000


def test_entry_cost_is_ebitda_times_multiple():
    # ebitda = 200_000, multiple = 6 → entry_cost = 1_200_000
    result = compute_financials([make_target(ebitda_margin_pct=20, entry_multiple=6)])
    assert result["targets"][0]["entry_cost"] == 1_200_000


def test_debt_and_equity_split():
    # entry_cost = 1_200_000, debt_pct = 50 → debt = 600_000, equity_in = 600_000
    result = compute_financials([make_target(ebitda_margin_pct=20, entry_multiple=6, debt_pct=50)])
    assert result["targets"][0]["debt"] == 600_000
    assert result["targets"][0]["equity_in"] == 600_000


def test_synergy_value_is_ebitda_times_synergy_pct():
    # ebitda = 200_000, synergy_pct = 15 → synergy_value = 30_000
    result = compute_financials([make_target(ebitda_margin_pct=20, synergy_pct=15)])
    assert result["targets"][0]["synergy_value"] == 30_000


def test_revenue_uplift_is_revenue_times_uplift_pct():
    # revenue = 1_000_000, uplift_pct = 10 → revenue_uplift = 100_000
    result = compute_financials([make_target(revenue_uplift_pct=10)])
    assert result["targets"][0]["revenue_uplift"] == 100_000


def test_null_margin_treated_as_zero():
    result = compute_financials([make_target(ebitda_margin_pct=None)])
    assert result["targets"][0]["ebitda"] == 0
    assert result["targets"][0]["entry_cost"] == 0


def test_null_revenue_treated_as_zero():
    result = compute_financials([make_target(targets={"revenue_eur": None, "name": "No Revenue Co"})])
    assert result["targets"][0]["ebitda"] == 0
    assert result["targets"][0]["revenue_eur"] == 0


# --- combined fields ---

def test_proforma_ebitda_includes_synergies():
    # ebitda = 200_000, synergy = 30_000 → proforma = 230_000
    result = compute_financials([make_target(ebitda_margin_pct=20, synergy_pct=15)])
    assert result["combined"]["proforma_ebitda"] == 230_000


def test_combined_revenue_sums_across_targets():
    t1 = make_target(target_id="t1", targets={"revenue_eur": 1_000_000, "name": "A"})
    t2 = make_target(target_id="t2", targets={"revenue_eur": 2_000_000, "name": "B"})
    result = compute_financials([t1, t2])
    assert result["combined"]["total_revenue"] == 3_000_000


def test_avg_multiple_is_mean_across_targets():
    t1 = make_target(target_id="t1", entry_multiple=4.0)
    t2 = make_target(target_id="t2", entry_multiple=8.0)
    result = compute_financials([t1, t2])
    assert result["combined"]["avg_entry_multiple"] == 6.0


def test_equity_return_formula():
    # ebitda = 200_000, multiple = 5, debt_pct = 50, integration = 0
    # entry_cost = 1_000_000, debt = 500_000, equity_in = 500_000
    # exit_value = proforma_ebitda(200_000) × avg_multiple(5) = 1_000_000
    # return = (1_000_000 − 500_000 − 0) / 500_000 − 1 = 0
    result = compute_financials([make_target(
        ebitda_margin_pct=20, entry_multiple=5, debt_pct=50,
        synergy_pct=0, integration_cost_eur=0,
    )])
    assert result["combined"]["equity_return_pct"] == 0.0


def test_equity_return_zero_when_no_equity():
    # debt_pct = 100 → equity_in = 0 → guard returns 0 instead of divide-by-zero
    result = compute_financials([make_target(ebitda_margin_pct=20, debt_pct=100)])
    assert result["combined"]["equity_return_pct"] == 0


def test_integration_cost_in_combined():
    result = compute_financials([make_target(integration_cost_eur=50_000)])
    assert result["combined"]["total_integration_cost"] == 50_000
