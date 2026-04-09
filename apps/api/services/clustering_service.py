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

    # Pass 1: geo + industry + transition
    buckets: dict[tuple, list] = {}
    for t in targets_res.data:
        key = (
            t.get("country") or "unknown",
            t.get("industry_code") or "unknown",
            transition_bracket(t["id"])
        )
        buckets.setdefault(key, []).append(t)

    multi_buckets = {k: v for k, v in buckets.items() if len(v) >= 2}

    # Pass 2: if fewer than 3 multi-member clusters, fall back to country + industry groupings
    if len(multi_buckets) < 3:
        final_buckets: dict[str, tuple] = {}

        # Country-level — include all (even single-member)
        country_buckets: dict[str, list] = {}
        for t in targets_res.data:
            key = t.get("country") or "unknown"
            country_buckets.setdefault(key, []).append(t)
        for country, members in country_buckets.items():
            final_buckets[f"country_{country}"] = (country, "all", "mixed", members)

        # Industry-level — only 2+ members
        industry_buckets: dict[str, list] = {}
        for t in targets_res.data:
            key = t.get("industry_code") or "unknown"
            industry_buckets.setdefault(key, []).append(t)
        for industry_code, members in industry_buckets.items():
            if len(members) >= 2:
                industry_label = members[0].get("industry_label") or industry_code
                final_buckets[f"industry_{industry_code}"] = (industry_code, industry_label, "mixed", members)
    else:
        final_buckets = {
            f"{k[0]}_{k[1]}_{k[2]}": (k[0], k[1], k[2], v)
            for k, v in multi_buckets.items()
        }

    clusters = []
    for cluster_key, cluster_data in final_buckets.items():
        if len(cluster_data) != 4:
            continue
        country, industry, transition, members = cluster_data
        member_names = [m["name"] for m in members[:5]]
        industry_label = members[0].get("industry_label") or industry

        prompt = f"""You are analysing a cluster of SME acquisition targets for a Search Fund operator.

Cluster profile:
- Country/Region: {country}
- Industry: {industry_label}
- Members ({len(members)}): {', '.join(member_names)}

Write a short cluster label (4-6 words) and a 1-sentence description.
Respond ONLY as JSON: {{"label": "...", "description": "..."}}"""

        try:
            msg = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = msg.content[0].text.strip().replace("```json", "").replace("```", "").strip()
            named = json.loads(raw)
        except Exception:
            named = {
                "label": f"{country} {industry_label}",
                "description": f"Cluster of {len(members)} companies."
            }

        cluster = {
            "tenant_id": tenant_id,
            "label": named["label"],
            "description": named["description"],
            "cluster_type": "geo_industry_transition",
            "member_count": len(members),
            "metadata": {
                "country": country,
                "industry_code": industry,
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
