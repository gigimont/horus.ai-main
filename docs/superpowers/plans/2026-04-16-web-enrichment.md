# AI Web Enrichment — Succession Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI web enrichment provider that fetches company websites via Jina Reader (Trafilatura fallback) and sends the content to Claude to extract structured succession intelligence (management team, family business signals, founder age estimates, succession risk).

**Architecture:** New `WebEnrichmentProvider` plugs into the existing enrichment orchestrator (same base class as GLEIFProvider). Jina Reader fetches clean markdown from any URL for free. Claude extracts structured JSON. Results stored in 11 new target columns. Frontend enrichment panel gains Succession Assessment, Management Team, and Business Profile sections. Discovery table gains Succession Risk + Family Business columns.

**Tech Stack:** Python (httpx, trafilatura, anthropic), FastAPI, Supabase, Next.js 16, shadcn/ui, Lucide icons.

---

## Pre-conditions (verified before writing this plan)

- `website` column exists on `targets` table (not `website_url` — use `website` everywhere)
- `employee_count`, `founded_year` already in DB + TS types — no new columns for these
- Jina Reader (`https://r.jina.ai/`) — ✅ works, returns clean markdown, free, no auth
- Existing batch enrichment has `asyncio.sleep(1)` — bump to `3` for web enrichment
- `PATCH /targets/{target_id}` + `TargetUpdate` model already exist — website field already in model
- `targets.update()` method missing from `apps/web/lib/api/client.ts` — must add it
- Claude model: `claude-sonnet-4-20250514` (per CLAUDE.md)

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/services/enrichment/web_fetcher.py` | Jina + Trafilatura fetching logic |
| Create | `apps/api/services/enrichment/web_enrichment.py` | Claude extraction provider |
| Create | `supabase/migrations/015_web_enrichment_columns.sql` | 11 new target columns |
| Modify | `apps/api/services/enrichment/orchestrator.py` | Add WebEnrichmentProvider + field map |
| Modify | `apps/api/services/claude_service.py` | Include enriched fields in scoring |
| Modify | `apps/api/routers/enrichment.py` | Bump batch delay 1s → 3s |
| Modify | `apps/api/requirements.txt` | Add trafilatura |
| Modify | `apps/web/lib/api/client.ts` | Add new Target fields + `targets.update()` |
| Modify | `apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx` | Succession + Management + Business + inline URL input |
| Modify | `apps/web/app/(dashboard)/discovery/components/TargetTable.tsx` | Succession Risk + Family Business columns |
| Modify | `apps/api/tests/test_enrichment.py` | Add WebEnrichmentProvider unit tests |

---

## Task 1: Web Content Fetcher

**Files:**
- Create: `apps/api/services/enrichment/web_fetcher.py`
- Modify: `apps/api/requirements.txt`

- [ ] **Step 1: Add trafilatura to requirements.txt**

Append to `apps/api/requirements.txt`:
```
trafilatura==1.12.2
```

- [ ] **Step 2: Install trafilatura in venv**

```bash
cd apps/api && source .venv/bin/activate && pip install trafilatura==1.12.2
```

Expected: `Successfully installed trafilatura-1.12.2`

- [ ] **Step 3: Write the failing tests**

In `apps/api/tests/test_web_fetcher.py` (create new file):
```python
"""Tests for web content fetcher."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_fetch_normalizes_url_without_scheme():
    """URLs without http:// should have https:// prepended."""
    from services.enrichment.web_fetcher import fetch_website_content
    with patch('services.enrichment.web_fetcher._fetch_jina', new_callable=AsyncMock) as mock_jina:
        mock_jina.return_value = "x" * 200
        result = await fetch_website_content("example.com")
    assert result is not None
    assert result["url"] == "https://example.com"


@pytest.mark.asyncio
async def test_fetch_returns_jina_when_successful():
    """When Jina returns >100 chars, use it as primary source."""
    from services.enrichment.web_fetcher import fetch_website_content
    long_content = "A" * 300
    with patch('services.enrichment.web_fetcher._fetch_jina', new_callable=AsyncMock) as mock_jina, \
         patch('services.enrichment.web_fetcher._fetch_trafilatura', new_callable=AsyncMock) as mock_traf:
        mock_jina.return_value = long_content
        result = await fetch_website_content("https://example.com")
    assert result is not None
    assert result["source"] == "jina"
    mock_traf.assert_not_called()


@pytest.mark.asyncio
async def test_fetch_falls_back_to_trafilatura():
    """When Jina returns short content, fall back to Trafilatura."""
    from services.enrichment.web_fetcher import fetch_website_content
    with patch('services.enrichment.web_fetcher._fetch_jina', new_callable=AsyncMock) as mock_jina, \
         patch('services.enrichment.web_fetcher._fetch_trafilatura', new_callable=AsyncMock) as mock_traf:
        mock_jina.return_value = "too short"  # < 100 chars
        mock_traf.return_value = "B" * 300
        result = await fetch_website_content("https://example.com")
    assert result is not None
    assert result["source"] == "trafilatura"


@pytest.mark.asyncio
async def test_fetch_returns_none_when_both_fail():
    """When both Jina and Trafilatura fail, return None."""
    from services.enrichment.web_fetcher import fetch_website_content
    with patch('services.enrichment.web_fetcher._fetch_jina', new_callable=AsyncMock) as mock_jina, \
         patch('services.enrichment.web_fetcher._fetch_trafilatura', new_callable=AsyncMock) as mock_traf:
        mock_jina.return_value = None
        mock_traf.return_value = None
        result = await fetch_website_content("https://example.com")
    assert result is None


@pytest.mark.asyncio
async def test_fetch_truncates_to_max_length():
    """Content longer than MAX_CONTENT_LENGTH should be truncated."""
    from services.enrichment.web_fetcher import fetch_website_content, MAX_CONTENT_LENGTH
    with patch('services.enrichment.web_fetcher._fetch_jina', new_callable=AsyncMock) as mock_jina:
        mock_jina.return_value = "X" * (MAX_CONTENT_LENGTH + 5000)
        result = await fetch_website_content("https://example.com")
    assert result is not None
    assert len(result["content"]) == MAX_CONTENT_LENGTH
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_web_fetcher.py -v 2>&1 | head -20
```
Expected: ImportError or ModuleNotFoundError (file doesn't exist yet).

- [ ] **Step 5: Create `apps/api/services/enrichment/web_fetcher.py`**

```python
"""
Web content fetcher.
Primary: Jina Reader API (free, no auth, returns LLM-ready markdown)
Fallback: Trafilatura (local extraction, no API dependency)
"""
import httpx
from typing import Optional

JINA_PREFIX = "https://r.jina.ai/"
USER_AGENT = "HorusAI/1.0 (SearchFund enrichment pipeline)"
MAX_CONTENT_LENGTH = 15_000  # characters — avoids token waste while retaining useful content


async def fetch_website_content(url: str) -> Optional[dict]:
    """
    Fetch and clean website content.
    Returns dict with keys: content, source, url, content_length.
    Returns None if both methods fail or content is too thin.
    """
    if not url.startswith("http"):
        url = "https://" + url

    content = await _fetch_jina(url)
    if content and len(content.strip()) > 100:
        return {
            "content": content[:MAX_CONTENT_LENGTH],
            "source": "jina",
            "url": url,
            "content_length": len(content),
        }

    content = await _fetch_trafilatura(url)
    if content and len(content.strip()) > 100:
        return {
            "content": content[:MAX_CONTENT_LENGTH],
            "source": "trafilatura",
            "url": url,
            "content_length": len(content),
        }

    return None


async def _fetch_jina(url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{JINA_PREFIX}{url}",
                headers={"User-Agent": USER_AGENT, "Accept": "text/plain"},
                follow_redirects=True,
            )
            resp.raise_for_status()
            return resp.text
    except Exception:
        return None


async def _fetch_trafilatura(url: str) -> Optional[str]:
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return None
        return trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=True,
            favor_recall=True,
        )
    except Exception:
        return None
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_web_fetcher.py -v
```
Expected: `5 passed`

- [ ] **Step 7: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/api/services/enrichment/web_fetcher.py apps/api/tests/test_web_fetcher.py apps/api/requirements.txt
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: web content fetcher with Jina Reader + Trafilatura fallback") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 2: Web Enrichment Provider

**Files:**
- Create: `apps/api/services/enrichment/web_enrichment.py`
- Modify: `apps/api/tests/test_enrichment.py` (add new tests)

- [ ] **Step 1: Write failing tests**

Append to `apps/api/tests/test_enrichment.py`:
```python

# ── WebEnrichmentProvider ────────────────────────────────────────────────────

def test_web_enrichment_provider_name():
    from services.enrichment.web_enrichment import WebEnrichmentProvider
    p = WebEnrichmentProvider()
    assert p.name == "web_enrichment"


@pytest.mark.asyncio
async def test_web_enrichment_search_returns_none_when_no_website():
    """Targets without website field should return None from search."""
    from services.enrichment.web_enrichment import WebEnrichmentProvider
    p = WebEnrichmentProvider()
    result = await p.search({"name": "Test GmbH", "country": "Germany"})
    assert result is None


@pytest.mark.asyncio
async def test_web_enrichment_confidence_high_for_rich_content():
    """Content > 5000 chars should give 0.85 confidence."""
    from services.enrichment.web_enrichment import WebEnrichmentProvider
    p = WebEnrichmentProvider()
    score = await p.confidence_score({}, {"content_length": 6000})
    assert score == 0.85


@pytest.mark.asyncio
async def test_web_enrichment_confidence_low_for_thin_content():
    """Content < 500 chars should give 0.3 confidence."""
    from services.enrichment.web_enrichment import WebEnrichmentProvider
    p = WebEnrichmentProvider()
    score = await p.confidence_score({}, {"content_length": 200})
    assert score == 0.3


@pytest.mark.asyncio
async def test_web_enrichment_enrich_extracts_directors():
    """enrich() should parse directors from Claude JSON response."""
    from services.enrichment.web_enrichment import WebEnrichmentProvider
    import json
    p = WebEnrichmentProvider()
    mock_response = {
        "directors": [
            {
                "name": "Hans Müller",
                "role": "Geschäftsführer",
                "is_founder": True,
                "estimated_age_range": "62-67",
                "age_reasoning": "Founded 1987",
                "tenure_signal": "since 1987",
            }
        ],
        "succession_signals": {
            "is_family_business": True,
            "succession_risk": "high",
            "family_name_match": True,
            "generational_language": False,
            "next_generation_present": False,
            "sole_key_person": True,
            "succession_notes": "Founder-led, no visible successor",
        },
        "business_info": {
            "employee_estimate": 35,
            "employee_source": "team page",
            "products_services": ["HVAC", "climate systems"],
            "industries_served": ["manufacturing"],
            "geographic_focus": "Bavaria",
            "key_customers": [],
            "key_suppliers": [],
        },
        "raw_signals": {"founding_year": 1987, "website_language": "de"},
        "confidence": 0.8,
        "confidence_reasoning": "Good data",
    }
    from unittest.mock import MagicMock, patch
    mock_content = MagicMock()
    mock_content.text = json.dumps(mock_response)
    mock_message = MagicMock()
    mock_message.content = [mock_content]
    target = {"name": "Müller GmbH", "industry": "HVAC", "city": "München", "country": "Germany"}
    search_result = {"content": "some content", "url": "https://example.com", "source": "jina"}
    with patch.object(p.client, 'messages') as mock_messages:
        mock_messages.create.return_value = mock_message
        result = await p.enrich(target, search_result)
    assert result["directors"] == ["Hans Müller"]
    assert result["is_family_business"] is True
    assert result["succession_risk"] == "high"
    assert result["founder_age_estimate"] == "62-67"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_enrichment.py -v -k "web_enrichment" 2>&1 | head -20
```
Expected: ImportError (file doesn't exist yet).

- [ ] **Step 3: Create `apps/api/services/enrichment/web_enrichment.py`**

```python
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_enrichment.py tests/test_web_fetcher.py -v 2>&1 | tail -20
```
Expected: all tests pass (21 total).

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/api/services/enrichment/web_enrichment.py apps/api/tests/test_enrichment.py
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: web enrichment provider — Claude AI extraction from company websites") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 3: DB Migration 015

**Files:**
- Create: `supabase/migrations/015_web_enrichment_columns.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 015_web_enrichment_columns.sql
-- Succession and web enrichment intelligence columns

DO $$ BEGIN ALTER TABLE targets ADD COLUMN is_family_business boolean; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN succession_risk text
    CHECK (succession_risk IN ('high', 'medium', 'low', 'unknown'));
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE targets ADD COLUMN succession_signals jsonb DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN founder_age_estimate text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN founder_age_reasoning text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN products_services text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN industries_served text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN geographic_focus text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN key_customers text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN key_suppliers text[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE targets ADD COLUMN web_analysis jsonb DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
```

Save to `supabase/migrations/015_web_enrichment_columns.sql`.

- [ ] **Step 2: Push to Supabase**

```bash
cd /Users/callmepio/Desktop/horus-main && npx supabase db push
```

Expected output:
```
Do you want to push these migrations to the remote database?
 • 015_web_enrichment_columns.sql
Applying migration 015_web_enrichment_columns.sql...
Finished supabase db push.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/015_web_enrichment_columns.sql
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: migration 015 — web enrichment + succession columns on targets") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 4: Orchestrator Update

**Files:**
- Modify: `apps/api/services/enrichment/orchestrator.py`
- Modify: `apps/api/routers/enrichment.py` (bump batch delay)

The orchestrator currently has:
```python
from .gleif import GLEIFProvider
PROVIDERS = [GLEIFProvider()]
_FIELD_MAP = { "lei_code": "lei_code", ... }
```

- [ ] **Step 1: Update orchestrator — add WebEnrichmentProvider + expand field map**

Replace `apps/api/services/enrichment/orchestrator.py` with:
```python
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
from .web_enrichment import WebEnrichmentProvider

_FIELD_MAP = {
    # GLEIF fields
    "lei_code": "lei_code",
    "legal_form": "legal_form",
    "registration_number": "registration_number",
    "registration_authority": "registration_authority",
    "parent_company": "parent_company",
    "ultimate_parent": "ultimate_parent",
    # Web enrichment fields
    "directors": "directors",
    "director_roles": "director_roles",
    "founded_year": "founded_year",
    "share_capital": "share_capital",
    "employee_count": "employee_count",
    "is_family_business": "is_family_business",
    "succession_risk": "succession_risk",
    "succession_signals": "succession_signals",
    "founder_age_estimate": "founder_age_estimate",
    "founder_age_reasoning": "founder_age_reasoning",
    "products_services": "products_services",
    "industries_served": "industries_served",
    "geographic_focus": "geographic_focus",
    "key_customers": "key_customers",
    "key_suppliers": "key_suppliers",
    "web_analysis": "web_analysis",
}

MINIMUM_CONFIDENCE = 0.4

PROVIDERS = [
    GLEIFProvider(),          # Corporate hierarchy: LEI code, parent companies, legal form
    WebEnrichmentProvider(),  # Management + succession intelligence from websites
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
```

- [ ] **Step 2: Bump batch delay from 1s to 3s in `apps/api/routers/enrichment.py`**

Find the two `await asyncio.sleep(1)` lines in `enrich_batch` and `enrich_all` functions. Change each to `await asyncio.sleep(3)`.

In `enrich_batch` (around line 88): `await asyncio.sleep(1)` → `await asyncio.sleep(3)`
In `enrich_all` (around line 140): `await asyncio.sleep(1)` → `await asyncio.sleep(3)`

- [ ] **Step 3: Verify Python imports clean**

```bash
cd apps/api && source .venv/bin/activate && python3 -c "
from services.enrichment.orchestrator import PROVIDERS, run_enrichment
print('Providers:', [p.name for p in PROVIDERS])
"
```
Expected: `Providers: ['gleif', 'web_enrichment']`

- [ ] **Step 4: Run all enrichment tests**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_enrichment.py tests/test_web_fetcher.py -v 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/api/services/enrichment/orchestrator.py apps/api/routers/enrichment.py
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: register WebEnrichmentProvider in orchestrator, bump batch delay to 3s") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 5: Scoring Engine Update

**Files:**
- Modify: `apps/api/services/claude_service.py`

The `_build_target_summary()` function currently only sends basic fields to Claude for scoring. It should include the enriched succession/management data when available. This makes the transition_score and value_score far more accurate.

- [ ] **Step 1: Update `_build_target_summary()` in `apps/api/services/claude_service.py`**

After the `if target.get("raw_data"):` block (around line 58), add these lines inside `_build_target_summary`:
```python
    # Enriched succession intelligence — use when available (high-confidence signals)
    if target.get("is_family_business") is not None:
        lines.append(f"Family business: {target['is_family_business']}")
    if target.get("succession_risk"):
        lines.append(f"Succession risk assessment: {target['succession_risk']}")
    if target.get("founder_age_estimate"):
        lines.append(f"Founder estimated age: {target['founder_age_estimate']} ({target.get('founder_age_reasoning', '')})")
    if target.get("directors"):
        directors_str = ", ".join(target["directors"][:3])
        lines.append(f"Known management: {directors_str}")
    if target.get("succession_signals"):
        signals = target["succession_signals"]
        notes = signals.get("succession_notes", "")
        if notes:
            lines.append(f"Succession notes: {notes}")
    if target.get("products_services"):
        lines.append(f"Products/services: {', '.join(target['products_services'][:5])}")
    if target.get("geographic_focus"):
        lines.append(f"Geographic focus: {target['geographic_focus']}")
    if target.get("parent_company"):
        lines.append(f"Parent company: {target['parent_company']}")
```

Also update the `SYSTEM_PROMPT` constant — after the line `"Scores below 3 indicate poor targets or missing critical data"`, add:
```
\nIf enriched data is available (succession_risk, founder_age_estimate, is_family_business, directors), weight these heavily in transition_score — they are extracted from real company data and more reliable than inferences.
```

- [ ] **Step 2: Verify imports still work**

```bash
cd apps/api && source .venv/bin/activate && python3 -c "from services.claude_service import score_target; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/api/services/claude_service.py
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: include succession enrichment data in AI scoring prompt") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 6: TypeScript Types Update

**Files:**
- Modify: `apps/web/lib/api/client.ts`

- [ ] **Step 1: Add new fields to `Target` interface and add `targets.update()` method**

In `apps/web/lib/api/client.ts`, find the `Target` interface (around line 246). After the existing enrichment fields block (ending with `data_sources: string[] | null`), add:
```typescript
  // Web enrichment — succession intelligence
  is_family_business: boolean | null
  succession_risk: 'high' | 'medium' | 'low' | 'unknown' | null
  succession_signals: {
    is_family_business?: boolean
    family_name_match?: boolean
    generational_language?: boolean
    next_generation_present?: boolean
    sole_key_person?: boolean
    succession_risk?: string
    succession_notes?: string
  } | null
  founder_age_estimate: string | null
  founder_age_reasoning: string | null
  products_services: string[] | null
  industries_served: string[] | null
  geographic_focus: string | null
  key_customers: string[] | null
  key_suppliers: string[] | null
  web_analysis: Record<string, unknown> | null
```

Also add a `DirectorRole` interface for typed director roles (the existing `director_roles` field is untyped). Find where `DirectorRole` is used or referenced — if there's no explicit interface, add before the `Target` interface:
```typescript
export interface DirectorRole {
  name: string
  role: string
  tenure_signal?: string
  estimated_age_range?: string
  age_reasoning?: string
  is_founder?: boolean
  start_date?: string
  end_date?: string
  status?: string
}
```

Then update `director_roles: DirectorRole[] | null` in the `Target` interface (currently typed as `DirectorRole[] | null` — if it's untyped jsonb, add the explicit type).

Find the `targets` object in the API client (around line 29) and add an `update` method after the `delete` method:
```typescript
    update: (id: string, data: Partial<Pick<Target, 'website' | 'name' | 'city' | 'country' | 'employee_count' | 'founded_year' | 'owner_age_estimate' | 'industry_label'>>) =>
      apiFetch<Target>(`/targets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
```

- [ ] **Step 2: Run TS type check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web && npx tsc --noEmit 2>&1 | grep -v "mapbox-gl 10" | grep error | head -20
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/web/lib/api/client.ts
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: add succession + web enrichment types to Target interface") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 7: EnrichmentPanel Frontend Update

**Files:**
- Modify: `apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx`

The current panel shows: legal form, registration, share capital, parent company, LEI, data sources.

Add three new sections (in this order, below existing GLEIF data):
1. **Succession Assessment** — most visually prominent (risk badge, family business badge, founder age, notes)
2. **Management Team** — directors with roles and founder badge
3. **Business Profile** — products/services pills, industries, geographic focus, employee count (only if data present)

Plus: inline website URL input for targets with no website.

Design rules (CLAUDE.md): `rounded-sm`, no shadows, no gradients, Palantir institutional style.

- [ ] **Step 1: Implement updated EnrichmentPanel**

Replace the entire `apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx` with the following:

```tsx
'use client'
import { useState } from 'react'
import { api, Target, EnrichmentJob, DirectorRole } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Building2,
  Hash,
  Globe,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Network,
  Users,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  Briefcase,
  MapPin,
} from 'lucide-react'

interface Props {
  target: Target
  onEnriched?: () => void
}

function StatusBadge({ status }: { status: Target['enrichment_status'] }) {
  const map: Record<string, { label: string; className: string }> = {
    enriched: { label: 'Enriched', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial:  { label: 'Partial',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
    failed:   { label: 'Failed',   className: 'bg-red-50 text-red-700 border-red-200' },
    pending:  { label: 'Pending',  className: 'bg-blue-50 text-blue-700 border-blue-200' },
    none:     { label: 'Not enriched', className: 'bg-muted text-muted-foreground border-border' },
  }
  const cfg = map[status ?? 'none'] ?? map['none']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function SuccessionRiskBadge({ risk }: { risk: string | null | undefined }) {
  if (!risk) return null
  const map: Record<string, { label: string; className: string; Icon: React.ElementType }> = {
    high:    { label: 'High succession risk',   className: 'bg-red-50 text-red-700 border-red-200',       Icon: AlertTriangle },
    medium:  { label: 'Medium succession risk', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: MinusCircle },
    low:     { label: 'Low succession risk',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    unknown: { label: 'Risk unknown',           className: 'bg-muted text-muted-foreground border-border', Icon: MinusCircle },
  }
  const cfg = map[risk] ?? map['unknown']
  const { Icon } = cfg
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium border ${cfg.className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {cfg.label}
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const delta = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(delta / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-3 pb-1.5 border-t border-border mt-3 first:mt-0 first:border-0 first:pt-0">
      {children}
    </p>
  )
}

function DataRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  )
}

export default function EnrichmentPanel({ target, onEnriched }: Props) {
  const [loading, setLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<EnrichmentJob[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [websiteInput, setWebsiteInput] = useState('')
  const [savingWebsite, setSavingWebsite] = useState(false)

  const hasData = target.enrichment_status === 'enriched' || target.enrichment_status === 'partial'
  const hasSuccessionData = !!(target.succession_risk || target.is_family_business != null || target.founder_age_estimate)
  const hasManagementData = !!(target.directors && target.directors.length > 0)
  const hasBusinessData = !!(
    (target.products_services && target.products_services.length > 0) ||
    target.geographic_focus ||
    target.employee_count
  )

  async function handleEnrich(force = false) {
    setLoading(true)
    const toastId = toast.loading(force ? 'Re-enriching target…' : 'Enriching target…')
    try {
      await api.enrichment.enrich(target.id, force)
      toast.success('Enrichment complete — reloading', { id: toastId })
      if (onEnriched) onEnriched()
      else window.location.reload()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('409') || msg.toLowerCase().includes('recently enriched')) {
        toast.warning('Enriched recently. Use Re-enrich to force.', { id: toastId })
      } else {
        toast.error('Enrichment failed', { id: toastId })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveWebsite() {
    const url = websiteInput.trim()
    if (!url) return
    setSavingWebsite(true)
    try {
      await api.targets.update(target.id, { website: url })
      toast.success('Website saved — enriching now…')
      setWebsiteInput('')
      await handleEnrich(false)
    } catch {
      toast.error('Failed to save website URL')
    } finally {
      setSavingWebsite(false)
    }
  }

  async function toggleHistory() {
    if (!historyOpen && history === null) {
      setHistoryLoading(true)
      try {
        const res = await api.enrichment.jobs(target.id)
        setHistory(res.data)
      } catch {
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    }
    setHistoryOpen(prev => !prev)
  }

  const activeDirectors = target.director_roles
    ? (target.director_roles as DirectorRole[]).filter((d) => !d.end_date || d.status === 'active')
    : null

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Data enrichment</CardTitle>
            <StatusBadge status={target.enrichment_status} />
          </div>
          <div className="flex items-center gap-2">
            {target.last_enriched_at && (
              <span className="text-xs text-muted-foreground">{relativeTime(target.last_enriched_at)}</span>
            )}
            {hasData && (
              <Button
                variant="outline" size="sm"
                className="h-7 px-2.5 text-xs rounded-sm cursor-pointer"
                disabled={loading}
                onClick={() => handleEnrich(true)}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Re-enrich
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-4">
        {!hasData && !loading && (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">No enrichment data yet</p>

            {!target.website && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Add a website URL to enable AI succession analysis
                </p>
                <div className="flex gap-2">
                  <Input
                    value={websiteInput}
                    onChange={e => setWebsiteInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveWebsite()}
                    placeholder="https://example.de"
                    className="h-7 text-xs rounded-sm"
                  />
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs rounded-sm cursor-pointer shrink-0"
                    disabled={savingWebsite || !websiteInput.trim()}
                    onClick={handleSaveWebsite}
                  >
                    Save &amp; enrich
                  </Button>
                </div>
              </div>
            )}

            {target.website && (
              <Button
                size="sm"
                className="h-7 px-3 text-xs rounded-sm cursor-pointer"
                disabled={loading}
                onClick={() => handleEnrich(false)}
              >
                <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Enrich now
              </Button>
            )}
          </div>
        )}

        {loading && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Enriching from GLEIF + AI web analysis…</p>
          </div>
        )}

        {hasData && !loading && (
          <div>
            {/* Succession Assessment — most prominent section */}
            {hasSuccessionData && (
              <>
                <SectionTitle>Succession Assessment</SectionTitle>
                <div className="space-y-2.5 pb-1">
                  {target.succession_risk && (
                    <SuccessionRiskBadge risk={target.succession_risk} />
                  )}
                  {target.is_family_business && (
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium border bg-violet-50 text-violet-700 border-violet-200">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        Family business
                      </span>
                    </div>
                  )}
                  {target.founder_age_estimate && (
                    <div className="text-sm">
                      <span className="text-muted-foreground text-xs">Est. founder age: </span>
                      <span className="font-medium">{target.founder_age_estimate}</span>
                      {target.founder_age_reasoning && (
                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                          {target.founder_age_reasoning}
                        </p>
                      )}
                    </div>
                  )}
                  {target.succession_signals?.succession_notes && (
                    <p className="text-xs text-muted-foreground italic">
                      {target.succession_signals.succession_notes}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* GLEIF corporate data */}
            {(target.legal_form || target.registration_number || target.parent_company || target.lei_code) && (
              <>
                <SectionTitle>Corporate Data</SectionTitle>
                <div className="space-y-0">
                  {target.legal_form && (
                    <DataRow icon={Building2} label="Legal form" value={target.legal_form} />
                  )}
                  {target.registration_number && (
                    <DataRow
                      icon={Hash}
                      label="Registration"
                      value={[target.registration_number, target.registration_authority].filter(Boolean).join(', ')}
                    />
                  )}
                  {(target.parent_company || target.ultimate_parent) && (
                    <DataRow
                      icon={Network}
                      label="Corporate group"
                      value={
                        <div className="space-y-0.5 mt-0.5">
                          {target.parent_company && (
                            <div className="text-sm">
                              {target.parent_company}
                              <span className="text-muted-foreground ml-1.5 text-xs">parent</span>
                            </div>
                          )}
                          {target.ultimate_parent && target.ultimate_parent !== target.parent_company && (
                            <div className="text-sm">
                              {target.ultimate_parent}
                              <span className="text-muted-foreground ml-1.5 text-xs">ultimate parent</span>
                            </div>
                          )}
                        </div>
                      }
                    />
                  )}
                  {target.lei_code && (
                    <DataRow
                      icon={Globe}
                      label="LEI"
                      value={<code className="text-xs font-mono text-muted-foreground tracking-wide">{target.lei_code}</code>}
                    />
                  )}
                </div>
              </>
            )}

            {/* Management Team */}
            {hasManagementData && (
              <>
                <SectionTitle>Management Team</SectionTitle>
                <div className="space-y-1.5 pb-1">
                  {(activeDirectors || (target.directors ?? [])).slice(0, 5).map((d, i) => {
                    const director = typeof d === 'string' ? { name: d } : d as DirectorRole
                    return (
                      <div key={i} className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium text-foreground">{director.name}</span>
                          {director.is_founder && (
                            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs border bg-amber-50 text-amber-700 border-amber-200">
                              Founder
                            </span>
                          )}
                          {director.role && (
                            <p className="text-xs text-muted-foreground">{director.role}</p>
                          )}
                          {director.estimated_age_range && (
                            <p className="text-xs text-muted-foreground">Est. age {director.estimated_age_range}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Business Profile */}
            {hasBusinessData && (
              <>
                <SectionTitle>Business Profile</SectionTitle>
                <div className="space-y-2 pb-1">
                  {target.products_services && target.products_services.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Products &amp; services</p>
                      <div className="flex flex-wrap gap-1">
                        {target.products_services.slice(0, 8).map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs font-normal rounded-sm capitalize">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {target.industries_served && target.industries_served.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Industries served</p>
                      <div className="flex flex-wrap gap-1">
                        {target.industries_served.slice(0, 5).map((s, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-normal rounded-sm">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {target.geographic_focus && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{target.geographic_focus}</span>
                    </div>
                  )}
                  {target.employee_count && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{target.employee_count} employees (est.)</span>
                    </div>
                  )}
                  {target.key_customers && target.key_customers.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Key customers</p>
                      <ul className="text-xs space-y-0.5">
                        {target.key_customers.slice(0, 5).map((c, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Data source pills */}
            {target.data_sources && target.data_sources.length > 0 && (
              <div className="flex items-center gap-1.5 pt-3 mt-1 border-t border-border">
                <span className="text-xs text-muted-foreground">Sources:</span>
                {target.data_sources.map(src => (
                  <Badge key={src} variant="secondary" className="text-xs font-normal capitalize rounded-sm">
                    {src.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {(hasData || target.enrichment_status === 'failed') && (
          <div className="mt-4 pt-3 border-t border-border">
            <button
              onClick={toggleHistory}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Enrichment history
            </button>
            {historyOpen && (
              <div className="mt-2 space-y-1">
                {historyLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                {!historyLoading && history !== null && history.length === 0 && (
                  <p className="text-xs text-muted-foreground">No history found</p>
                )}
                {!historyLoading && history && history.slice(0, 5).map(job => (
                  <div key={job.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">
                      {job.created_at
                        ? new Date(job.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                    <StatusBadge status={job.status as Target['enrichment_status']} />
                    <span className="text-muted-foreground text-xs">{job.providers_completed?.join(', ') || 'none'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Run TS type check on the panel**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web && npx tsc --noEmit 2>&1 | grep -v "mapbox-gl 10" | grep error | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add "apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx"
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: enrichment panel — succession assessment, management team, business profile, inline website input") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 8: Discovery Table — Succession Columns

**Files:**
- Modify: `apps/web/app/(dashboard)/discovery/components/TargetTable.tsx`

Add two new columns: **Succession** (risk badge) and **Family** (boolean icon). Insert them between the Enrichment column and the Score column.

- [ ] **Step 1: Add SuccessionRiskPill component and new columns to TargetTable**

At the top of the file, add to the existing imports (after the `ExternalLink, Trash2` import):
```tsx
import { AlertTriangle, MinusCircle, CheckCircle2, Home } from 'lucide-react'
```

Add this helper component before `export default function TargetTable`:
```tsx
function SuccessionPill({ risk }: { risk: string | null | undefined }) {
  if (!risk || risk === 'unknown') return <span className="text-muted-foreground text-xs">—</span>
  const map: Record<string, { label: string; className: string }> = {
    high:   { label: 'High',   className: 'text-red-700 bg-red-50 border-red-200' },
    medium: { label: 'Medium', className: 'text-amber-700 bg-amber-50 border-amber-200' },
    low:    { label: 'Low',    className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  }
  const cfg = map[risk] ?? { label: risk, className: 'text-muted-foreground bg-muted border-border' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
```

In the `<thead>` row, after the `<th>Enrichment</th>` header and before `<th>Score</th>`, add:
```tsx
<th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Succession</th>
<th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Family</th>
```

In the `<tbody>` row, after the Enrichment `<td>` and before the Score `<td>`, add:
```tsx
<td className="px-3 py-2.5 text-center">
  <SuccessionPill risk={t.succession_risk} />
</td>
<td className="px-3 py-2.5 text-center">
  {t.is_family_business === true
    ? <Home className="h-3.5 w-3.5 text-violet-600 mx-auto" aria-label="Family business" />
    : <span className="text-muted-foreground text-xs">—</span>
  }
</td>
```

- [ ] **Step 2: Run TS type check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web && npx tsc --noEmit 2>&1 | grep -v "mapbox-gl 10" | grep error | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/web/app/(dashboard)/discovery/components/TargetTable.tsx
TREE=$(git write-tree) && PARENT=$(git rev-parse HEAD) && COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "feat: discovery table — succession risk + family business columns") && git update-ref refs/heads/main "$COMMIT"
echo "committed: $COMMIT"
```

---

## Task 9: Deploy

**Files:**
- No file changes — just deploy

- [ ] **Step 1: Verify all Python tests pass**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api && source .venv/bin/activate && pytest tests/ -v 2>&1 | tail -15
```
Expected: all tests pass.

- [ ] **Step 2: Verify TS build passes (excluding pre-existing mapbox error)**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web && npx tsc --noEmit 2>&1 | grep -v "mapbox-gl 10" | grep error | head -20
```
Expected: no output (no errors).

- [ ] **Step 3: Deploy backend to Fly.io**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api && /Users/callmepio/.fly/bin/flyctl deploy 2>&1 | tail -10
```
Expected: `✓ Machine ... is now in a good state` × 2, then `Visit your newly deployed app at https://searchfund-api.fly.dev/`

- [ ] **Step 4: Health check**

```bash
curl -s https://searchfund-api.fly.dev/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 5: Push to trigger Vercel deploy**

```bash
cd /Users/callmepio/Desktop/horus-main && git push origin main
```
Expected: `main -> main` with commit hash.

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|-----------------|------|
| Jina Reader primary + Trafilatura fallback | Task 1 |
| Claude extraction provider | Task 2 |
| `succession_risk`, `is_family_business`, `founder_age_estimate`, `succession_signals`, `products_services`, `industries_served`, `geographic_focus`, `key_customers`, `key_suppliers`, `web_analysis` columns | Task 3 |
| WebEnrichmentProvider registered in orchestrator after GLEIF | Task 4 |
| Batch delay 3s | Task 4 |
| Enriched fields feed into AI scoring | Task 5 |
| TS types for new fields | Task 6 |
| `targets.update()` API method | Task 6 |
| Succession Assessment section in panel | Task 7 |
| Management Team section | Task 7 |
| Business Profile section | Task 7 |
| Inline website URL input for no-website targets | Task 7 |
| Discovery table succession risk + family business columns | Task 8 |
| trafilatura in requirements.txt | Task 1 |
| fly deploy | Task 9 |

### Pre-conditions already handled (not in plan)

- `website` column already in targets table (migration 001) — no action needed
- `employee_count` already in targets table — not re-added in migration 015
- `founded_year` already in targets table — not re-added in migration 015
- `PATCH /targets/{id}` endpoint + `TargetUpdate` model already support `website` field — no change needed

### Placeholder scan
No "TBD", "TODO", or incomplete steps found. All code blocks complete.

### Type consistency check
- `DirectorRole.is_founder: boolean` — defined in client.ts Task 6, used in EnrichmentPanel Task 7 ✅
- `Target.succession_risk: 'high' | 'medium' | 'low' | 'unknown' | null` — defined Task 6, used in EnrichmentPanel Task 7 and TargetTable Task 8 ✅
- `api.targets.update()` — defined Task 6, called in EnrichmentPanel Task 7 ✅
- `web_analysis` key in provider → orchestrator field map → DB column — consistent throughout ✅
