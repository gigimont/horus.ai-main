"""
Enrichment endpoints.

POST /enrichment/enrich/{target_id}         - Enrich single target
POST /enrichment/enrich-batch               - Enrich multiple targets (max 20)
GET  /enrichment/jobs/{target_id}           - Enrichment history for target
GET  /enrichment/stats                      - Tenant-wide enrichment stats
POST /enrichment/enrich-all                 - Enrich all unenriched targets
"""
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from dependencies import get_db, get_tenant_id
from services.enrichment.orchestrator import run_enrichment
from pydantic import BaseModel

router = APIRouter()


class BatchEnrichRequest(BaseModel):
    target_ids: list[str]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _recently_enriched(last_enriched_at: str | None) -> bool:
    """Returns True if enriched within the last 24 hours."""
    if not last_enriched_at:
        return False
    try:
        ts = datetime.fromisoformat(last_enriched_at.replace("Z", "+00:00"))
        return (_now_utc() - ts) < timedelta(hours=24)
    except Exception:
        return False


@router.post("/enrich/{target_id}")
async def enrich_target(
    target_id: str,
    force: bool = False,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Enrich a single target. Returns 409 if enriched within 24h (unless force=true)."""
    result = db.table("targets").select("*").eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Target not found")

    target = result.data

    if not force and _recently_enriched(target.get("last_enriched_at")):
        raise HTTPException(
            status_code=409,
            detail="Recently enriched. Use force=true to re-enrich.",
        )

    job = await run_enrichment(target=target, tenant_id=tenant_id, db=db)
    return job


@router.post("/enrich-batch")
async def enrich_batch(
    body: BatchEnrichRequest,
    force: bool = False,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Enrich up to 20 targets sequentially."""
    if len(body.target_ids) > 20:
        raise HTTPException(status_code=400, detail="Max 20 targets per batch")

    total = len(body.target_ids)
    succeeded = 0
    failed = 0
    skipped = 0
    results = []

    for target_id in body.target_ids:
        res = db.table("targets").select("*").eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
        if not res.data:
            skipped += 1
            continue

        target = res.data

        if not force and _recently_enriched(target.get("last_enriched_at")):
            skipped += 1
            continue

        try:
            job = await run_enrichment(target=target, tenant_id=tenant_id, db=db)
            results.append(job)
            succeeded += 1
        except Exception:
            failed += 1

        await asyncio.sleep(1)

    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }


@router.get("/jobs/{target_id}")
async def get_enrichment_jobs(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Return enrichment job history for a target (most recent first, max 10)."""
    jobs_res = db.table("enrichment_jobs").select(
        "*, enrichment_sources(*)"
    ).eq("target_id", target_id).eq("tenant_id", tenant_id).order(
        "created_at", desc=True
    ).limit(10).execute()

    return {"data": jobs_res.data or []}


@router.get("/stats")
async def get_enrichment_stats(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Tenant-wide enrichment statistics."""
    targets_res = db.table("targets").select(
        "enrichment_status, last_enriched_at, data_sources"
    ).eq("tenant_id", tenant_id).is_("deleted_at", None).execute()

    targets = targets_res.data or []

    total_enriched = sum(1 for t in targets if t.get("enrichment_status") == "enriched")
    total_partial = sum(1 for t in targets if t.get("enrichment_status") == "partial")
    total_failed = sum(1 for t in targets if t.get("enrichment_status") == "failed")
    total_none = sum(1 for t in targets if t.get("enrichment_status") in (None, "none"))

    providers_used: dict[str, int] = {}
    for t in targets:
        for src in (t.get("data_sources") or []):
            providers_used[src] = providers_used.get(src, 0) + 1

    last_enriched_ats = [
        t["last_enriched_at"] for t in targets if t.get("last_enriched_at")
    ]
    last_enrichment_at = max(last_enriched_ats) if last_enriched_ats else None

    return {
        "total_enriched": total_enriched,
        "total_partial": total_partial,
        "total_pending": 0,
        "total_failed": total_failed,
        "total_none": total_none,
        "total_targets": len(targets),
        "providers_used": providers_used,
        "last_enrichment_at": last_enrichment_at,
    }


@router.post("/enrich-all")
async def enrich_all(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """
    Enrich all targets with enrichment_status = 'none' or 'failed'.
    Runs synchronously.
    """
    targets_res = db.table("targets").select("*").eq("tenant_id", tenant_id).is_(
        "deleted_at", None
    ).in_("enrichment_status", ["none", "failed"]).execute()

    null_res = db.table("targets").select("*").eq("tenant_id", tenant_id).is_(
        "deleted_at", None
    ).is_("enrichment_status", None).execute()

    targets = (targets_res.data or []) + (null_res.data or [])

    if not targets:
        return {"total_queued": 0, "succeeded": 0, "failed": 0, "started": True}

    total_queued = len(targets)
    succeeded = 0
    failed = 0

    for target in targets:
        try:
            await run_enrichment(target=target, tenant_id=tenant_id, db=db)
            succeeded += 1
        except Exception:
            failed += 1
        await asyncio.sleep(1)

    return {
        "total_queued": total_queued,
        "succeeded": succeeded,
        "failed": failed,
        "started": True,
    }
