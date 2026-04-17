# apps/api/routers/network.py
import json
import logging
from anthropic import Anthropic
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from dependencies import get_db, get_tenant_id
from services.network_service import analyse_network

_anthropic = Anthropic()

router = APIRouter()
logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = """You are an M&A strategist analysing a network graph of acquisition targets within a roll-up strategy.

Given network statistics and target relationship data, provide a strategic interpretation.

Respond ONLY with valid JSON (no markdown fences):
{
  "summary": "2-3 sentence executive summary of what the network reveals about the consolidation opportunity",
  "key_insights": ["insight 1", "insight 2", "insight 3"],
  "recommended_actions": ["action 1", "action 2", "action 3"]
}

Key insights should reference specific company names and edge counts. Focus on:
- Which targets are most connected (and what that means for sequencing)
- What the dominant edge type suggests (supply chain = vertical integration, geographic = regional density, customer_overlap = market consolidation)
- Any isolated targets (weak fit for the roll-up thesis)
- Overall connection density assessment

Recommended actions should be specific and operator-actionable."""


@router.post("/analyse/{scenario_id}", status_code=201)
async def analyse_scenario_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """AI-analyse all target pairs in a scenario and upsert network_edges."""
    scenario_res = (
        db.table("rollup_scenarios")
        .select("id, name")
        .eq("id", scenario_id)
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )
    if not scenario_res.data:
        raise HTTPException(404, "Scenario not found")
    scenario_name = scenario_res.data["name"]

    targets_res = (
        db.table("rollup_scenario_targets")
        .select("targets(id, name, industry_label, city, country, employee_count, revenue_eur)")
        .eq("scenario_id", scenario_id)
        .execute()
    )
    targets = [row["targets"] for row in (targets_res.data or []) if row.get("targets")]

    edges = await analyse_network(targets, scenario_name)

    db.table("network_edges").delete().eq("scenario_id", scenario_id).eq("tenant_id", tenant_id).execute()

    if edges:
        rows = [{"tenant_id": tenant_id, "scenario_id": scenario_id, **edge} for edge in edges]
        db.table("network_edges").insert(rows).execute()

    return {"edges_created": len(edges), "target_count": len(targets)}


@router.get("/{scenario_id}")
async def get_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Return all nodes and edges for a scenario network."""
    targets_res = (
        db.table("rollup_scenario_targets")
        .select(
            "targets(id, name, industry_label, city, country, revenue_eur, "
            "target_scores(overall_score))"
        )
        .eq("scenario_id", scenario_id)
        .execute()
    )
    nodes = [row["targets"] for row in (targets_res.data or []) if row.get("targets")]

    edges_res = (
        db.table("network_edges")
        .select("*")
        .eq("scenario_id", scenario_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    edges = edges_res.data or []

    return {"nodes": nodes, "edges": edges}


@router.get("/{scenario_id}/stats")
async def get_network_stats(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Return network metrics for a scenario."""
    edges_res = (
        db.table("network_edges")
        .select("*")
        .eq("scenario_id", scenario_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    edges = edges_res.data or []

    if not edges:
        return {
            "total_edges": 0,
            "avg_strength": 0.0,
            "edge_type_distribution": {},
            "most_connected": None,
            "isolated_targets": [],
        }

    avg_strength = sum(e["strength"] for e in edges) / len(edges)

    distribution: dict[str, int] = {}
    for e in edges:
        distribution[e["edge_type"]] = distribution.get(e["edge_type"], 0) + 1

    connection_count: dict[str, int] = {}
    for e in edges:
        connection_count[e["source_target_id"]] = connection_count.get(e["source_target_id"], 0) + 1
        connection_count[e["dest_target_id"]] = connection_count.get(e["dest_target_id"], 0) + 1

    most_connected_id = max(connection_count, key=lambda k: connection_count[k])

    target_res = (
        db.table("rollup_scenario_targets")
        .select("targets(id, name)")
        .eq("scenario_id", scenario_id)
        .execute()
    )
    target_name_map = {
        row["targets"]["id"]: row["targets"]["name"]
        for row in (target_res.data or [])
        if row.get("targets")
    }

    connected_ids = set(connection_count.keys())
    all_ids = set(target_name_map.keys())
    isolated = list(all_ids - connected_ids)

    return {
        "total_edges": len(edges),
        "avg_strength": round(avg_strength, 3),
        "edge_type_distribution": distribution,
        "most_connected": {
            "target_id": most_connected_id,
            "name": target_name_map.get(most_connected_id, "Unknown"),
            "edge_count": connection_count[most_connected_id],
        },
        "isolated_targets": isolated,
    }


@router.get("/{scenario_id}/summary")
async def get_network_summary(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """AI-generated strategic interpretation of network topology."""
    edges_res = (
        db.table("network_edges")
        .select("*")
        .eq("scenario_id", scenario_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    edges = edges_res.data or []

    if not edges:
        return {
            "summary": "No connections have been analysed yet. Run the network analysis to generate insights.",
            "key_insights": [],
            "recommended_actions": ["Click 'Analyse network' to discover relationships between targets."],
        }

    # Compute stats
    avg_strength = sum(e["strength"] for e in edges) / len(edges)
    distribution: dict[str, int] = {}
    for e in edges:
        distribution[e["edge_type"]] = distribution.get(e["edge_type"], 0) + 1
    connection_count: dict[str, int] = {}
    for e in edges:
        connection_count[e["source_target_id"]] = connection_count.get(e["source_target_id"], 0) + 1
        connection_count[e["dest_target_id"]] = connection_count.get(e["dest_target_id"], 0) + 1

    # Target names
    target_res = (
        db.table("rollup_scenario_targets")
        .select("targets(id, name)")
        .eq("scenario_id", scenario_id)
        .execute()
    )
    target_name_map = {
        row["targets"]["id"]: row["targets"]["name"]
        for row in (target_res.data or [])
        if row.get("targets")
    }

    # Scenario name
    scenario_res = (
        db.table("rollup_scenarios")
        .select("name")
        .eq("id", scenario_id)
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )
    scenario_name = scenario_res.data["name"] if scenario_res.data else "Unknown"

    connected_ids = set(connection_count.keys())
    all_ids = set(target_name_map.keys())
    isolated_names = [target_name_map[i] for i in (all_ids - connected_ids) if i in target_name_map]

    most_connected_id = max(connection_count, key=lambda k: connection_count[k])
    most_connected_name = target_name_map.get(most_connected_id, "Unknown")

    context = {
        "strategy_name": scenario_name,
        "total_targets": len(all_ids),
        "total_edges": len(edges),
        "avg_strength": round(avg_strength, 2),
        "edge_type_distribution": distribution,
        "most_connected": {"name": most_connected_name, "edges": connection_count[most_connected_id]},
        "isolated_targets": isolated_names,
        "all_target_names": list(target_name_map.values()),
    }

    response = _anthropic.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SUMMARY_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Strategy: {scenario_name}\n\nNetwork data:\n{json.dumps(context, indent=2)}\n\nProvide a strategic interpretation."
        }],
    )
    raw = response.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
    except Exception:
        result = {
            "summary": raw[:500] if raw else "Analysis unavailable.",
            "key_insights": [],
            "recommended_actions": [],
        }

    return result


@router.delete("/{scenario_id}", status_code=204)
async def clear_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Delete all edges for a scenario."""
    db.table("network_edges").delete().eq("scenario_id", scenario_id).eq("tenant_id", tenant_id).execute()
