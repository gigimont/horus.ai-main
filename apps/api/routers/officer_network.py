"""
Officer network endpoints.

POST /officer-network/scan       - Run detection, upsert results
GET  /officer-network/           - All connections for tenant
GET  /officer-network/target/{target_id} - Connections for specific target
"""
from fastapi import APIRouter, Depends
from supabase import Client
from dependencies import get_db, get_tenant_id
from services.officer_network import detect_officer_network

router = APIRouter()


@router.post("/scan")
async def scan_officer_network(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    result = await detect_officer_network(tenant_id, db)

    # Clear old results then insert new
    db.table("officer_network").delete().eq("tenant_id", tenant_id).execute()

    rows = []
    for so in result["shared_officers"]:
        rows.append({
            "tenant_id": tenant_id,
            "officer_name": so["officer_name"],
            "normalized_name": so["normalized_name"],
            "match_type": "exact",
            "target_ids": [t["target_id"] for t in so["targets"]],
            "target_names": [t["target_name"] for t in so["targets"]],
            "roles": [t.get("role", "") for t in so["targets"]],
            "metadata": {"targets": so["targets"]},
        })
    for fc in result["family_name_clusters"]:
        rows.append({
            "tenant_id": tenant_id,
            "officer_name": fc["family_name"],
            "normalized_name": fc["family_name"].lower(),
            "match_type": "family_name",
            "target_ids": [t["target_id"] for t in fc["targets"]],
            "target_names": [t["target_name"] for t in fc["targets"]],
            "roles": [],
            "metadata": {"distinct_officers": fc["distinct_officers"], "targets": fc["targets"]},
        })

    if rows:
        db.table("officer_network").insert(rows).execute()

    return {**result, "rows_stored": len(rows)}


@router.get("/")
async def get_officer_network(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    res = db.table("officer_network").select("*").eq("tenant_id", tenant_id).execute()
    rows = res.data or []
    return {
        "shared_officers": [r for r in rows if r["match_type"] == "exact"],
        "family_name_clusters": [r for r in rows if r["match_type"] == "family_name"],
        "total": len(rows),
    }


@router.get("/target/{target_id}")
async def get_target_officer_network(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Return officer_network rows that include this target_id."""
    res = db.table("officer_network").select("*").eq("tenant_id", tenant_id).execute()
    rows = res.data or []
    # Filter rows where target_id appears in target_ids array
    connected = [r for r in rows if target_id in (r.get("target_ids") or [])]
    return {"connections": connected, "total": len(connected)}
