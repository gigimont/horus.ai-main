# apps/api/routers/scenarios.py
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_db, get_tenant_id
from supabase import Client
from pydantic import BaseModel
from typing import Optional
import logging
from services.scenario_service import run_scenario

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_TYPES = {"macro_shock", "industry_shift", "succession_trigger"}


class ScenarioRunRequest(BaseModel):
    target_id: str
    scenario_type: str
    severity: int
    description: str
    rollup_scenario_id: Optional[str] = None


@router.post("/run", status_code=201)
async def run_scenario_endpoint(
    body: ScenarioRunRequest,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    if body.scenario_type not in VALID_TYPES:
        raise HTTPException(400, f"scenario_type must be one of {sorted(VALID_TYPES)}")
    if not 1 <= body.severity <= 10:
        raise HTTPException(400, "severity must be between 1 and 10")

    target_res = db.table("targets").select(
        "*, target_scores(overall_score, transition_score, value_score, market_score, financial_score, scored_at)"
    ).eq("id", body.target_id).eq("tenant_id", tenant_id).single().execute()
    if not target_res.data:
        raise HTTPException(404, "Target not found")
    target = target_res.data

    result = await run_scenario(target, body.scenario_type, body.severity, body.description)

    scores = (target.get("target_scores") or [{}])[0]
    score_before = {
        "overall_score":    scores.get("overall_score"),
        "transition_score": scores.get("transition_score"),
        "value_score":      scores.get("value_score"),
        "market_score":     scores.get("market_score"),
        "financial_score":  scores.get("financial_score"),
        "scored_at":        scores.get("scored_at"),
    }

    record = {
        "tenant_id":                tenant_id,
        "target_id":                body.target_id,
        "rollup_scenario_id":       body.rollup_scenario_id,
        "scenario_type":            body.scenario_type,
        "severity":                 body.severity,
        "description":              body.description,
        "score_before":             score_before,
        "score_deltas":             result["score_deltas"],
        "implications":             result["implications"],
        "acquisition_window_effect": result["acquisition_window_effect"],
        "model_version":            "v1",
    }

    save_res = db.table("scenario_results").insert(record).execute()
    if not save_res.data:
        raise HTTPException(500, "Failed to save scenario result")

    logger.info(f"Scenario {body.scenario_type} run for target {body.target_id}")
    return save_res.data[0]


@router.get("/target/{target_id}")
async def list_scenario_results(
    target_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    res = db.table("scenario_results").select("*").eq(
        "target_id", target_id
    ).eq("tenant_id", tenant_id).order("run_at", desc=True).limit(20).execute()
    return {"data": res.data or []}


@router.delete("/{result_id}", status_code=204)
async def delete_scenario_result(
    result_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    db.table("scenario_results").delete().eq(
        "id", result_id
    ).eq("tenant_id", tenant_id).execute()
