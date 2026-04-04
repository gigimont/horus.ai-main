from db.supabase import supabase
from services.claude_service import client
import json

async def build_clusters(tenant_id: str) -> list[dict]:
    targets_res = supabase.table("targets").select(
        "id, name, country, region, industry_label, industry_code, owner_age_estimate"
    ).eq("tenant_id", tenant_id).is_("deleted_at", "null").execute()

    scores_res = supabase.table("target_scores").select(
        "target_id, overall_score, transition_score"
    ).eq("tenant_id", tenant_id).execute()

    if not targets_res.data:
        return []

    score_map = {s["target_id"]: s for s in (scores_res.data or [])}

    def transition_bracket(target_id):
        s = score_map.get(target_id, {})
        ts = s.get("transition_score", 0) or 0
        if ts >= 7: return "high"
        if ts >= 4: return "medium"
        return "low"

    buckets: dict[tuple, list] = {}
    for t in targets_res.data:
        key = (
            t.get("country") or "unknown",
            t.get("industry_code") or "unknown",
            transition_bracket(t["id"])
        )
        buckets.setdefault(key, []).append(t)

    buckets = {k: v for k, v in buckets.items() if len(v) >= 2}

    if not buckets:
        for t in targets_res.data:
            key = (t.get("country") or "unknown", "all", "mixed")
            buckets.setdefault(key, []).append(t)

    clusters = []
    for (country, industry_code, transition), members in buckets.items():
        member_names = [m["name"] for m in members[:5]]
        industry_label = members[0].get("industry_label") or industry_code

        prompt = f"""You are analysing a cluster of SME acquisition targets for a Search Fund operator.

Cluster profile:
- Country: {country}
- Industry: {industry_label} ({industry_code})
- Transition readiness: {transition} (owner succession urgency)
- Members ({len(members)}): {', '.join(member_names)}

Write a short cluster label (4–6 words) and a 1-sentence description of the acquisition opportunity this cluster represents.

Respond ONLY as JSON:
{{"label": "...", "description": "..."}}"""

        try:
            msg = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = msg.content[0].text.strip()
            raw = raw.replace("```json", "").replace("```", "").strip()
            named = json.loads(raw)
        except Exception:
            named = {
                "label": f"{country} {industry_label} ({transition} transition)",
                "description": f"Cluster of {len(members)} {industry_label} businesses in {country}."
            }

        cluster = {
            "tenant_id": tenant_id,
            "label": named["label"],
            "description": named["description"],
            "cluster_type": "geo_industry_transition",
            "member_count": len(members),
            "metadata": {
                "country": country,
                "industry_code": industry_code,
                "industry_label": industry_label,
                "transition_bracket": transition,
                "member_ids": [m["id"] for m in members]
            }
        }
        clusters.append((cluster, members))

    supabase.table("clusters").delete().eq("tenant_id", tenant_id).execute()

    result = []
    for cluster_data, members in clusters:
        ins = supabase.table("clusters").insert(cluster_data).execute()
        cluster_id = ins.data[0]["id"]
        memberships = [{"cluster_id": cluster_id, "target_id": m["id"], "distance": 0.0} for m in members]
        supabase.table("cluster_members").insert(memberships).execute()
        result.append({**ins.data[0], "members": members})

    return result
