"""
Enrichment orchestrator.
Runs all providers in sequence, records per-provider results,
merges enriched data, and updates the target.
"""
import json
from datetime import datetime, timezone
from typing import Optional
from supabase import Client
from .gleif import GLEIFProvider

_FIELD_MAP = {
    "lei_code": "lei_code",
    "legal_form": "legal_form",
    "registration_number": "registration_number",
    "registration_authority": "registration_authority",
    "directors": "directors",
    "director_roles": "director_roles",
    "founded_year": "founded_year",
    "share_capital": "share_capital",
    "parent_company": "parent_company",
    "ultimate_parent": "ultimate_parent",
}

MINIMUM_CONFIDENCE = 0.4

PROVIDERS = [
    GLEIFProvider(),   # Corporate hierarchy: LEI code, parent companies, legal form
    # Future: OffeneRegisterProvider(), TEDProvider()
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _jsonable(obj) -> dict:
    return json.loads(json.dumps(obj, default=str))


async def run_enrichment(
    target: dict,
    tenant_id: str,
    db: Client,
    providers: Optional[list] = None,
) -> dict:
    """
    Run the enrichment pipeline for a single target.
    Returns the completed enrichment_jobs record.
    """
    active_providers = providers if providers is not None else PROVIDERS

    job_res = db.table("enrichment_jobs").insert({
        "tenant_id": tenant_id,
        "target_id": target["id"],
        "status": "running",
        "data_before": _jsonable(target),
        "started_at": _now(),
    }).execute()
    job_id = job_res.data[0]["id"]

    all_enriched: dict = {}
    providers_completed: list = []
    providers_failed: list = []

    for provider in active_providers:
        src_res = db.table("enrichment_sources").insert({
            "job_id": job_id,
            "provider": provider.name,
            "status": "running",
            "started_at": _now(),
        }).execute()
        source_id = src_res.data[0]["id"]

        try:
            search_result = await provider.search(target)

            if not search_result:
                db.table("enrichment_sources").update({
                    "status": "skipped",
                    "error_message": "No matching company found",
                    "completed_at": _now(),
                }).eq("id", source_id).execute()
                continue

            confidence = await provider.confidence_score(target, search_result)

            if confidence < MINIMUM_CONFIDENCE:
                db.table("enrichment_sources").update({
                    "status": "skipped",
                    "confidence": confidence,
                    "error_message": f"Confidence {confidence:.2f} below threshold {MINIMUM_CONFIDENCE}",
                    "raw_response": _jsonable(search_result),
                    "completed_at": _now(),
                }).eq("id", source_id).execute()
                continue

            enriched_data = await provider.enrich(target, search_result)

            db.table("enrichment_sources").update({
                "status": "completed",
                "confidence": confidence,
                "raw_response": _jsonable(search_result),
                "extracted_data": _jsonable(enriched_data),
                "completed_at": _now(),
            }).eq("id", source_id).execute()

            # First provider wins for conflicting fields
            for key, value in enriched_data.items():
                if key not in all_enriched and value is not None:
                    all_enriched[key] = value

            providers_completed.append(provider.name)

        except Exception as e:
            db.table("enrichment_sources").update({
                "status": "failed",
                "error_message": str(e),
                "completed_at": _now(),
            }).eq("id", source_id).execute()
            providers_failed.append(provider.name)

    # Build target update
    target_update: dict = {}
    for enriched_key, target_col in _FIELD_MAP.items():
        if enriched_key in all_enriched:
            target_update[target_col] = all_enriched[enriched_key]

    has_data = bool(providers_completed)
    if has_data:
        target_update["enrichment_status"] = "enriched"
    elif providers_failed:
        target_update["enrichment_status"] = "failed"
    else:
        target_update["enrichment_status"] = "none"

    target_update["last_enriched_at"] = _now()
    target_update["enrichment_data"] = _jsonable(all_enriched)

    existing_sources: list = target.get("data_sources") or []
    target_update["data_sources"] = list(set(existing_sources + providers_completed))

    db.table("targets").update(target_update).eq("id", target["id"]).execute()

    job_status = "completed" if has_data else ("failed" if providers_failed else "partial")
    db.table("enrichment_jobs").update({
        "status": job_status,
        "providers_completed": providers_completed,
        "providers_failed": providers_failed,
        "data_enriched": _jsonable(all_enriched),
        "completed_at": _now(),
    }).eq("id", job_id).execute()

    return db.table("enrichment_jobs").select("*").eq("id", job_id).single().execute().data
