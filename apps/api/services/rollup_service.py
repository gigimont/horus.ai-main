# apps/api/services/rollup_service.py
import json
import logging
from services.claude_service import client

logger = logging.getLogger(__name__)


def compute_financials(targets: list[dict]) -> dict:
    """
    Pure computation — no DB, no Claude.
    targets: list of rollup_scenario_targets rows each with a 'targets' join
    containing revenue_eur.
    Returns dict with 'targets' (per-target breakdown) and 'combined' (aggregates).
    """
    per_target = []
    for t in targets:
        revenue = (t.get("targets") or {}).get("revenue_eur") or 0
        margin = (t.get("ebitda_margin_pct") or 0) / 100
        ebitda = revenue * margin
        entry_cost = ebitda * (t.get("entry_multiple") or 6.0)
        debt = entry_cost * (t.get("debt_pct") or 50.0) / 100
        equity_in = entry_cost - debt
        synergy_value = ebitda * (t.get("synergy_pct") or 0) / 100
        revenue_uplift = revenue * (t.get("revenue_uplift_pct") or 0) / 100
        per_target.append({
            "target_id": t["target_id"],
            "name": (t.get("targets") or {}).get("name", ""),
            "sequence_order": t.get("sequence_order", 0),
            "revenue_eur": revenue,
            "ebitda": round(ebitda),
            "entry_cost": round(entry_cost),
            "debt": round(debt),
            "equity_in": round(equity_in),
            "synergy_value": round(synergy_value),
            "revenue_uplift": round(revenue_uplift),
        })

    total_revenue = sum(t["revenue_eur"] for t in per_target)
    total_ebitda_pre = sum(t["ebitda"] for t in per_target)
    total_synergy = sum(t["synergy_value"] for t in per_target)
    total_uplift = sum(t["revenue_uplift"] for t in per_target)
    proforma_ebitda = total_ebitda_pre + total_synergy
    proforma_revenue = total_revenue + total_uplift
    total_entry_cost = sum(t["entry_cost"] for t in per_target)
    total_integration = sum((t.get("integration_cost_eur") or 0) for t in targets)
    total_equity_in = sum(t["equity_in"] for t in per_target)
    total_debt = sum(t["debt"] for t in per_target)
    multiples = [t.get("entry_multiple") or 6.0 for t in targets]
    avg_multiple = sum(multiples) / len(multiples) if multiples else 6.0
    exit_value = proforma_ebitda * avg_multiple
    equity_return = (
        (exit_value - total_debt - total_integration) / total_equity_in - 1
        if total_equity_in > 0 else 0
    )

    return {
        "targets": per_target,
        "combined": {
            "total_revenue": total_revenue,
            "total_ebitda_pre_synergy": total_ebitda_pre,
            "total_synergy_value": total_synergy,
            "total_revenue_uplift": total_uplift,
            "proforma_ebitda": round(proforma_ebitda),
            "proforma_revenue": round(proforma_revenue),
            "total_entry_cost": round(total_entry_cost),
            "total_integration_cost": total_integration,
            "total_equity_in": round(total_equity_in),
            "total_debt": round(total_debt),
            "avg_entry_multiple": round(avg_multiple, 2),
            "exit_value": round(exit_value),
            "equity_return_pct": round(equity_return, 4),
        }
    }


async def estimate_ebitda_margin(target: dict) -> float:
    """
    Ask Claude to estimate EBITDA margin (%) for a single target.
    Returns a float like 18.5 (meaning 18.5%).
    """
    scores = (target.get("target_scores") or [{}])[0]
    signals = scores.get("key_signals") or []
    prompt = f"""Estimate the EBITDA margin as a percentage of revenue for this European SME acquisition target.

Company profile:
- Industry: {target.get('industry_label', 'unknown')} ({target.get('industry_code', 'n/a')})
- Country: {target.get('country', 'unknown')}
- Annual revenue: {f"EUR {target['revenue_eur']:,}" if target.get('revenue_eur') else 'unknown'}
- Employees: {target.get('employee_count', 'unknown')}
- Founded: {target.get('founded_year', 'unknown')}
- Financial score: {scores.get('financial_score', 'N/A')}/10
- Key signals: {', '.join(signals) if signals else 'none'}

Return ONLY a single float between 0.0 and 50.0 representing the EBITDA margin percentage.
No explanation, no units, just the number. Example: 14.5"""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=16,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip()
    return round(float(raw), 1)


async def suggest_sequence(targets: list[dict]) -> list[dict]:
    """
    Ask Claude to recommend acquisition order.
    targets: rollup_scenario_targets rows with 'targets' join.
    Returns list of {target_id, suggested_order, rationale}.
    """
    summaries = []
    for i, t in enumerate(targets):
        tgt = t.get("targets") or {}
        scores = (tgt.get("target_scores") or [{}])[0]
        summaries.append(
            f"{i+1}. {tgt.get('name','?')} | transition={scores.get('transition_score','?')} "
            f"| entry_cost=EUR {round((tgt.get('revenue_eur',0) or 0) * (t.get('ebitda_margin_pct',15)/100) * t.get('entry_multiple',6)):,} "
            f"| integration_cost=EUR {t.get('integration_cost_eur',0):,} "
            f"| id={t['target_id']}"
        )

    prompt = f"""You are advising a Search Fund operator on the optimal acquisition sequence for a roll-up.

Targets to sequence:
{chr(10).join(summaries)}

Recommend the optimal acquisition order considering: owner transition urgency (transition score),
capital requirements (entry cost), integration complexity (integration cost), and strategic sequencing
(build platform before bolt-ons).

Respond ONLY as a JSON array, no markdown:
[{{"target_id": "<uuid>", "suggested_order": 0, "rationale": "<one sentence>"}}, ...]

suggested_order is 0-indexed. Include all {len(targets)} targets."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


async def generate_memo(scenario: dict, financials: dict) -> str:
    """
    Generate a full IC memo as plain text with 7 sections.
    scenario: rollup_scenarios row with rollup_scenario_targets + targets joins.
    financials: output of compute_financials().
    """
    targets = scenario.get("rollup_scenario_targets") or []
    c = financials["combined"]

    target_summaries = []
    for t in sorted(targets, key=lambda x: x.get("sequence_order", 0)):
        tgt = t.get("targets") or {}
        scores = (tgt.get("target_scores") or [{}])[0]
        target_summaries.append(
            f"- {tgt.get('name','?')} | {tgt.get('industry_label','?')} | {tgt.get('country','?')} "
            f"| Revenue EUR {(tgt.get('revenue_eur') or 0):,} | Employees {tgt.get('employee_count','?')} "
            f"| Overall score {scores.get('overall_score','?')}/10 "
            f"| Entry multiple {t.get('entry_multiple',6)}x | Synergy {t.get('synergy_pct',15)}%"
        )

    fin_summary = f"""Combined portfolio metrics:
- Total revenue: EUR {c['total_revenue']:,}
- Pro-forma EBITDA (post-synergy): EUR {c['proforma_ebitda']:,}
- Total entry cost: EUR {c['total_entry_cost']:,}
- Total equity invested: EUR {c['total_equity_in']:,}
- Total synergy value: EUR {c['total_synergy_value']:,}
- Equity return estimate: {c['equity_return_pct']*100:.1f}%
- Exit value (at {c['avg_entry_multiple']}x): EUR {c['exit_value']:,}"""

    prompt = f"""Write a professional investment committee memo for this Search Fund roll-up strategy.

Scenario: {scenario['name']}
{f"Description: {scenario['description']}" if scenario.get('description') else ""}

Targets ({len(targets)} companies, in acquisition order):
{chr(10).join(target_summaries)}

{fin_summary}

Write exactly these 7 sections with these headings:
1. Executive Summary
2. Target Portfolio
3. Acquisition Sequence & Rationale
4. Financial Overview
5. Synergy Analysis
6. Risk Factors
7. Recommendation

Be analytical, concise, and professional. Write for a sophisticated M&A/PE audience.
Use the financial figures provided. Do not invent figures not given."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text
