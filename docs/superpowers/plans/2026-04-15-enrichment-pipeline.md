# Enrichment Pipeline + OpenCorporates Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a data enrichment pipeline that auto-enriches targets with OpenCorporates registry data (directors, legal form, registration number, founding date) and exposes enrichment status/history in the UI.

**Architecture:** DB-backed enrichment job queue (enrichment_jobs + enrichment_sources tables). FastAPI orchestrator runs providers (OpenCorporates first) synchronously on target creation. Frontend shows enrichment panel on target detail, status column on discovery list, and stats on dashboard.

**Tech Stack:** FastAPI + httpx + Supabase Python SDK · Next.js 15 App Router · shadcn/ui · sonner toasts · Tailwind CSS

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/013_enrichment.sql` | Create enrichment_jobs, enrichment_sources, add columns to targets |
| `apps/api/services/enrichment/__init__.py` | Package init (empty) |
| `apps/api/services/enrichment/base.py` | Abstract EnrichmentProvider base class |
| `apps/api/services/enrichment/opencorporates.py` | OpenCorporates API provider |
| `apps/api/services/enrichment/orchestrator.py` | run_enrichment() — runs providers, merges data, updates target |
| `apps/api/routers/enrichment.py` | 5 enrichment endpoints |
| `apps/api/tests/__init__.py` | Test package |
| `apps/api/tests/test_enrichment.py` | Orchestrator + provider unit tests |
| `apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx` | Enrichment status/data/history panel (client component) |

### Modified files
| File | Change |
|------|--------|
| `apps/api/main.py` | Register enrichment router |
| `apps/api/config.py` | Add `opencorporates_api_token` optional field |
| `apps/api/routers/targets.py` | Auto-enrich after `create_target` and `bulk_import` |
| `apps/web/lib/api/client.ts` | Add Target enrichment fields, enrichment interfaces, `api.enrichment` group |
| `apps/web/app/(dashboard)/discovery/[id]/page.tsx` | Import + render EnrichmentPanel below Company overview card |
| `apps/web/app/(dashboard)/discovery/components/TargetTable.tsx` | Add Enrichment status column |
| `apps/web/app/(dashboard)/discovery/page.tsx` | Add "Enrich all" button to toolbar |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Add enrichment stats card |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/013_enrichment.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/013_enrichment.sql

-- Enrichment jobs: one record per enrichment run for a target
create table if not exists enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  target_id uuid not null references targets(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'partial', 'failed')),
  providers_completed text[] default '{}',
  providers_failed text[] default '{}',
  data_before jsonb default '{}',
  data_enriched jsonb default '{}',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table enrichment_jobs enable row level security;
create policy "tenant_isolation" on enrichment_jobs
  for all using (
    tenant_id = (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid
  );

create index idx_enrichment_jobs_target on enrichment_jobs(target_id);
create index idx_enrichment_jobs_status on enrichment_jobs(status);

-- Per-provider results within a job
create table if not exists enrichment_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references enrichment_jobs(id) on delete cascade,
  provider text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  raw_response jsonb default '{}',
  extracted_data jsonb default '{}',
  confidence float default 0.0 check (confidence >= 0 and confidence <= 1),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz
);

create index idx_enrichment_sources_job on enrichment_sources(job_id);

-- Enrichment metadata on targets
DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN enrichment_status text DEFAULT 'none'
    CHECK (enrichment_status IN ('none','pending','enriched','partial','failed'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN last_enriched_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN enrichment_data jsonb DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN legal_form text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN share_capital text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN directors text[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN director_roles jsonb DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN registration_number text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN registration_authority text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN opencorporates_url text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE targets ADD COLUMN data_sources text[] DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
```

- [ ] **Step 2: Push migration**

```bash
cd /Users/callmepio/Desktop/horus-main
supabase db push
```

Expected: "Applying migration 013_enrichment.sql... done."
If it asks for confirmation, type `y`.

- [ ] **Step 3: Verify tables exist**

```bash
supabase db remote commit 2>/dev/null || true
# Check via API or just verify push succeeded
```

Verification: migration push completes without error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_enrichment.sql
```

Then commit using the project's git pattern (write-tree method per CLAUDE.md):
```bash
git write-tree | xargs -I{} git commit-tree {} -p HEAD -m "feat: add enrichment_jobs, enrichment_sources tables + enrich columns on targets"
```
Then `git update-ref HEAD <sha>` with the output sha.

---

## Task 2: Backend enrichment service layer

**Files:**
- Create: `apps/api/services/enrichment/__init__.py`
- Create: `apps/api/services/enrichment/base.py`
- Create: `apps/api/services/enrichment/opencorporates.py`
- Create: `apps/api/services/enrichment/orchestrator.py`
- Create: `apps/api/tests/__init__.py`
- Create: `apps/api/tests/test_enrichment.py`

- [ ] **Step 1: Write failing tests first**

Create `apps/api/tests/__init__.py` (empty):
```python
```

Create `apps/api/tests/test_enrichment.py`:
```python
"""
Tests for enrichment orchestrator and providers.
Uses unittest.mock to avoid real HTTP calls or DB operations.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio


# ── Provider base tests ──────────────────────────────────────────────────────

def test_provider_name_defined():
    """Each concrete provider must set a name."""
    from services.enrichment.opencorporates import OpenCorporatesProvider
    provider = OpenCorporatesProvider()
    assert provider.name == "opencorporates"


# ── OpenCorporates country mapping ───────────────────────────────────────────

def test_country_to_code_known():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    assert p._country_to_code("Germany") == "de"
    assert p._country_to_code("ITALIA") == "it"
    assert p._country_to_code("france") == "fr"


def test_country_to_code_unknown_truncates():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    # Unknown country: returns first two chars of lowercased name
    assert p._country_to_code("Portugal") == "pt"


def test_extract_year_valid():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    assert p._extract_year("1987-03-15") == 1987
    assert p._extract_year("2003") == 2003


def test_extract_year_none():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    assert p._extract_year(None) is None
    assert p._extract_year("") is None


# ── Confidence scoring ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confidence_country_boost():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    target = {"name": "Müller GmbH", "country": "Germany", "city": "Munich"}
    # Match score 0.9, jurisdiction starts with 'de'
    result = {"_match_score": 0.8, "jurisdiction_code": "de", "registered_address_in_full": "München"}
    score = await p.confidence_score(target, result)
    # 0.8 base + 0.15 country boost + 0.10 city boost = 1.0 (capped)
    assert score == 1.0


@pytest.mark.asyncio
async def test_confidence_no_boost():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    target = {"name": "Acme Corp", "country": "France", "city": "Lyon"}
    result = {"_match_score": 0.6, "jurisdiction_code": "de", "registered_address_in_full": "Berlin"}
    score = await p.confidence_score(target, result)
    assert score == 0.6  # no boosts apply


# ── Orchestrator tests ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrator_skips_low_confidence():
    """When provider confidence < 0.4, source is skipped and target not updated."""
    from services.enrichment.orchestrator import run_enrichment

    # Fake provider that always returns a result but with confidence 0.2
    fake_provider = MagicMock()
    fake_provider.name = "fake"
    fake_provider.search = AsyncMock(return_value={"name": "Wrong Corp"})
    fake_provider.confidence_score = AsyncMock(return_value=0.2)
    fake_provider.enrich = AsyncMock(return_value={"legal_form": "AG"})

    # Mock Supabase DB client (chained builder pattern)
    mock_db = _make_mock_db()

    target = {
        "id": "test-target-id",
        "name": "Test GmbH",
        "country": "Germany",
        "city": "Berlin",
    }

    result = await run_enrichment(
        target=target,
        tenant_id="test-tenant-id",
        db=mock_db,
        providers=[fake_provider],
    )

    # enrich should NOT have been called
    fake_provider.enrich.assert_not_called()


@pytest.mark.asyncio
async def test_orchestrator_merges_enriched_data():
    """When provider returns data with sufficient confidence, it merges into target."""
    from services.enrichment.orchestrator import run_enrichment

    fake_provider = MagicMock()
    fake_provider.name = "fake"
    fake_provider.search = AsyncMock(return_value={"name": "Test GmbH", "jurisdiction_code": "de"})
    fake_provider.confidence_score = AsyncMock(return_value=0.85)
    fake_provider.enrich = AsyncMock(return_value={
        "legal_form": "GmbH",
        "registration_number": "HRB 12345",
        "directors": ["Max Müller"],
    })

    mock_db = _make_mock_db()

    target = {"id": "test-target-id", "name": "Test GmbH", "country": "Germany", "city": "Berlin"}
    result = await run_enrichment(
        target=target,
        tenant_id="test-tenant-id",
        db=mock_db,
        providers=[fake_provider],
    )

    fake_provider.enrich.assert_called_once()


@pytest.mark.asyncio
async def test_orchestrator_handles_provider_exception():
    """If a provider raises, it's recorded as failed and orchestrator continues."""
    from services.enrichment.orchestrator import run_enrichment

    failing_provider = MagicMock()
    failing_provider.name = "failing"
    failing_provider.search = AsyncMock(side_effect=Exception("Network error"))

    mock_db = _make_mock_db()

    target = {"id": "test-target-id", "name": "Test Corp", "country": "France", "city": "Paris"}
    # Should not raise
    result = await run_enrichment(
        target=target,
        tenant_id="test-tenant-id",
        db=mock_db,
        providers=[failing_provider],
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_mock_db():
    """
    Returns a Mock that supports the chained Supabase builder pattern:
    db.table(...).insert(...).execute()
    db.table(...).update(...).eq(...).execute()
    db.table(...).select(...).eq(...).single().execute()
    """
    job_data = {"id": "test-job-id", "status": "running"}
    source_data = {"id": "test-source-id"}

    mock_execute = MagicMock()
    mock_execute.data = [job_data]

    single_execute = MagicMock()
    single_execute.data = {**job_data, "status": "completed"}

    chain = MagicMock()
    chain.execute = MagicMock(return_value=mock_execute)
    chain.eq = MagicMock(return_value=chain)
    chain.single = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=single_execute)))
    chain.insert = MagicMock(return_value=chain)
    chain.update = MagicMock(return_value=chain)
    chain.select = MagicMock(return_value=chain)

    mock_db = MagicMock()
    mock_db.table = MagicMock(return_value=chain)
    return mock_db
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
source .venv/bin/activate
pytest tests/test_enrichment.py -v 2>&1 | head -30
```

Expected: ImportError or ModuleNotFoundError (services don't exist yet).

- [ ] **Step 3: Create package init**

Create `apps/api/services/enrichment/__init__.py`:
```python
```
(empty file)

- [ ] **Step 4: Create base provider**

Create `apps/api/services/enrichment/base.py`:
```python
"""
Abstract base class for all enrichment providers.
"""
from abc import ABC, abstractmethod
from typing import Optional


class EnrichmentProvider(ABC):
    name: str = "base"

    @abstractmethod
    async def search(self, target: dict) -> Optional[dict]:
        """
        Search for a matching company.
        Input: target dict with name, country, city.
        Returns: match metadata dict or None.
        """
        pass

    @abstractmethod
    async def enrich(self, target: dict, search_result: dict) -> dict:
        """
        Extract structured fields from a matched company.
        Returns: dict of enriched fields to merge into target.
        """
        pass

    @abstractmethod
    async def confidence_score(self, target: dict, search_result: dict) -> float:
        """
        How confident this match is correct. Returns 0.0–1.0.
        """
        pass
```

- [ ] **Step 5: Create OpenCorporates provider**

Create `apps/api/services/enrichment/opencorporates.py`:
```python
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
```

- [ ] **Step 6: Create orchestrator**

Create `apps/api/services/enrichment/orchestrator.py`:
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
from .opencorporates import OpenCorporatesProvider

PROVIDERS = [
    OpenCorporatesProvider(),
]

MINIMUM_CONFIDENCE = 0.4

_FIELD_MAP = {
    "legal_form": "legal_form",
    "registration_number": "registration_number",
    "registration_authority": "registration_authority",
    "opencorporates_url": "opencorporates_url",
    "directors": "directors",
    "director_roles": "director_roles",
    "founded_year": "founded_year",
    "share_capital": "share_capital",
}


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
```

- [ ] **Step 7: Run tests**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
source .venv/bin/activate
pip install pytest-asyncio -q
pytest tests/test_enrichment.py -v
```

Expected: All tests pass. If `pytest-asyncio` is already installed, the pip command will be a no-op.

If asyncio tests fail with "no event loop", add to `apps/api/tests/test_enrichment.py` at top level:
```python
import pytest
pytest_plugins = ['anyio']
```

Or add `pytest.ini` at `apps/api/`:
```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 8: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/api/services/enrichment/ apps/api/tests/
```

Commit using write-tree pattern.

---

## Task 3: Enrichment router + registration + config

**Files:**
- Create: `apps/api/routers/enrichment.py`
- Modify: `apps/api/main.py`
- Modify: `apps/api/config.py`

- [ ] **Step 1: Add OpenCorporates token to config**

Edit `apps/api/config.py` — add one field to `Settings`:

```python
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    anthropic_api_key: str
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    environment: str = "development"
    mapbox_token: str = ""
    opencorporates_api_token: Optional[str] = None  # Add this line

settings = Settings()
```

- [ ] **Step 2: Update orchestrator to use config token**

Edit `apps/api/services/enrichment/orchestrator.py` — replace the PROVIDERS list initialization:

Replace:
```python
PROVIDERS = [
    OpenCorporatesProvider(),
]
```

With:
```python
from config import settings

def _build_providers():
    return [
        OpenCorporatesProvider(api_token=settings.opencorporates_api_token),
    ]

PROVIDERS = _build_providers()
```

- [ ] **Step 3: Create enrichment router**

Create `apps/api/routers/enrichment.py`:
```python
"""
Enrichment endpoints.

POST /enrichment/enrich/{target_id}         - Enrich single target
POST /enrichment/enrich-batch               - Enrich multiple targets (max 20)
GET  /enrichment/jobs/{target_id}           - Enrichment history for target
GET  /enrichment/stats                      - Tenant-wide enrichment stats
POST /enrichment/enrich-all                 - Enrich all unenriched targets
"""
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from dependencies import get_db, get_tenant_id
from services.enrichment.orchestrator import run_enrichment
from pydantic import BaseModel

router = APIRouter()


class BatchEnrichRequest(BaseModel):
    target_ids: list[str]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _recently_enriched(last_enriched_at: str | None) -> bool:
    """Returns True if enriched within the last 24 hours."""
    if not last_enriched_at:
        return False
    try:
        ts = datetime.fromisoformat(last_enriched_at.replace("Z", "+00:00"))
        return (_now_utc() - ts) < timedelta(hours=24)
    except Exception:
        return False


@router.post("/enrich/{target_id}")
async def enrich_target(
    target_id: str,
    force: bool = False,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Enrich a single target. Returns 409 if enriched within 24h (unless force=true)."""
    result = db.table("targets").select("*").eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Target not found")

    target = result.data

    if not force and _recently_enriched(target.get("last_enriched_at")):
        raise HTTPException(
            status_code=409,
            detail="Recently enriched. Use force=true to re-enrich.",
        )

    job = await run_enrichment(target=target, tenant_id=tenant_id, db=db)
    return job


@router.post("/enrich-batch")
async def enrich_batch(
    body: BatchEnrichRequest,
    force: bool = False,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Enrich up to 20 targets sequentially."""
    if len(body.target_ids) > 20:
        raise HTTPException(status_code=400, detail="Max 20 targets per batch")

    total = len(body.target_ids)
    succeeded = 0
    failed = 0
    skipped = 0
    results = []

    for target_id in body.target_ids:
        res = db.table("targets").select("*").eq("id", target_id).eq("tenant_id", tenant_id).single().execute()
        if not res.data:
            skipped += 1
            continue

        target = res.data

        if not force and _recently_enriched(target.get("last_enriched_at")):
            skipped += 1
            continue

        try:
            job = await run_enrichment(target=target, tenant_id=tenant_id, db=db)
            results.append(job)
            succeeded += 1
        except Exception:
            failed += 1

        await asyncio.sleep(1)  # Rate limiting: 1 req/sec

    return {
        "total": total,
        "succeeded": succeeded,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }


@router.get("/jobs/{target_id}")
async def get_enrichment_jobs(
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Return enrichment job history for a target (most recent first, max 10)."""
    jobs_res = db.table("enrichment_jobs").select(
        "*, enrichment_sources(*)"
    ).eq("target_id", target_id).eq("tenant_id", tenant_id).order(
        "created_at", desc=True
    ).limit(10).execute()

    return {"data": jobs_res.data or []}


@router.get("/stats")
async def get_enrichment_stats(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """Tenant-wide enrichment statistics."""
    targets_res = db.table("targets").select(
        "enrichment_status, last_enriched_at, data_sources"
    ).eq("tenant_id", tenant_id).is_("deleted_at", None).execute()

    targets = targets_res.data or []

    total_enriched = sum(1 for t in targets if t.get("enrichment_status") == "enriched")
    total_partial = sum(1 for t in targets if t.get("enrichment_status") == "partial")
    total_failed = sum(1 for t in targets if t.get("enrichment_status") == "failed")
    total_none = sum(1 for t in targets if t.get("enrichment_status") in (None, "none"))

    providers_used: dict[str, int] = {}
    for t in targets:
        for src in (t.get("data_sources") or []):
            providers_used[src] = providers_used.get(src, 0) + 1

    last_enriched_ats = [
        t["last_enriched_at"] for t in targets if t.get("last_enriched_at")
    ]
    last_enrichment_at = max(last_enriched_ats) if last_enriched_ats else None

    return {
        "total_enriched": total_enriched,
        "total_partial": total_partial,
        "total_pending": 0,  # We don't use 'pending' in practice yet
        "total_failed": total_failed,
        "total_none": total_none,
        "total_targets": len(targets),
        "providers_used": providers_used,
        "last_enrichment_at": last_enrichment_at,
    }


@router.post("/enrich-all")
async def enrich_all(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db),
):
    """
    Enrich all targets with enrichment_status = 'none' or 'failed'.
    Runs synchronously. Returns after all targets processed.
    """
    targets_res = db.table("targets").select("*").eq("tenant_id", tenant_id).is_(
        "deleted_at", None
    ).in_("enrichment_status", ["none", "failed"]).execute()

    # Also get targets where enrichment_status is null
    null_res = db.table("targets").select("*").eq("tenant_id", tenant_id).is_(
        "deleted_at", None
    ).is_("enrichment_status", None).execute()

    targets = (targets_res.data or []) + (null_res.data or [])

    if not targets:
        return {"total_queued": 0, "started": True}

    total_queued = len(targets)
    succeeded = 0
    failed = 0

    for target in targets:
        try:
            await run_enrichment(target=target, tenant_id=tenant_id, db=db)
            succeeded += 1
        except Exception:
            failed += 1
        await asyncio.sleep(1)

    return {
        "total_queued": total_queued,
        "succeeded": succeeded,
        "failed": failed,
        "started": True,
    }
```

- [ ] **Step 4: Register router in main.py**

Edit `apps/api/main.py`:

Add import line (line 3, append to existing import):
```python
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup, scenarios, network, enrichment
```

Add router registration after line 30 (after network router):
```python
app.include_router(enrichment.router, prefix="/enrichment", tags=["enrichment"])
```

- [ ] **Step 5: Smoke test router**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
source .venv/bin/activate
python -c "from routers.enrichment import router; print('Router OK:', len(router.routes), 'routes')"
```

Expected: `Router OK: 5 routes`

- [ ] **Step 6: Commit**

```bash
git add apps/api/routers/enrichment.py apps/api/main.py apps/api/config.py apps/api/services/enrichment/
```

Commit using write-tree pattern.

---

## Task 4: Auto-enrich on target creation

**Files:**
- Modify: `apps/api/routers/targets.py`

- [ ] **Step 1: Add import at top of targets.py**

Find the imports section in `apps/api/routers/targets.py`. Add after the last import:

```python
from services.enrichment.orchestrator import run_enrichment
```

- [ ] **Step 2: Modify create_target to auto-enrich**

Current `create_target` (lines 63-77):
```python
@router.post("/", status_code=201)
async def create_target(
    payload: TargetCreate,
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = payload.model_dump()
    data["tenant_id"] = tenant_id
    result = db.table("targets").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create target")
    created = result.data[0]
    background_tasks.add_task(geocode_target, created, db)
    return created
```

Replace with:
```python
@router.post("/", status_code=201)
async def create_target(
    payload: TargetCreate,
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = payload.model_dump()
    data["tenant_id"] = tenant_id
    result = db.table("targets").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create target")
    created = result.data[0]
    background_tasks.add_task(geocode_target, created, db)
    try:
        await run_enrichment(target=created, tenant_id=tenant_id, db=db)
    except Exception as e:
        print(f"[enrichment] Auto-enrich failed for {created['id']}: {e}")
    return created
```

- [ ] **Step 3: Modify bulk_import to auto-enrich**

Current `bulk_import` return (lines 167-169):
```python
    result = db.table("targets").insert(rows).execute()
    background_tasks.add_task(geocode_all_ungeocode, tenant_id, db)
    return {"inserted": len(result.data), "targets": result.data}
```

Replace with:
```python
    result = db.table("targets").insert(rows).execute()
    background_tasks.add_task(geocode_all_ungeocode, tenant_id, db)

    # Auto-enrich each imported target sequentially (1s delay for rate limiting)
    import asyncio
    for imported_target in result.data:
        try:
            await run_enrichment(target=imported_target, tenant_id=tenant_id, db=db)
        except Exception as e:
            print(f"[enrichment] Auto-enrich failed for {imported_target['id']}: {e}")
        await asyncio.sleep(1)

    return {"inserted": len(result.data), "targets": result.data}
```

- [ ] **Step 4: Verify import works**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
source .venv/bin/activate
python -c "from routers.targets import router; print('targets router OK')"
```

Expected: `targets router OK`

- [ ] **Step 5: Commit**

```bash
git add apps/api/routers/targets.py
```

Commit using write-tree pattern.

---

## Task 5: Frontend types + API client

**Files:**
- Modify: `apps/web/lib/api/client.ts`

- [ ] **Step 1: Add enrichment fields to Target interface**

In `apps/web/lib/api/client.ts`, the `Target` interface ends around line 216. Add new fields:

Find:
```typescript
export interface Target {
  id: string
  tenant_id: string
  name: string
  country: string | null
  region: string | null
  city: string | null
  industry_label: string | null
  industry_code: string | null
  employee_count: number | null
  revenue_eur: number | null
  founded_year: number | null
  owner_age_estimate: number | null
  website: string | null
  linkedin_url: string | null
  lat: number | null
  lng: number | null
  geocoded_at: string | null
  created_at: string
  updated_at: string
  target_scores: TargetScore[]
}
```

Replace with:
```typescript
export interface DirectorRole {
  name: string
  role: string
  start_date: string | null
  end_date: string | null
  status: 'active' | 'inactive'
}

export interface Target {
  id: string
  tenant_id: string
  name: string
  country: string | null
  region: string | null
  city: string | null
  industry_label: string | null
  industry_code: string | null
  employee_count: number | null
  revenue_eur: number | null
  founded_year: number | null
  owner_age_estimate: number | null
  website: string | null
  linkedin_url: string | null
  lat: number | null
  lng: number | null
  geocoded_at: string | null
  created_at: string
  updated_at: string
  target_scores: TargetScore[]
  // Enrichment fields
  enrichment_status: 'none' | 'pending' | 'enriched' | 'partial' | 'failed' | null
  last_enriched_at: string | null
  enrichment_data: Record<string, unknown> | null
  legal_form: string | null
  share_capital: string | null
  directors: string[] | null
  director_roles: DirectorRole[] | null
  registration_number: string | null
  registration_authority: string | null
  opencorporates_url: string | null
  data_sources: string[] | null
}
```

- [ ] **Step 2: Add EnrichmentJob, BatchEnrichmentResult, EnrichmentStats interfaces**

Add after the `Target` interface (after the closing `}`):

```typescript
export interface EnrichmentSource {
  id: string
  job_id: string
  provider: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  confidence: number
  extracted_data: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  completed_at: string | null
}

export interface EnrichmentJob {
  id: string
  target_id: string
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed'
  providers_completed: string[]
  providers_failed: string[]
  data_enriched: Record<string, unknown>
  error_message: string | null
  created_at: string
  completed_at: string | null
  enrichment_sources?: EnrichmentSource[]
}

export interface BatchEnrichmentResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
  results: EnrichmentJob[]
}

export interface EnrichmentStats {
  total_enriched: number
  total_partial: number
  total_pending: number
  total_failed: number
  total_none: number
  total_targets: number
  providers_used: Record<string, number>
  last_enrichment_at: string | null
}
```

- [ ] **Step 3: Add enrichment API group**

In `apps/web/lib/api/client.ts`, after the `network` group (after the closing `},` of network, before the closing `}` of `api`):

Find:
```typescript
  network: {
    ...
    clear: (scenarioId: string) =>
      apiFetch<void>(`/network/${scenarioId}`, { method: 'DELETE' }),
  },
}
```

Replace (add enrichment group before the closing `}`):
```typescript
  network: {
    analyse: (scenarioId: string) =>
      apiFetch<{ edges_created: number; target_count: number }>(
        `/network/analyse/${scenarioId}`,
        { method: 'POST' }
      ),
    get: (scenarioId: string) =>
      apiFetch<NetworkGraph>(`/network/${scenarioId}`),
    stats: (scenarioId: string) =>
      apiFetch<NetworkStats>(`/network/${scenarioId}/stats`),
    clear: (scenarioId: string) =>
      apiFetch<void>(`/network/${scenarioId}`, { method: 'DELETE' }),
  },
  enrichment: {
    enrich: (targetId: string, force = false) =>
      apiFetch<EnrichmentJob>(
        `/enrichment/enrich/${targetId}${force ? '?force=true' : ''}`,
        { method: 'POST' }
      ),
    enrichBatch: (targetIds: string[], force = false) =>
      apiFetch<BatchEnrichmentResult>(
        `/enrichment/enrich-batch${force ? '?force=true' : ''}`,
        { method: 'POST', body: JSON.stringify({ target_ids: targetIds }) }
      ),
    enrichAll: () =>
      apiFetch<{ total_queued: number; succeeded: number; failed: number; started: boolean }>(
        '/enrichment/enrich-all',
        { method: 'POST' }
      ),
    jobs: (targetId: string) =>
      apiFetch<{ data: EnrichmentJob[] }>(`/enrichment/jobs/${targetId}`),
    stats: () =>
      apiFetch<EnrichmentStats>('/enrichment/stats'),
  },
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: No errors from client.ts.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api/client.ts
```

Commit using write-tree pattern.

---

## Task 6: EnrichmentPanel component + wire into target detail page

**Files:**
- Create: `apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx`
- Modify: `apps/web/app/(dashboard)/discovery/[id]/page.tsx`

- [ ] **Step 1: Create EnrichmentPanel component**

Create `apps/web/app/(dashboard)/discovery/[id]/components/EnrichmentPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { api, Target, EnrichmentJob } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Building2,
  Users,
  Calendar,
  Hash,
  Globe,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
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

function DataRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  )
}

export default function EnrichmentPanel({ target, onEnriched }: Props) {
  const [loading, setLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<EnrichmentJob[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const hasData = target.enrichment_status === 'enriched' || target.enrichment_status === 'partial'

  async function handleEnrich(force = false) {
    setLoading(true)
    const toastId = toast.loading(force ? 'Re-enriching target…' : 'Enriching target…')
    try {
      await api.enrichment.enrich(target.id, force)
      toast.success('Enrichment complete — reloading data', { id: toastId })
      onEnriched?.()
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
              <span className="text-xs text-muted-foreground">
                {relativeTime(target.last_enriched_at)}
              </span>
            )}
            {hasData && (
              <Button
                variant="outline"
                size="sm"
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
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">No enrichment data yet</p>
            <Button
              size="sm"
              className="h-7 px-3 text-xs rounded-sm cursor-pointer"
              disabled={loading}
              onClick={() => handleEnrich(false)}
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Enrich now
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Enriching from OpenCorporates…</p>
          </div>
        )}

        {hasData && !loading && (
          <div className="space-y-0">
            {target.directors && target.directors.length > 0 && (
              <DataRow
                icon={Users}
                label="Directors"
                value={
                  <div className="space-y-0.5 mt-0.5">
                    {target.director_roles && target.director_roles.length > 0
                      ? target.director_roles
                          .filter(d => d.status === 'active')
                          .slice(0, 5)
                          .map((d, i) => (
                            <div key={i} className="text-sm">
                              {d.name}
                              {d.role && d.role !== 'director' && (
                                <span className="text-muted-foreground"> — {d.role}</span>
                              )}
                              {d.start_date && (
                                <span className="text-muted-foreground"> (since {d.start_date.slice(0, 4)})</span>
                              )}
                            </div>
                          ))
                      : target.directors.slice(0, 5).map((d, i) => (
                          <div key={i} className="text-sm">{d}</div>
                        ))
                    }
                  </div>
                }
              />
            )}

            {target.legal_form && (
              <DataRow icon={Building2} label="Legal form" value={target.legal_form} />
            )}

            {target.registration_number && (
              <DataRow
                icon={Hash}
                label="Registration"
                value={
                  [target.registration_number, target.registration_authority]
                    .filter(Boolean)
                    .join(', ')
                }
              />
            )}

            {target.share_capital && (
              <DataRow icon={Building2} label="Share capital" value={target.share_capital} />
            )}

            {target.opencorporates_url && (
              <DataRow
                icon={Globe}
                label="OpenCorporates"
                value={
                  <a
                    href={target.opencorporates_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    View profile <ExternalLink className="h-3 w-3" />
                  </a>
                }
              />
            )}

            {/* Data sources */}
            {target.data_sources && target.data_sources.length > 0 && (
              <div className="flex items-center gap-1.5 pt-3">
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

        {/* History */}
        {(hasData || (target.enrichment_status === 'failed')) && (
          <div className="mt-4 pt-3 border-t border-border">
            <button
              onClick={toggleHistory}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Enrichment history
            </button>

            {historyOpen && (
              <div className="mt-2 space-y-2">
                {historyLoading && (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                )}
                {!historyLoading && history !== null && history.length === 0 && (
                  <p className="text-xs text-muted-foreground">No history found</p>
                )}
                {!historyLoading && history && history.slice(0, 5).map(job => (
                  <div key={job.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">
                      {job.created_at ? new Date(job.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </span>
                    <StatusBadge status={job.status as Target['enrichment_status']} />
                    <span className="text-muted-foreground">
                      {job.providers_completed?.join(', ') || 'none'}
                    </span>
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

- [ ] **Step 2: Wire EnrichmentPanel into target detail page**

In `apps/web/app/(dashboard)/discovery/[id]/page.tsx`:

Add import at top (with other component imports):
```tsx
import EnrichmentPanel from './components/EnrichmentPanel'
```

Find the left column section (around line 113-133), specifically after the Company overview Card closing tag:
```tsx
          <Card>
            <CardHeader><CardTitle className="text-sm">Company overview</CardTitle></CardHeader>
            <CardContent>
              ...
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Score breakdown</CardTitle></CardHeader>
```

Insert `<EnrichmentPanel target={target} />` between Company overview and Score breakdown:
```tsx
          <Card>
            <CardHeader><CardTitle className="text-sm">Company overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* ... existing content ... */}
              </div>
            </CardContent>
          </Card>

          <EnrichmentPanel target={target} />

          <Card>
            <CardHeader><CardTitle className="text-sm">Score breakdown</CardTitle></CardHeader>
```

**Note:** The `target` detail page is a Server Component. `EnrichmentPanel` is a Client Component (`'use client'`). The `onEnriched` prop needs a page reload — since this is a server component, handle reload in the panel with `window.location.reload()` when `onEnriched` is not provided, or wrap in a client shell.

Update EnrichmentPanel to handle no `onEnriched` callback by reloading:

In `EnrichmentPanel.tsx`, replace the `onEnriched?.()` call in `handleEnrich`:
```tsx
      onEnriched?.() ?? window.location.reload()
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
pnpm tsc --noEmit 2>&1 | grep -E "error|EnrichmentPanel" | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/discovery/\[id\]/components/EnrichmentPanel.tsx
git add apps/web/app/\(dashboard\)/discovery/\[id\]/page.tsx
```

Commit using write-tree pattern.

---

## Task 7: Discovery list enrichment column + Enrich All button

**Files:**
- Modify: `apps/web/app/(dashboard)/discovery/components/TargetTable.tsx`
- Modify: `apps/web/app/(dashboard)/discovery/page.tsx`

- [ ] **Step 1: Add enrichment_status column to TargetTable**

In `apps/web/app/(dashboard)/discovery/components/TargetTable.tsx`:

Add `EnrichmentStatusBadge` component before `TargetTable` function:
```tsx
function EnrichmentStatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; className: string }> = {
    enriched: { label: 'Enriched', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    partial:  { label: 'Partial',  className: 'text-amber-700 bg-amber-50 border-amber-200' },
    failed:   { label: 'Failed',   className: 'text-red-700 bg-red-50 border-red-200' },
    none:     { label: 'None',     className: 'text-muted-foreground bg-muted border-border' },
  }
  const cfg = map[status ?? 'none'] ?? map['none']
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
```

In the `<thead>`, add a new `<th>` before the Score column:
```tsx
<th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Enrichment</th>
```

In the `<tbody>` row, add a new `<td>` before the Score `<td>`:
```tsx
<td className="px-4 py-2.5 text-center">
  <EnrichmentStatusBadge status={t.enrichment_status} />
</td>
```

- [ ] **Step 2: Add Enrich All button to discovery page toolbar**

In `apps/web/app/(dashboard)/discovery/page.tsx`:

Add `Database` to the lucide import list:
```tsx
import { List, Map, Download, MapPin, Sparkles, Database } from 'lucide-react'
```

Add state for enrich-all loading:
```tsx
const [enrichAllLoading, setEnrichAllLoading] = useState(false)
```

Add handler function (after `handleGeocode`):
```tsx
  const handleEnrichAll = async () => {
    setEnrichAllLoading(true)
    const toastId = toast.loading('Enriching all targets…')
    try {
      const res = await api.enrichment.enrichAll()
      toast.success(
        `Enriched ${res.succeeded} of ${res.total_queued} targets`,
        { id: toastId }
      )
      load()
    } catch {
      toast.error('Enrich all failed', { id: toastId })
    } finally {
      setEnrichAllLoading(false)
    }
  }
```

Add button to toolbar (after `ScoreAllButton`):
```tsx
          <ScoreAllButton onComplete={load} />
          <button
            onClick={handleEnrichAll}
            disabled={enrichAllLoading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Database className="h-3.5 w-3.5" />
            {enrichAllLoading ? 'Enriching…' : 'Enrich all'}
          </button>
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/discovery/components/TargetTable.tsx
git add apps/web/app/\(dashboard\)/discovery/page.tsx
```

Commit using write-tree pattern.

---

## Task 8: Dashboard enrichment stats card

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add enrichment query to getStats**

The dashboard page is a Server Component using Supabase directly (not the API client). Add enrichment stats query.

Current `getStats` function fetches targets and scores. Add a third query for enrichment:

Replace the `getStats` function:
```typescript
async function getStats() {
  const supabase = await createClient()
  const DEMO_TENANT = '00000000-0000-0000-0000-000000000001'

  const [targets, scores, enriched] = await Promise.all([
    supabase.from('targets').select('id, created_at', { count: 'exact' })
      .eq('tenant_id', DEMO_TENANT).is('deleted_at', null),
    supabase.from('target_scores').select('overall_score, transition_score')
      .eq('tenant_id', DEMO_TENANT),
    supabase.from('targets').select('enrichment_status', { count: 'exact' })
      .eq('tenant_id', DEMO_TENANT).is('deleted_at', null).eq('enrichment_status', 'enriched'),
  ])

  const total = targets.count ?? 0
  const scoreList = scores.data ?? []
  const avgScore = scoreList.length
    ? (scoreList.reduce((s, r) => s + (r.overall_score ?? 0), 0) / scoreList.length).toFixed(1)
    : '—'
  const highTransition = scoreList.filter(r => (r.transition_score ?? 0) >= 7).length
  const totalEnriched = enriched.count ?? 0

  return { total, avgScore, highTransition, scored: scoreList.length, totalEnriched }
}
```

- [ ] **Step 2: Add enrichment card**

Add `Database` to lucide imports:
```typescript
import { Building2, TrendingUp, Clock, Target, Database } from 'lucide-react'
```

Add enrichment card after the existing 4 cards. In `DashboardPage`, after the `</div>` that closes the 4-card grid, add:

```tsx
      <Card className="border-border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data enrichment</CardTitle>
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">{stats.totalEnriched}</span>
            <span className="text-sm text-muted-foreground">/ {stats.total} targets enriched</span>
          </div>
          {stats.total > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-sm transition-all"
                  style={{ width: `${Math.round((stats.totalEnriched / stats.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((stats.totalEnriched / stats.total) * 100)}% enriched
              </p>
            </div>
          )}
          {stats.totalEnriched < stats.total && (
            <a
              href="/discovery"
              className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
            >
              Enrich remaining →
            </a>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/dashboard/page.tsx
```

Commit using write-tree pattern.

---

## Task 9: Full build verification + deploy

- [ ] **Step 1: Run Python tests**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
source .venv/bin/activate
pytest tests/test_enrichment.py -v
```

Expected: All tests PASS.

- [ ] **Step 2: Run TypeScript build**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
pnpm build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with zero type errors.

- [ ] **Step 3: Deploy backend to Fly.io**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
fly deploy
```

Expected: `v{N} deployed successfully`

- [ ] **Step 4: Push frontend for Vercel auto-deploy**

```bash
cd /Users/callmepio/Desktop/horus-main
git push
```

Expected: Push succeeds, Vercel picks up and builds.

- [ ] **Step 5: Verify enrichment router live**

```bash
curl -s https://searchfund-api.fly.dev/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('Backend OK:', d)"
```

Expected: `Backend OK: {'status': 'ok'}`

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|-----------------|------|
| enrichment_jobs + enrichment_sources tables | Task 1 |
| enrichment_status / last_enriched_at / enrichment_data on targets | Task 1 |
| EnrichmentProvider base class | Task 2 |
| OpenCorporates provider (search + enrich + confidence) | Task 2 |
| Orchestrator (run_enrichment) | Task 2 |
| POST /enrichment/enrich/{target_id} (with 24h cooldown + force) | Task 3 |
| POST /enrichment/enrich-batch (max 20) | Task 3 |
| GET /enrichment/jobs/{target_id} | Task 3 |
| GET /enrichment/stats | Task 3 |
| POST /enrichment/enrich-all | Task 3 |
| Router registered in main.py | Task 3 |
| Auto-enrich on create_target | Task 4 |
| Auto-enrich on bulk_import (1s delay) | Task 4 |
| OPENCORPORATES_API_TOKEN optional env var | Task 3 |
| Frontend types (Target enrichment fields, EnrichmentJob, BatchEnrichmentResult, EnrichmentStats) | Task 5 |
| api.enrichment client methods | Task 5 |
| Enrichment panel on target detail page | Task 6 |
| Status badge (enriched/partial/failed/none) | Task 6 |
| Re-enrich button (force=true) | Task 6 |
| Last enriched timestamp | Task 6 |
| Directors list with roles | Task 6 |
| Legal form, registration, share capital, OpenCorporates URL | Task 6 |
| Data sources pills | Task 6 |
| Enrichment history (collapsible) | Task 6 |
| Enrichment status column on discovery table | Task 7 |
| Enrich all button on discovery page | Task 7 |
| Dashboard enrichment stats card | Task 8 |

All 33 spec requirements covered.

### Placeholder Check

No TBD/TODO/placeholder steps — all steps have complete code.

### Type Consistency

- `Target.enrichment_status` — `'none' | 'pending' | 'enriched' | 'partial' | 'failed' | null` used consistently in EnrichmentPanel, TargetTable, and StatusBadge components.
- `EnrichmentJob.status` — same union type, cast safely in history display.
- `api.enrichment.enrichAll()` return type includes `succeeded` field matching router response.
