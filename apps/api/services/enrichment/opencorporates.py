"""
OpenCorporates enrichment provider.
Free tier: 500 req/month, no API key required for basic search.
API: https://api.opencorporates.com/v0.4
"""
import httpx
from difflib import SequenceMatcher
from typing import Optional
from .base import EnrichmentProvider

OPENCORPORATES_API = "https://api.opencorporates.com/v0.4"

_COUNTRY_CODES = {
    "germany": "de", "deutschland": "de",
    "italy": "it", "italia": "it",
    "france": "fr",
    "spain": "es", "españa": "es",
    "poland": "pl", "polska": "pl",
    "austria": "at", "österreich": "at",
    "switzerland": "ch", "schweiz": "ch",
    "netherlands": "nl",
    "belgium": "be",
    "portugal": "pt",
    "uk": "gb", "united kingdom": "gb",
    "czech republic": "cz", "czechia": "cz",
    "sweden": "se",
    "denmark": "dk",
    "norway": "no",
    "finland": "fi",
    "hungary": "hu",
    "romania": "ro",
    "slovakia": "sk",
    "slovenia": "si",
    "croatia": "hr",
    "serbia": "rs",
    "bulgaria": "bg",
    "greece": "gr",
    "turkey": "tr",
}


class OpenCorporatesProvider(EnrichmentProvider):
    name = "opencorporates"

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = api_token
        self.client = httpx.AsyncClient(timeout=15.0)

    async def search(self, target: dict) -> Optional[dict]:
        params: dict = {
            "q": target.get("name", ""),
            "country_code": self._country_to_code(target.get("country", "")),
            "per_page": 5,
        }
        if self.api_token:
            params["api_token"] = self.api_token

        try:
            resp = await self.client.get(
                f"{OPENCORPORATES_API}/companies/search",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise Exception(f"OpenCorporates search failed: {e}")

        companies = data.get("results", {}).get("companies", [])
        if not companies:
            return None

        best_match = None
        best_score = 0.0
        target_name = target.get("name", "").lower()

        for item in companies:
            company = item.get("company", {})
            similarity = SequenceMatcher(
                None,
                target_name,
                company.get("name", "").lower(),
            ).ratio()
            if similarity > best_score:
                best_score = similarity
                best_match = company

        if best_match and best_score >= 0.5:
            best_match["_match_score"] = best_score
            return best_match
        return None

    async def enrich(self, target: dict, search_result: dict) -> dict:
        jurisdiction = search_result.get("jurisdiction_code", "")
        company_number = search_result.get("company_number", "")

        enriched: dict = {
            "legal_form": search_result.get("company_type") or None,
            "registration_number": company_number or None,
            "registration_authority": jurisdiction or None,
            "opencorporates_url": search_result.get("opencorporates_url") or None,
            "founded_year": self._extract_year(search_result.get("incorporation_date")),
        }

        if jurisdiction and company_number:
            officers = await self._fetch_officers(jurisdiction, company_number)
            if officers:
                enriched["directors"] = [o["name"] for o in officers if o.get("name")]
                enriched["director_roles"] = officers

        return {k: v for k, v in enriched.items() if v is not None}

    async def confidence_score(self, target: dict, search_result: dict) -> float:
        score = float(search_result.get("_match_score", 0.0))

        target_country = self._country_to_code(target.get("country", ""))
        result_jurisdiction = search_result.get("jurisdiction_code", "")
        result_country = result_jurisdiction[:2] if result_jurisdiction else ""

        if target_country and result_country and target_country.lower() == result_country.lower():
            score = min(score + 0.15, 1.0)

        target_city = (target.get("city") or "").lower()
        result_address = (search_result.get("registered_address_in_full") or "").lower()
        if target_city and result_address and target_city in result_address:
            score = min(score + 0.10, 1.0)

        return round(score, 3)

    async def _fetch_officers(self, jurisdiction: str, company_number: str) -> list:
        params: dict = {}
        if self.api_token:
            params["api_token"] = self.api_token
        try:
            resp = await self.client.get(
                f"{OPENCORPORATES_API}/companies/{jurisdiction}/{company_number}/officers",
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            officers = []
            for item in data.get("results", {}).get("officers", []):
                officer = item.get("officer", {})
                name = officer.get("name", "").strip()
                if name:
                    officers.append({
                        "name": name,
                        "role": officer.get("position", "director"),
                        "start_date": officer.get("start_date"),
                        "end_date": officer.get("end_date"),
                        "status": "active" if not officer.get("end_date") else "inactive",
                    })
            return officers
        except Exception:
            return []

    def _country_to_code(self, country: str) -> str:
        key = (country or "").lower().strip()
        if key in _COUNTRY_CODES:
            return _COUNTRY_CODES[key]
        return key[:2] if len(key) >= 2 else key

    def _extract_year(self, date_str: Optional[str]) -> Optional[int]:
        if not date_str:
            return None
        try:
            return int(str(date_str)[:4])
        except (ValueError, IndexError):
            return None
