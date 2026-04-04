from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_db, get_tenant_id
from supabase import Client
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

VALID_STAGES = ['watchlist', 'contacted', 'nda', 'loi', 'closed']

class PipelineEntryCreate(BaseModel):
    target_id: str
    stage: str = 'watchlist'
    notes: Optional[str] = None

class PipelineEntryUpdate(BaseModel):
    stage: Optional[str] = None
    notes: Optional[str] = None

@router.get("/")
async def list_pipeline(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    result = db.table("pipeline_entries").select(
        "*, targets(id, name, country, city, industry_label, target_scores(overall_score))"
    ).eq("tenant_id", tenant_id).order("created_at").execute()
    return {"data": result.data or []}

@router.post("/", status_code=201)
async def add_to_pipeline(
    payload: PipelineEntryCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    if payload.stage not in VALID_STAGES:
        raise HTTPException(400, f"Invalid stage. Must be one of: {VALID_STAGES}")
    existing = db.table("pipeline_entries").select("id").eq(
        "target_id", payload.target_id).eq("tenant_id", tenant_id).execute()
    if existing.data:
        raise HTTPException(409, "Target already in pipeline")
    data = payload.model_dump()
    data["tenant_id"] = tenant_id
    result = db.table("pipeline_entries").insert(data).execute()
    return result.data[0]

@router.patch("/{entry_id}")
async def update_pipeline_entry(
    entry_id: str,
    payload: PipelineEntryUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "stage" in data and data["stage"] not in VALID_STAGES:
        raise HTTPException(400, "Invalid stage")
    result = db.table("pipeline_entries").update(data).eq(
        "id", entry_id).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(404, "Entry not found")
    return result.data[0]

@router.delete("/{entry_id}", status_code=204)
async def remove_from_pipeline(
    entry_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    db.table("pipeline_entries").delete().eq(
        "id", entry_id).eq("tenant_id", tenant_id).execute()
    return None
