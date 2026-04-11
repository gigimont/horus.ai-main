# apps/api/routers/rollup.py
from fastapi import APIRouter, Depends, HTTPException, Response
from dependencies import get_db, get_tenant_id
from supabase import Client
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging, io
from services.rollup_service import compute_financials, estimate_ebitda_margin, suggest_sequence, generate_memo
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_CENTER

router = APIRouter()
logger = logging.getLogger(__name__)

TARGET_JOIN = "*, targets(id, name, country, city, industry_label, industry_code, revenue_eur, employee_count, founded_year, owner_age_estimate, target_scores(overall_score, transition_score, value_score, market_score, financial_score, rationale, key_signals))"


class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class TargetAdd(BaseModel):
    target_id: str

class AssumptionUpdate(BaseModel):
    entry_multiple: Optional[float] = None
    ebitda_margin_pct: Optional[float] = None
    ebitda_margin_source: Optional[str] = None
    synergy_pct: Optional[float] = None
    revenue_uplift_pct: Optional[float] = None
    debt_pct: Optional[float] = None
    integration_cost_eur: Optional[int] = None
    hold_period_years: Optional[int] = None
    notes: Optional[str] = None

class ReorderItem(BaseModel):
    target_id: str
    sequence_order: int

class ReorderPayload(BaseModel):
    order: list[ReorderItem]


def _get_scenario(db, scenario_id, tenant_id):
    res = db.table("rollup_scenarios").select(
        f"*, rollup_scenario_targets({TARGET_JOIN})"
    ).eq("id", scenario_id).eq("tenant_id", tenant_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Scenario not found")
    # Sort targets by sequence_order
    if res.data.get("rollup_scenario_targets"):
        res.data["rollup_scenario_targets"].sort(key=lambda t: t.get("sequence_order", 0))
    return res.data


# --- Scenario CRUD ---

@router.get("/")
async def list_scenarios(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    res = db.table("rollup_scenarios").select(
        "*, rollup_scenario_targets(id)"
    ).eq("tenant_id", tenant_id).order("updated_at", desc=True).execute()
    scenarios = res.data or []
    for s in scenarios:
        s["target_count"] = len(s.pop("rollup_scenario_targets", []) or [])
    return {"data": scenarios}


@router.post("/", status_code=201)
async def create_scenario(
    payload: ScenarioCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    res = db.table("rollup_scenarios").insert({
        "tenant_id": tenant_id,
        "name": payload.name,
        "description": payload.description,
        "status": "draft",
    }).execute()
    return res.data[0]


@router.get("/{scenario_id}")
async def get_scenario(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    return _get_scenario(db, scenario_id, tenant_id)


@router.patch("/{scenario_id}")
async def update_scenario(
    scenario_id: str,
    payload: ScenarioUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "No fields to update")
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = db.table("rollup_scenarios").update(data).eq(
        "id", scenario_id).eq("tenant_id", tenant_id).execute()
    if not res.data:
        raise HTTPException(404, "Scenario not found")
    return res.data[0]


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    db.table("rollup_scenarios").delete().eq(
        "id", scenario_id).eq("tenant_id", tenant_id).execute()
    return None


@router.post("/{scenario_id}/duplicate", status_code=201)
async def duplicate_scenario(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    original = _get_scenario(db, scenario_id, tenant_id)
    new_res = db.table("rollup_scenarios").insert({
        "tenant_id": tenant_id,
        "name": f"{original['name']} (copy)",
        "description": original.get("description"),
        "status": "draft",
    }).execute()
    new_id = new_res.data[0]["id"]
    targets = original.get("rollup_scenario_targets") or []
    if targets:
        rows = [{
            "scenario_id": new_id,
            "target_id": t["target_id"],
            "sequence_order": t["sequence_order"],
            "entry_multiple": t["entry_multiple"],
            "ebitda_margin_pct": t["ebitda_margin_pct"],
            "ebitda_margin_source": t["ebitda_margin_source"],
            "synergy_pct": t["synergy_pct"],
            "revenue_uplift_pct": t["revenue_uplift_pct"],
            "debt_pct": t["debt_pct"],
            "integration_cost_eur": t["integration_cost_eur"],
            "hold_period_years": t["hold_period_years"],
        } for t in targets]
        db.table("rollup_scenario_targets").insert(rows).execute()
    return new_res.data[0]


# --- Targets ---

@router.post("/{scenario_id}/targets", status_code=201)
async def add_target(
    scenario_id: str,
    payload: TargetAdd,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    # Verify scenario belongs to tenant
    _get_scenario(db, scenario_id, tenant_id)
    # Get current count for sequence_order
    count_res = db.table("rollup_scenario_targets").select(
        "id", count="exact"
    ).eq("scenario_id", scenario_id).execute()
    seq = count_res.count or 0
    # Insert with defaults
    ins = db.table("rollup_scenario_targets").insert({
        "scenario_id": scenario_id,
        "target_id": payload.target_id,
        "sequence_order": seq,
    }).execute()
    row_id = ins.data[0]["id"]
    # Estimate EBITDA margin via Claude
    try:
        tgt_res = db.table("targets").select(
            "*, target_scores(financial_score, key_signals)"
        ).eq("id", payload.target_id).single().execute()
        if tgt_res.data:
            margin = await estimate_ebitda_margin(tgt_res.data)
            db.table("rollup_scenario_targets").update({
                "ebitda_margin_pct": margin,
                "ebitda_margin_source": "ai",
            }).eq("id", row_id).execute()
    except Exception as e:
        logger.warning(f"EBITDA estimation failed for {payload.target_id}: {e}")
    return _get_scenario(db, scenario_id, tenant_id)


@router.patch("/{scenario_id}/targets/{target_id}")
async def update_target_assumptions(
    scenario_id: str,
    target_id: str,
    payload: AssumptionUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "No fields to update")
    res = db.table("rollup_scenario_targets").update(data).eq(
        "scenario_id", scenario_id).eq("target_id", target_id).execute()
    if not res.data:
        raise HTTPException(404, "Target not in scenario")
    return res.data[0]


@router.delete("/{scenario_id}/targets/{target_id}", status_code=204)
async def remove_target(
    scenario_id: str,
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    db.table("rollup_scenario_targets").delete().eq(
        "scenario_id", scenario_id).eq("target_id", target_id).execute()
    return None


@router.post("/{scenario_id}/reorder")
async def reorder_targets(
    scenario_id: str,
    payload: ReorderPayload,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    for item in payload.order:
        db.table("rollup_scenario_targets").update({
            "sequence_order": item.sequence_order
        }).eq("scenario_id", scenario_id).eq("target_id", item.target_id).execute()
    return {"ok": True}


# --- AI & Financials ---

@router.get("/{scenario_id}/financials")
async def get_financials(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    return compute_financials(targets)


@router.post("/{scenario_id}/estimate-ebitda/{target_id}")
async def estimate_ebitda_endpoint(
    scenario_id: str,
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    tgt_res = db.table("targets").select(
        "*, target_scores(financial_score, key_signals)"
    ).eq("id", target_id).single().execute()
    if not tgt_res.data:
        raise HTTPException(404, "Target not found")
    margin = await estimate_ebitda_margin(tgt_res.data)
    db.table("rollup_scenario_targets").update({
        "ebitda_margin_pct": margin,
        "ebitda_margin_source": "ai",
    }).eq("scenario_id", scenario_id).eq("target_id", target_id).execute()
    return {"ebitda_margin_pct": margin, "ebitda_margin_source": "ai"}


@router.post("/{scenario_id}/sequence")
async def sequence_targets(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    if not targets:
        return {"suggestions": []}
    suggestions = await suggest_sequence(targets)
    return {"suggestions": suggestions}


@router.post("/{scenario_id}/memo")
async def generate_memo_endpoint(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    financials = compute_financials(targets)
    memo_text = await generate_memo(scenario, financials)
    return {"memo": memo_text}


@router.get("/{scenario_id}/memo/pdf")
async def memo_pdf(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    financials = compute_financials(targets)
    memo_text = await generate_memo(scenario, financials)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('t', fontSize=18, fontName='Helvetica-Bold',
        spaceAfter=4, textColor=colors.HexColor('#1e293b'))
    subtitle_style = ParagraphStyle('s', fontSize=11, fontName='Helvetica',
        textColor=colors.HexColor('#64748b'), spaceAfter=16)
    section_style = ParagraphStyle('sec', fontSize=11, fontName='Helvetica-Bold',
        spaceBefore=14, spaceAfter=6, textColor=colors.HexColor('#1e293b'))
    body_style = ParagraphStyle('b', fontSize=10, fontName='Helvetica',
        leading=15, textColor=colors.HexColor('#334155'))
    footer_style = ParagraphStyle('f', fontSize=8, textColor=colors.HexColor('#94a3b8'),
        alignment=TA_CENTER)

    story = []
    story.append(Paragraph(scenario["name"], title_style))
    story.append(Paragraph(f"Roll-up Investment Thesis · {len(targets)} target companies", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 12))

    for line in memo_text.split('\n'):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 4))
        elif any(line.startswith(f"{i}.") for i in range(1, 8)) or line.endswith(':'):
            story.append(Paragraph(line, section_style))
        elif line.startswith('•') or line.startswith('-'):
            story.append(Paragraph(f"• {line.lstrip('•- ')}", body_style))
        else:
            story.append(Paragraph(line, body_style))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Generated by Horus AI · Confidential · For internal use only", footer_style))

    doc.build(story)
    buffer.seek(0)
    filename = f"rollup-memo-{scenario['name'].lower().replace(' ', '-')[:40]}.pdf"
    return Response(
        content=buffer.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
