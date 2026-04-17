# apps/api/services/network_service.py
"""
Network edge discovery service.
Analyses pairwise relationships between targets in a roll-up scenario using Claude.
"""
import itertools
import json
import logging
from anthropic import Anthropic

client = Anthropic()
logger = logging.getLogger(__name__)

NETWORK_SYSTEM_PROMPT = """You are an M&A network analyst specialising in SME supply chain mapping.

Given two SME targets, identify ALL meaningful business relationships between them.
Consider: shared customers/vendors, geographic proximity, industry supply chain position,
complementary capabilities, overlapping markets, and consolidation synergies.

For each relationship found, return:
- edge_type: one of "supply_chain", "geographic", "industry", "customer_overlap", "vendor_overlap"
- strength: 0.0 to 1.0 (how strong/certain this connection is)
- description: 1-2 sentence explanation

If no meaningful relationship exists between a pair, return an empty array for that pair.
Be specific and analytical — do not invent connections not supported by the data.

Respond ONLY with valid JSON. No preamble, no markdown."""


async def analyse_network(targets: list[dict], scenario_name: str) -> list[dict]:
    """
    Analyse all unique target pairs and return edges found.
    Returns list of edge dicts: source_target_id, dest_target_id, edge_type, strength, description.
    """
    if len(targets) < 2:
        return []

    pairs = list(itertools.combinations(targets, 2))
    all_edges: list[dict] = []
    batch_size = 10

    for batch_start in range(0, len(pairs), batch_size):
        batch = pairs[batch_start : batch_start + batch_size]

        pair_descriptions = []
        for idx, (t1, t2) in enumerate(batch):
            pair_descriptions.append({
                "pair_index": idx,
                "target_a": {
                    "id": t1["id"],
                    "name": t1["name"],
                    "industry": t1.get("industry_label") or t1.get("industry", "unknown"),
                    "city": t1.get("city", "unknown"),
                    "country": t1.get("country", "unknown"),
                    "employee_count": t1.get("employee_count"),
                    "revenue_eur": t1.get("revenue_eur"),
                },
                "target_b": {
                    "id": t2["id"],
                    "name": t2["name"],
                    "industry": t2.get("industry_label") or t2.get("industry", "unknown"),
                    "city": t2.get("city", "unknown"),
                    "country": t2.get("country", "unknown"),
                    "employee_count": t2.get("employee_count"),
                    "revenue_eur": t2.get("revenue_eur"),
                },
            })

        user_prompt = (
            f'Strategy: "{scenario_name}"\n\n'
            f"Analyse these target pairs and identify business relationships:\n\n"
            f"{json.dumps(pair_descriptions, indent=2)}\n\n"
            "Return a JSON array with one entry per pair:\n"
            '[{"pair_index": 0, "edges": [{"edge_type": "supply_chain", "strength": 0.7, "description": "..."}]}, ...]\n\n'
            "Include a pair_index entry for every pair, even if edges is empty."
        )

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=NETWORK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw = response.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        if not raw:
            logger.warning("Empty response from Claude for network batch starting at %d", batch_start)
            continue
        try:
            result: list[dict] = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.warning("JSON parse error for network batch: %s\nRaw: %r", e, raw[:500])
            continue

        for item in result:
            pair_idx = item["pair_index"]
            t1, t2 = batch[pair_idx]
            for edge in item.get("edges", []):
                all_edges.append({
                    "source_target_id": t1["id"],
                    "dest_target_id": t2["id"],
                    "edge_type": edge["edge_type"],
                    "strength": float(edge["strength"]),
                    "description": edge.get("description", ""),
                })

    return all_edges
