import anthropic
import json
import re
from config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are an expert M&A analyst specialising in SME acquisition for Search Fund operators.

Your job is to score SME acquisition targets on 4 dimensions (each 0.0–10.0) based on available data.
Be analytical and realistic — not every company is a great target.

Scoring dimensions:
- transition_score: Owner succession readiness. High score = older founder (60+), no clear successor, long tenure, family-owned. Low = young owner, professional management already in place.
- value_score: Acquisition upside potential. High = stable cashflows, defensible niche, underinvested in tech/ops, clear improvement levers. Low = declining revenue, commoditised, high capex.
- market_score: Industry attractiveness. High = fragmented sector ripe for consolidation, recurring demand, essential services. Low = structural decline, highly competitive, low margins.
- financial_score: Financial attractiveness. High = revenue €2M–€20M range (ideal SME buyout size), good revenue-per-employee, established (10+ years). Low = too small, too large, or very young.

overall_score = weighted average: transition(0.35) + value(0.30) + market(0.20) + financial(0.15)

Respond ONLY with a valid JSON object. No preamble, no markdown, no explanation outside the JSON.
"""

def _build_target_summary(target: dict) -> str:
    age = target.get("owner_age_estimate")
    founded = target.get("founded_year")
    revenue = target.get("revenue_eur")
    employees = target.get("employee_count")

    lines = [
        f"Company name: {target.get('name', 'Unknown')}",
        f"Country: {target.get('country', 'Unknown')}",
        f"Region: {target.get('region') or 'not specified'}",
        f"City: {target.get('city') or 'not specified'}",
        f"Industry: {target.get('industry_label') or 'not specified'} (code: {target.get('industry_code') or 'n/a'})",
        f"Employees: {employees if employees else 'unknown'}",
        f"Annual revenue (EUR): {f'€{revenue:,}' if revenue else 'unknown'}",
        f"Founded: {founded if founded else 'unknown'}",
        f"Estimated owner age: {age if age else 'unknown'}",
        f"Website: {target.get('website') or 'none'}",
    ]

    if revenue and employees and employees > 0:
        rev_per_emp = revenue // employees
        lines.append(f"Revenue per employee: €{rev_per_emp:,}")

    if founded:
        from datetime import datetime
        age_yrs = datetime.now().year - founded
        lines.append(f"Company age: {age_yrs} years")

    if target.get("raw_data"):
        lines.append(f"Additional data: {json.dumps(target['raw_data'])[:500]}")

    return "\n".join(lines)

def _parse_scores(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)

async def score_target(target: dict) -> dict:
    target_summary = _build_target_summary(target)

    user_message = f"""Score this SME acquisition target:

<target>
{target_summary}
</target>

Return a JSON object with exactly these fields:
{{
  "transition_score": <float 0-10>,
  "value_score": <float 0-10>,
  "market_score": <float 0-10>,
  "financial_score": <float 0-10>,
  "overall_score": <float 0-10>,
  "rationale": "<2-3 sentence plain-English explanation of the overall score and top reasons>",
  "key_signals": ["<signal 1>", "<signal 2>", "<signal 3>"]
}}"""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}]
    )

    raw = message.content[0].text
    scores = _parse_scores(raw)

    for field in ["transition_score", "value_score", "market_score", "financial_score", "overall_score"]:
        scores[field] = round(max(0.0, min(10.0, float(scores[field]))), 2)

    scores["overall_score"] = round(
        scores["transition_score"] * 0.35 +
        scores["value_score"]     * 0.30 +
        scores["market_score"]    * 0.20 +
        scores["financial_score"] * 0.15,
        2
    )

    return scores
