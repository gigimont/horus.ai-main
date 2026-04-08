from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from typing import Optional
import csv, io
from dependencies import get_db, get_tenant_id
from models.target import TargetCreate, TargetUpdate
from supabase import Client
from services.scoring_service import score_single_target
from services.geocoding_service import geocode_target, geocode_all_ungeocode

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
        import unicodedata
        def normalize(s: str) -> str:
            return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode('ascii').lower()
        normalized_search = normalize(search)
        query = query.or_(f"name.ilike.%{search}%,name.ilike.%{normalized_search}%")

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
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = payload.model_dump()
    data["tenant_id"] = tenant_id
    result = db.table("targets").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create target")
    created = result.data[0]
    background_tasks.add_task(geocode_target, created, db)
    return created


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
    background_tasks: BackgroundTasks,
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
    background_tasks.add_task(geocode_all_ungeocode, tenant_id, db)
    return {"inserted": len(result.data), "targets": result.data}


@router.post("/geocode/batch")
async def geocode_batch(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    result = await geocode_all_ungeocode(tenant_id, db)
    return result


@router.post("/{target_id}/geocode")
async def geocode_single(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    result = db.table("targets").select(
        "id, name, city, region, country"
    ).eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Target not found")
    ok = await geocode_target(result.data, db)
    if not ok:
        raise HTTPException(status_code=422, detail="Could not geocode target — no recognisable location")
    return {"message": "Geocoded", "target_id": target_id}


@router.post("/{target_id}/score")
async def score_target_route(
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


@router.get("/{target_id}/similar")
async def similar_targets(
    target_id: str,
    limit: int = Query(4, le=10),
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    """Return targets with the most similar score profile using euclidean distance."""
    ref = db.table("target_scores").select("*").eq("target_id", target_id).execute()
    if not ref.data:
        return {"data": []}

    r = ref.data[0]

    all_scores = db.table("target_scores").select(
        "target_id, overall_score, transition_score, value_score, market_score, financial_score"
    ).eq("tenant_id", tenant_id).neq("target_id", target_id).execute()

    if not all_scores.data:
        return {"data": []}

    def distance(s):
        return sum([
            (s.get("transition_score", 0) - (r.get("transition_score") or 0)) ** 2,
            (s.get("value_score", 0)      - (r.get("value_score") or 0)) ** 2,
            (s.get("market_score", 0)     - (r.get("market_score") or 0)) ** 2,
            (s.get("financial_score", 0)  - (r.get("financial_score") or 0)) ** 2,
        ]) ** 0.5

    ranked = sorted(all_scores.data, key=distance)[:limit]
    similar_ids = [s["target_id"] for s in ranked]

    result = db.table("targets").select(
        "*, target_scores(overall_score, transition_score, value_score, market_score, financial_score)"
    ).in_("id", similar_ids).eq("tenant_id", tenant_id).is_("deleted_at", "null").execute()

    return {"data": result.data or []}
