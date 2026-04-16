"""
GLEIF LEI enrichment provider.
Free API, no authentication required.
API docs: https://documenter.getpostman.com/view/7679680/SVYrs-a1
Base URL: https://api.gleif.org/api/v1
Covers: LEI code, legal form, registered address, parent/ultimate parent hierarchy.
"""
import re
import httpx
from difflib import SequenceMatcher
from typing import Optional
from .base import EnrichmentProvider

GLEIF_API = "https://api.gleif.org/api/v1"

_COUNTRY_CODES = {
    "germany": "DE", "deutschland": "DE",
    "italy": "IT", "italia": "IT",
    "france": "FR",
    "spain": "ES", "españa": "ES",
    "poland": "PL", "polska": "PL",
    "austria": "AT", "österreich": "AT",
    "switzerland": "CH", "schweiz": "CH",
    "netherlands": "NL",
    "belgium": "BE",
    "portugal": "PT",
    "uk": "GB", "united kingdom": "GB",
    "czech republic": "CZ", "czechia": "CZ",
    "sweden": "SE",
    "denmark": "DK",
    "norway": "NO",
    "finland": "FI",
    "hungary": "HU",
    "romania": "RO",
    "slovakia": "SK",
    "slovenia": "SI",
    "croatia": "HR",
    "serbia": "RS",
    "bulgaria": "BG",
    "greece": "GR",
    "turkey": "TR",
    "usa": "US", "united states": "US",
}

_LEGAL_FORM_PATTERNS = [
    # Order matters — match longer forms first
    r"\bGmbH\s*&\s*Co\.\s*KGaA\b",
    r"\bGmbH\s*&\s*Co\.\s*KG\b",
    r"\bGmbH\s*&\s*Co\b",
    r"\bKGaA\b",
    r"\bGmbH\b",
    r"\bAktiengesellschaft\b",
    r"\bAG\b",
    r"\bKG\b",
    r"\bOHG\b",
    r"\bSE\b",
    r"\bPartG\b",
    r"\bGbR\b",
    r"\bUG\b",
    r"\bStiftung\b",
    r"\bVerein\b",
    r"\be\.V\.\b",
    r"\bSAS\b",
    r"\bSARL\b",
    r"\bSA\b",
    r"\bSRL\b",
    r"\bS\.p\.A\.\b",
    r"\bSpA\b",
    r"\bBV\b",
    r"\bNV\b",
    r"\bLtd\b",
    r"\bPLC\b",
    r"\bLLC\b",
    r"\bInc\b",
    r"\bCorp\b",
]

_LEGAL_FORM_RE = re.compile("|".join(_LEGAL_FORM_PATTERNS), re.IGNORECASE)


def _extract_legal_form(name: str) -> Optional[str]:
    """Extract legal form suffix from company name."""
    match = _LEGAL_FORM_RE.search(name)
    if match:
        # Normalise: replace whitespace variants
        raw = match.group(0).strip()
        return re.sub(r"\s+", " ", raw)
    return None


class GLEIFProvider(EnrichmentProvider):
    name = "gleif"

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=20.0,
            headers={"Accept": "application/vnd.api+json"},
        )

    async def search(self, target: dict) -> Optional[dict]:
        name = (target.get("name") or "").strip()
        if not name:
            return None

        country_code = self._country_to_code(target.get("country", ""))

        # Attempt 1: filter by exact legal name + country
        params: dict = {
            "filter[entity.legalName]": name,
            "page[size]": 5,
        }
        if country_code:
            params["filter[entity.legalAddress.country]"] = country_code

        try:
            resp = await self.client.get(f"{GLEIF_API}/lei-records", params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise Exception(f"GLEIF search failed: {e}")

        records = data.get("data", [])

        # Attempt 2: fulltext if exact search returned nothing
        if not records:
            ft_params: dict = {
                "filter[fulltext]": name,
                "page[size]": 5,
            }
            if country_code:
                ft_params["filter[entity.legalAddress.country]"] = country_code
            try:
                resp2 = await self.client.get(f"{GLEIF_API}/lei-records", params=ft_params)
                resp2.raise_for_status()
                data2 = resp2.json()
                records = data2.get("data", [])
            except Exception:
                pass

        if not records:
            return None

        target_name_lower = name.lower()
        best_match: Optional[dict] = None
        best_score = 0.0

        for rec in records:
            attrs = rec.get("attributes", {})
            entity = attrs.get("entity", {})
            record_name = entity.get("legalName", {}).get("name", "")
            similarity = SequenceMatcher(None, target_name_lower, record_name.lower()).ratio()
            if similarity > best_score:
                best_score = similarity
                best_match = rec

        if best_match and best_score >= 0.5:
            best_match["_match_score"] = best_score
            return best_match

        return None

    async def enrich(self, target: dict, search_result: dict) -> dict:
        attrs = search_result.get("attributes", {})
        entity = attrs.get("entity", {})
        lei = attrs.get("lei", "")

        legal_name = entity.get("legalName", {}).get("name", "")
        legal_address = entity.get("legalAddress", {}) or {}
        hq_address = entity.get("headquartersAddress", {}) or {}

        def _format_address(addr: dict) -> Optional[str]:
            parts = []
            lines = [l for l in (addr.get("addressLines") or []) if l and l.lower() not in ("n.a", "n.a.")]
            parts.extend(lines)
            if addr.get("city"):
                parts.append(addr["city"])
            if addr.get("postalCode"):
                parts.append(addr["postalCode"])
            if addr.get("country"):
                parts.append(addr["country"])
            return ", ".join(parts) if parts else None

        enriched: dict = {
            "lei_code": lei or None,
            "registration_number": entity.get("registeredAs") or None,
            "legal_form": _extract_legal_form(legal_name),
            "entity_status": entity.get("status") or None,
            "legal_jurisdiction": entity.get("jurisdiction") or None,
            "founded_year": self._extract_year(entity.get("creationDate")),
        }

        reg_address = _format_address(legal_address)
        if reg_address:
            enriched["registered_address"] = reg_address

        hq = _format_address(hq_address)
        if hq and hq != reg_address:
            enriched["headquarters_address"] = hq

        # Fetch parent hierarchy
        if lei:
            parent_name, parent_lei = await self._fetch_parent(lei, "direct-parent")
            if parent_name:
                enriched["parent_company"] = parent_name
                enriched["corporate_group"] = parent_name

            ultimate_name, ultimate_lei = await self._fetch_parent(lei, "ultimate-parent")
            if ultimate_name and ultimate_name != parent_name:
                enriched["ultimate_parent"] = ultimate_name

        return {k: v for k, v in enriched.items() if v is not None}

    async def confidence_score(self, target: dict, search_result: dict) -> float:
        score = float(search_result.get("_match_score", 0.0))

        attrs = search_result.get("attributes", {})
        entity = attrs.get("entity", {})

        target_country = self._country_to_code(target.get("country", ""))
        result_country = (entity.get("legalAddress") or {}).get("country", "")
        if target_country and result_country and target_country.upper() == result_country.upper():
            score = min(score + 0.15, 1.0)

        result_jurisdiction = entity.get("jurisdiction", "")
        if (
            target_country
            and result_jurisdiction
            and target_country.upper() == result_jurisdiction.upper()
        ):
            score = min(score + 0.05, 1.0)

        target_city = (target.get("city") or "").lower()
        result_city = ((entity.get("legalAddress") or {}).get("city") or "").lower()
        if target_city and result_city and target_city in result_city:
            score = min(score + 0.10, 1.0)

        return round(score, 3)

    async def _fetch_parent(self, lei: str, relationship: str) -> tuple[Optional[str], Optional[str]]:
        """Fetch direct-parent or ultimate-parent. Returns (name, lei) or (None, None)."""
        try:
            resp = await self.client.get(f"{GLEIF_API}/lei-records/{lei}/{relationship}")
            if resp.status_code == 404:
                return None, None
            resp.raise_for_status()
            data = resp.json()
            parent_data = data.get("data")
            if not parent_data:
                return None, None
            parent_attrs = parent_data.get("attributes", {})
            parent_entity = parent_attrs.get("entity", {})
            parent_name = parent_entity.get("legalName", {}).get("name")
            parent_lei = parent_attrs.get("lei")
            return parent_name, parent_lei
        except Exception:
            return None, None

    def _country_to_code(self, country: str) -> str:
        key = (country or "").lower().strip()
        if key in _COUNTRY_CODES:
            return _COUNTRY_CODES[key]
        # If already a 2-letter ISO code, uppercase it
        if len(key) == 2:
            return key.upper()
        return key[:2].upper() if len(key) >= 2 else ""

    def _extract_year(self, date_str: Optional[str]) -> Optional[int]:
        if not date_str:
            return None
        try:
            return int(str(date_str)[:4])
        except (ValueError, IndexError):
            return None
