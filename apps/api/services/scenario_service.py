# apps/api/services/scenario_service.py
import json
import logging
from services.claude_service import client

logger = logging.getLogger(__name__)


async def run_scenario(target: dict, scenario_type: str, severity: int, description: str) -> dict:
    """
    Ask Claude to analyze the impact of a scenario on a target.
    target: dict with target fields + target_scores[0] row.
    Returns {score_deltas, implications, acquisition_window_effect}.
    """
    scores = (target.get("target_scores") or [{}])[0]

    prompt = f"""You are advising a Search Fund operator analyzing SME acquisition targets.

Target: {target.get('name', 'Unknown')}
Country: {target.get('country', '?')} | Industry: {target.get('industry_label', '?')}
Revenue: EUR {(target.get('revenue_eur') or 0):,} | Employees: {target.get('employee_count', '?')}
Owner age estimate: {target.get('owner_age_estimate', '?')}

Current scores (0–10):
- Transition readiness: {scores.get('transition_score', '?')}
- Value potential: {scores.get('value_score', '?')}
- Market attractiveness: {scores.get('market_score', '?')}
- Financial profile: {scores.get('financial_score', '?')}

Scenario type: {scenario_type} | Severity: {severity}/10
Description: {description}

Scenario types:
- macro_shock: broad economic disruption (recession, rate spike, inflation)
- industry_shift: sector-specific change (regulation, disruption, consolidation)
- succession_trigger: owner-related event (health, retirement urgency, family pressure)

Analyze how this scenario affects this acquisition target. Respond ONLY as JSON, no markdown:
{{
  "transition_delta": <integer -10 to 10>,
  "value_delta": <integer -10 to 10>,
  "market_delta": <integer -10 to 10>,
  "financial_delta": <integer -10 to 10>,
  "implications": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "acquisition_window_effect": "<one sentence on urgency/timing impact>"
}}

Deltas are additive to current scores. Negative = worsening, positive = improving. implications must be exactly 3 strings."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip()

    start = raw.find('{')
    end = raw.rfind('}')
    if start == -1 or end == -1:
        logger.warning(f"Claude scenario response had no JSON: {raw[:100]}")
        raise ValueError("Claude returned no JSON")

    parsed = json.loads(raw[start:end + 1])

    t_delta = parsed["transition_delta"]
    v_delta = parsed["value_delta"]
    m_delta = parsed["market_delta"]
    f_delta = parsed["financial_delta"]

    overall_delta = round(
        t_delta * 0.35 + v_delta * 0.30 + m_delta * 0.20 + f_delta * 0.15,
        2
    )

    return {
        "score_deltas": {
            "overall_delta": overall_delta,
            "transition_delta": t_delta,
            "value_delta": v_delta,
            "market_delta": m_delta,
            "financial_delta": f_delta,
        },
        "implications": parsed["implications"],
        "acquisition_window_effect": parsed["acquisition_window_effect"],
    }
