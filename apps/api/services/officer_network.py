"""
Officer network detection.
Cross-references director names across all targets within a tenant
to find shared directors and family-name clusters.
"""
import unicodedata
import re
from typing import Optional
from supabase import Client

# Common German surnames excluded from family_name clustering (too noisy)
_COMMON_SURNAMES = {
    "schmidt", "fischer", "weber", "meyer", "wagner",
    "becker", "schulz", "hoffmann", "schafer", "schäfer", "koch",
}

def _normalize(name: str) -> str:
    """Lowercase, strip accents, remove honorifics."""
    # Remove honorifics (consume trailing dot and optional whitespace)
    name = re.sub(r'\b(Dr|Prof|Dipl(?:\.?-?(?:Ing|Kfm|Kaufmann))?|Ing|Mag|MBA)\.?\s*', '', name, flags=re.IGNORECASE)
    # NFD decompose then strip combining chars (ü→u etc.)
    nfd = unicodedata.normalize('NFD', name)
    ascii_name = nfd.encode('ascii', 'ignore').decode('ascii')
    return ' '.join(ascii_name.lower().split())

def _last_name(normalized: str) -> str:
    parts = normalized.split()
    return parts[-1] if parts else normalized


async def detect_officer_network(tenant_id: str, db: Client) -> dict:
    """
    Scan all targets with directors and find overlaps.
    Returns structured result with shared_officers, family_name_clusters, stats.
    """
    # Fetch all targets with directors
    res = db.table("targets").select(
        "id, name, directors, director_roles"
    ).eq("tenant_id", tenant_id).is_("deleted_at", None).execute()

    targets_with_directors = [t for t in (res.data or []) if t.get("directors")]

    # Build index: normalized_name → [{target_id, target_name, role}]
    name_index: dict[str, list[dict]] = {}

    for target in targets_with_directors:
        directors = target["directors"] or []
        roles = {r["name"]: r.get("role", "") for r in (target.get("director_roles") or []) if r.get("name")}

        for raw_name in directors:
            if not raw_name or not raw_name.strip():
                continue
            norm = _normalize(raw_name)
            if not norm:
                continue
            if norm not in name_index:
                name_index[norm] = []
            name_index[norm].append({
                "target_id": target["id"],
                "target_name": target["name"],
                "role": roles.get(raw_name, ""),
                "raw_name": raw_name,
            })

    # Find exact matches (same normalized full name in 2+ targets)
    shared_officers = []
    for norm_name, entries in name_index.items():
        if len(entries) < 2:
            continue
        # Deduplicate by target_id (a director might appear twice in same target)
        seen_targets = {}
        for e in entries:
            if e["target_id"] not in seen_targets:
                seen_targets[e["target_id"]] = e
        if len(seen_targets) < 2:
            continue
        # Use the most common raw name spelling
        raw_names = [e["raw_name"] for e in entries]
        officer_name = max(set(raw_names), key=raw_names.count)
        shared_officers.append({
            "officer_name": officer_name,
            "normalized_name": norm_name,
            "targets": [{"target_id": e["target_id"], "target_name": e["target_name"], "role": e["role"]} for e in seen_targets.values()],
            "match_type": "exact",
        })

    # Find family name clusters (same last name, 2+ distinct targets, not common)
    family_index: dict[str, list[dict]] = {}
    for norm_name, entries in name_index.items():
        last = _last_name(norm_name)
        if last in _COMMON_SURNAMES or len(last) < 3:
            continue
        if last not in family_index:
            family_index[last] = []
        family_index[last].extend(entries)

    family_name_clusters = []
    for family_name, entries in family_index.items():
        target_ids = {e["target_id"] for e in entries}
        if len(target_ids) < 2:
            continue
        distinct_officers = list({e["raw_name"] for e in entries})
        seen_targets: dict[str, dict] = {}
        for e in entries:
            if e["target_id"] not in seen_targets:
                seen_targets[e["target_id"]] = {"target_id": e["target_id"], "target_name": e["target_name"]}
        family_name_clusters.append({
            "family_name": family_name.capitalize(),
            "targets": list(seen_targets.values()),
            "distinct_officers": distinct_officers,
        })

    # Count unique directors
    total_unique = len(name_index)

    return {
        "shared_officers": shared_officers,
        "family_name_clusters": family_name_clusters,
        "stats": {
            "total_targets_with_directors": len(targets_with_directors),
            "total_unique_directors": total_unique,
            "shared_officers_found": len(shared_officers),
            "family_clusters_found": len(family_name_clusters),
        },
    }
