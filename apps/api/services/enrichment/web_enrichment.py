"""
AI Web Enrichment provider.
Fetches company website via Jina Reader (Trafilatura fallback), then sends
content to Claude to extract management, succession, and business intelligence.
"""
import json
from typing import Optional
from anthropic import Anthropic
from .base import EnrichmentProvider
from .web_fetcher import fetch_website_content

WEB_ANALYSIS_PROMPT = """You are an M&A analyst specialising in SME succession and generational transition assessment.

You are given the text content of a company website. Extract ALL available intelligence about:

1. **Management & ownership:** Names of directors, founders, managing directors (Geschäftsführer), board members. Their roles and titles. How long they have held their position. Any mention of founding year or founder's career start (to estimate age).

2. **Succession signals:** Is this a family business? (family name matches company, "Familienunternehmen", generational language). Any mention of "next generation", "Nachfolge", "succession", "transition". Junior family member present? Language suggesting sole key person ("Inhaber", sole proprietor signals).

3. **Business intelligence:** Products and services. Industries and customer segments served. Geographic focus. Approximate employee count. Key customers or suppliers mentioned by name. Certifications, partnerships.

4. **Age estimation logic:** If a founder "started the company in 1985" → likely born ~1955-1960 → age ~65-70. If "30 years of experience" → career start ~1995 → likely born ~1970 → age ~55. State estimate as a range. Be explicit about reasoning.

Return ONLY valid JSON with this exact structure:
{
  "directors": [
    {
      "name": "Hans Müller",
      "role": "Geschäftsführer / Inhaber",
      "tenure_signal": "founded company in 1987",
      "estimated_age_range": "62-67",
      "age_reasoning": "Founded in 1987, likely 25-30 at founding",
      "is_founder": true
    }
  ],
  "succession_signals": {
    "is_family_business": true,
    "family_name_match": true,
    "generational_language": false,
    "next_generation_present": false,
    "sole_key_person": true,
    "succession_risk": "high",
    "succession_notes": "Founder-dependent, no visible successor"
  },
  "business_info": {
    "products_services": ["HVAC installation", "maintenance"],
    "industries_served": ["commercial real estate"],
    "geographic_focus": "regional — Bavaria",
    "employee_estimate": 35,
    "employee_source": "team page shows 35 portraits",
    "key_customers": [],
    "key_suppliers": [],
    "certifications": []
  },
  "raw_signals": {
    "founding_year": 1987,
    "website_language": "de",
    "website_quality": "professional",
    "last_news_date": null
  },
  "confidence": 0.75,
  "confidence_reasoning": "Good management info but limited team detail"
}

succession_risk must be one of: "high", "medium", "low", "unknown".
IMPORTANT: If the company is a family business AND there is no visible next-generation successor on the website, succession_risk should be "high", not "unknown". The absence of succession planning on a family business website is itself a strong signal of high succession risk. Only use "unknown" when you genuinely cannot determine if the company is family-owned.
If a field has no data, use null or empty array. Never invent data — only extract what is actually on the page.
Respond ONLY with valid JSON. No preamble, no markdown fences."""


class WebEnrichmentProvider(EnrichmentProvider):
    name = "web_enrichment"

    def __init__(self):
        self.client = Anthropic()

    async def search(self, target: dict) -> Optional[dict]:
        """
        'Search' = fetch the company website.
        Returns None immediately if no website URL is set on the target.
        """
        url = (target.get("website") or "").strip()
        if not url:
            return None
        return await fetch_website_content(url)

    async def enrich(self, target: dict, search_result: dict) -> dict:
        content = search_result.get("content", "")
        if not content:
            return {}

        context = (
            f"Company: {target.get('name', 'Unknown')}\n"
            f"Industry: {target.get('industry_label') or target.get('industry', 'Unknown')}\n"
            f"Location: {target.get('city', '')}, {target.get('country', '')}\n"
            f"Website: {search_result.get('url', '')}"
        )

        user_prompt = f"""Target company context:
{context}

Website content:
{content}

Extract all management, succession, and business intelligence from this content."""

        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=WEB_ANALYSIS_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            data = json.loads(response.content[0].text)
        except Exception as e:
            raise Exception(f"Claude web analysis failed: {e}")

        enriched: dict = {}

        directors = data.get("directors") or []
        if directors:
            enriched["directors"] = [d["name"] for d in directors if d.get("name")]
            enriched["director_roles"] = directors

        succession = data.get("succession_signals") or {}
        if succession:
            enriched["succession_signals"] = succession
            if succession.get("is_family_business") is not None:
                enriched["is_family_business"] = succession["is_family_business"]
            if succession.get("succession_risk"):
                enriched["succession_risk"] = succession["succession_risk"]

        biz = data.get("business_info") or {}
        if biz.get("employee_estimate"):
            enriched["employee_count"] = biz["employee_estimate"]
        if biz.get("products_services"):
            enriched["products_services"] = biz["products_services"]
        if biz.get("industries_served"):
            enriched["industries_served"] = biz["industries_served"]
        if biz.get("geographic_focus"):
            enriched["geographic_focus"] = biz["geographic_focus"]
        if biz.get("key_customers"):
            enriched["key_customers"] = biz["key_customers"]
        if biz.get("key_suppliers"):
            enriched["key_suppliers"] = biz["key_suppliers"]

        raw = data.get("raw_signals") or {}
        if raw.get("founding_year") and not target.get("founded_year"):
            enriched["founded_year"] = raw["founding_year"]

        founder = next((d for d in directors if d.get("is_founder")), None)
        if founder:
            if founder.get("estimated_age_range"):
                enriched["founder_age_estimate"] = founder["estimated_age_range"]
            if founder.get("age_reasoning"):
                enriched["founder_age_reasoning"] = founder["age_reasoning"]

        enriched["web_analysis"] = data
        enriched["web_content_source"] = search_result.get("source", "unknown")

        return enriched

    async def confidence_score(self, target: dict, search_result: dict) -> float:
        length = search_result.get("content_length", 0)
        if length > 5000:
            return 0.85
        elif length > 2000:
            return 0.70
        elif length > 500:
            return 0.50
        else:
            return 0.30
