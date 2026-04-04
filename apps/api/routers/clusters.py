from fastapi import APIRouter, Depends, BackgroundTasks
from dependencies import get_db, get_tenant_id
from services.clustering_service import build_clusters
from supabase import Client

router = APIRouter()
_cluster_status = {"running": False, "done": False, "count": 0}

@router.get("/status")
def cluster_status():
    return _cluster_status

@router.get("/")
async def list_clusters(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    result = db.table("clusters").select(
        "*, cluster_members(target_id, targets(id, name, country, city, industry_label, target_scores(overall_score)))"
    ).eq("tenant_id", tenant_id).order("member_count", desc=True).execute()
    return {"data": result.data or []}

@router.post("/refresh")
async def refresh_clusters(
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id)
):
    if _cluster_status["running"]:
        return {"message": "Clustering already running"}
    _cluster_status.update({"running": True, "done": False, "count": 0})

    async def run():
        clusters = await build_clusters(tenant_id)
        _cluster_status.update({"running": False, "done": True, "count": len(clusters)})

    background_tasks.add_task(run)
    return {"message": "Clustering started"}
