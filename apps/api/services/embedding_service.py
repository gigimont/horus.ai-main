import json
import hashlib
import logging
from db.supabase import supabase
from services.claude_service import client

logger = logging.getLogger(__name__)


def build_target_text(target: dict) -> str:
    """Build a rich text representation of a target for embedding."""
    parts = []

    if target.get("name"):
        parts.append(f"Company: {target['name']}")
    if target.get("industry_label"):
        parts.append(f"Industry: {target['industry_label']}")
    if target.get("industry_code"):
        parts.append(f"Industry code: {target['industry_code']}")
    if target.get("country"):
        parts.append(f"Country: {target['country']}")
    if target.get("region"):
        parts.append(f"Region: {target['region']}")
    if target.get("city"):
        parts.append(f"City: {target['city']}")
    if target.get("employee_count"):
        parts.append(f"Employees: {target['employee_count']}")
    if target.get("revenue_eur"):
        parts.append(f"Annual revenue: EUR {target['revenue_eur']:,}")
    if target.get("founded_year"):
        parts.append(f"Founded: {target['founded_year']}")
    if target.get("owner_age_estimate"):
        parts.append(f"Owner age: approximately {target['owner_age_estimate']}")

    scores = target.get("target_scores") or []
    if scores:
        s = scores[0] if isinstance(scores, list) else scores
        if s.get("rationale"):
            parts.append(f"AI analysis: {s['rationale']}")
        if s.get("key_signals"):
            signals = s["key_signals"]
            if isinstance(signals, list):
                parts.append(f"Key signals: {', '.join(signals)}")

    return "\n".join(parts)


async def embed_text(text: str) -> list[float]:
    """
    Generate a 1536-dim pseudo-embedding using Claude's structured analysis.
    Produces a 48-dim semantic vector then expands deterministically to 1536.
    """
    prompt = f"""Analyze this SME acquisition target and score it on exactly 48 semantic dimensions, each from 0.0 to 1.0.

Target:
{text}

Return ONLY a JSON array of exactly 48 floats, no other text:
[
  <industry_maturity 0-1>,
  <market_fragmentation 0-1>,
  <owner_succession_urgency 0-1>,
  <company_age_normalized 0-1>,
  <revenue_size_normalized 0-1>,
  <employee_efficiency 0-1>,
  <geographic_accessibility 0-1>,
  <sector_cyclicality 0-1>,
  <consolidation_potential 0-1>,
  <technology_intensity 0-1>,
  <capital_intensity 0-1>,
  <recurring_revenue_likelihood 0-1>,
  <customer_concentration_risk 0-1>,
  <regulatory_complexity 0-1>,
  <skilled_labor_dependency 0-1>,
  <ebitda_margin_estimate 0-1>,
  <growth_trajectory 0-1>,
  <competitive_moat 0-1>,
  <brand_strength 0-1>,
  <operational_complexity 0-1>,
  <supply_chain_integration 0-1>,
  <digital_transformation_stage 0-1>,
  <family_business_indicator 0-1>,
  <northern_europe_indicator 0-1>,
  <southern_europe_indicator 0-1>,
  <eastern_europe_indicator 0-1>,
  <western_europe_indicator 0-1>,
  <manufacturing_sector 0-1>,
  <services_sector 0-1>,
  <logistics_sector 0-1>,
  <construction_sector 0-1>,
  <engineering_sector 0-1>,
  <acquisition_readiness 0-1>,
  <integration_complexity 0-1>,
  <synergy_potential 0-1>,
  <roll_up_fit 0-1>,
  <financial_health_signal 0-1>,
  <management_depth 0-1>,
  <customer_diversity 0-1>,
  <asset_light_model 0-1>,
  <valuation_multiple_estimate 0-1>,
  <urgency_score 0-1>,
  <upside_potential 0-1>,
  <downside_risk 0-1>,
  <strategic_fit_b2b 0-1>,
  <niche_market_indicator 0-1>,
  <local_market_dominance 0-1>,
  <esg_profile 0-1>
]"""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = msg.content[0].text.strip()
    raw = raw.replace("```json", "").replace("```", "").strip()

    base_vector = json.loads(raw)
    if len(base_vector) != 48:
        raise ValueError(f"Expected 48 dims, got {len(base_vector)}")

    # Expand to 1536 dims using deterministic repetition + hash perturbation
    expanded = []
    text_hash = hashlib.md5(text.encode()).hexdigest()

    for i in range(1536):
        base_val = float(base_vector[i % 48])
        hash_byte = int(text_hash[i % 32], 16) / 255.0
        perturb = (hash_byte - 0.5) * 0.01
        expanded.append(round(max(0.0, min(1.0, base_val + perturb)), 6))

    return expanded


async def embed_target(target_id: str, tenant_id: str) -> bool:
    """Generate and store embedding for a single target. Returns True if successful."""
    result = supabase.table("targets").select(
        "*, target_scores(rationale, key_signals)"
    ).eq("id", target_id).single().execute()

    if not result.data:
        return False

    target = result.data
    text = build_target_text(target)

    try:
        embedding = await embed_text(text)
        supabase.table("targets").update({
            "embedding": embedding
        }).eq("id", target_id).execute()
        logger.info(f"Embedded target: {target.get('name')}")
        return True
    except Exception as e:
        logger.error(f"Embedding failed for {target_id}: {e}")
        return False


async def embed_all_targets(tenant_id: str) -> dict:
    """Embed all targets that don't have embeddings yet."""
    result = supabase.table("targets").select(
        "id, name"
    ).eq("tenant_id", tenant_id).is_("deleted_at", "null").is_("embedding", "null").execute()

    targets = result.data or []
    success = 0
    failed = 0

    for t in targets:
        ok = await embed_target(t["id"], tenant_id)
        if ok:
            success += 1
        else:
            failed += 1

    return {"total": len(targets), "success": success, "failed": failed}
