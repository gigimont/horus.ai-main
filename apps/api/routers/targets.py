from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional
import csv, io
from dependencies import get_db, get_tenant_id
from models.target import TargetCreate, TargetUpdate
from supabase import Client

router = APIRouter()

@router.get("/")
async def list_targets(
    country: Optional[str] = Query(None),
    industry_code: Optional[str] = Query(None),
    score_min: Optional[float] = Query(None),
    score_max: Optional[float] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    query = db.table("targets").select(
        "*, target_scores(overall_score, transition_score, value_score, market_score, financial_score, rationale, key_signals, scored_at)"
    ).eq("tenant_id", tenant_id).is_("deleted_at", "null")

    if country:
        query = query.eq("country", country)
    if industry_code:
        query = query.eq("industry_code", industry_code)
    if search:
        query = query.ilike("name", f"%{search}%")

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    result = query.execute()

    targets = result.data or []

    if score_min is not None or score_max is not None:
        def in_range(t):
            scores = t.get("target_scores") or []
            if not scores:
                return False
            latest = scores[-1]
            s = latest.get("overall_score", 0) or 0
            if score_min is not None and s < score_min:
                return False
            if score_max is not None and s > score_max:
                return False
            return True
        targets = [t for t in targets if in_range(t)]

    return {"data": targets, "count": len(targets), "offset": offset}


@router.post("/", status_code=201)
async def create_target(
    payload: TargetCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = payload.model_dump()
    data["tenant_id"] = tenant_id
    result = db.table("targets").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create target")
    return result.data[0]


@router.get("/{target_id}")
async def get_target(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    result = db.table("targets").select(
        "*, target_scores(*)"
    ).eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Target not found")
    return result.data


@router.patch("/{target_id}")
async def update_target(
    target_id: str,
    payload: TargetUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.table("targets").update(data).eq("id", target_id).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Target not found")
    return result.data[0]


@router.delete("/{target_id}", status_code=204)
async def delete_target(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    db.table("targets").update({"deleted_at": "now()"}).eq("id", target_id).eq("tenant_id", tenant_id).execute()
    return None


@router.post("/bulk", status_code=201)
async def bulk_import(
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    contents = await file.read()
    reader = csv.DictReader(io.StringIO(contents.decode("utf-8")))

    rows = []
    for row in reader:
        entry = {
            "tenant_id": tenant_id,
            "name": row.get("name", "").strip(),
            "country": row.get("country", "").strip() or None,
            "region": row.get("region", "").strip() or None,
            "city": row.get("city", "").strip() or None,
            "industry_label": row.get("industry_label", "").strip() or None,
            "industry_code": row.get("industry_code", "").strip() or None,
            "employee_count": int(row["employee_count"]) if row.get("employee_count", "").strip() else None,
            "revenue_eur": int(row["revenue_eur"]) if row.get("revenue_eur", "").strip() else None,
            "founded_year": int(row["founded_year"]) if row.get("founded_year", "").strip() else None,
            "owner_age_estimate": int(row["owner_age_estimate"]) if row.get("owner_age_estimate", "").strip() else None,
            "website": row.get("website", "").strip() or None,
            "linkedin_url": row.get("linkedin_url", "").strip() or None,
        }
        if entry["name"]:
            rows.append(entry)

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    result = db.table("targets").insert(rows).execute()
    return {"inserted": len(result.data), "targets": result.data}
