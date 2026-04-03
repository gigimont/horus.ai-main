from db.supabase import supabase
from services.claude_service import score_target as claude_score

async def score_single_target(target_id: str, tenant_id: str):
    result = supabase.table("targets").select("*").eq("id", target_id).single().execute()
    if not result.data:
        return

    target = result.data
    scores = await claude_score(target)

    # Delete any existing score for this target before inserting a fresh one
    supabase.table("target_scores").delete().eq("target_id", target_id).execute()

    supabase.table("target_scores").insert({
        "target_id": target_id,
        "tenant_id": tenant_id,
        "overall_score": scores["overall_score"],
        "transition_score": scores["transition_score"],
        "value_score": scores["value_score"],
        "market_score": scores["market_score"],
        "financial_score": scores["financial_score"],
        "rationale": scores["rationale"],
        "key_signals": scores["key_signals"],
        "model_version": "v1"
    }).execute()

async def score_all_unscored(target_ids: list[str], tenant_id: str, status: dict):
    for tid in target_ids:
        try:
            await score_single_target(tid, tenant_id)
            status["done"] += 1
        except Exception:
            status["errors"] += 1
    status["running"] = False
