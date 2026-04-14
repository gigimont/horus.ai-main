# apps/api/routers/network.py
import logging
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from dependencies import get_db, get_tenant_id
from services.network_service import analyse_network

router = APIRouter()
logger = logging.getLogger(__name__)


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
        .select("targets(id, name, industry_label, city, country, description, employee_count, revenue_eur)")
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


@router.delete("/{scenario_id}", status_code=204)
async def clear_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Delete all edges for a scenario."""
    db.table("network_edges").delete().eq("scenario_id", scenario_id).eq("tenant_id", tenant_id).execute()
