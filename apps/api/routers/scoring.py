from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from dependencies import get_db, get_tenant_id
from services.scoring_service import score_single_target, score_all_unscored
from supabase import Client

router = APIRouter()

_job_status: dict = {"running": False, "total": 0, "done": 0, "errors": 0}

@router.get("/status")
async def scoring_status():
    return _job_status

@router.post("/batch")
async def batch_score(
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    if _job_status["running"]:
        raise HTTPException(status_code=409, detail="A scoring job is already running")

    scored_ids = db.table("target_scores").select("target_id").eq("tenant_id", tenant_id).execute()
    scored = {r["target_id"] for r in (scored_ids.data or [])}
    all_targets = db.table("targets").select("id").eq("tenant_id", tenant_id).is_("deleted_at", "null").execute()
    unscored = [t["id"] for t in (all_targets.data or []) if t["id"] not in scored]

    if not unscored:
        return {"message": "All targets already scored", "count": 0}

    _job_status.update({"running": True, "total": len(unscored), "done": 0, "errors": 0})
    background_tasks.add_task(score_all_unscored, unscored, tenant_id, _job_status)
    return {"message": "Batch scoring started", "total": len(unscored)}

@router.post("/{target_id}")
async def score_target(
    target_id: str,
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    result = db.table("targets").select("id").eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Target not found")
    background_tasks.add_task(score_single_target, target_id, tenant_id)
    return {"message": "Scoring started", "target_id": target_id}
