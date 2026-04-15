"""
Tests for enrichment orchestrator and providers.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock


# ── Provider name ─────────────────────────────────────────────────────────────

def test_provider_name_defined():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    provider = OpenCorporatesProvider()
    assert provider.name == "opencorporates"


# ── Country mapping ───────────────────────────────────────────────────────────

def test_country_to_code_known():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    assert p._country_to_code("Germany") == "de"
    assert p._country_to_code("ITALIA") == "it"
    assert p._country_to_code("france") == "fr"


def test_country_to_code_portugal():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
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
async def test_confidence_country_and_city_boost():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    target = {"name": "Müller GmbH", "country": "Germany", "city": "Munich"}
    result = {"_match_score": 0.8, "jurisdiction_code": "de", "registered_address_in_full": "Munich"}
    score = await p.confidence_score(target, result)
    assert score == 1.0  # 0.8 + 0.15 + 0.10 = 1.05 → capped at 1.0


@pytest.mark.asyncio
async def test_confidence_no_boost():
    from services.enrichment.opencorporates import OpenCorporatesProvider
    p = OpenCorporatesProvider()
    target = {"name": "Acme Corp", "country": "France", "city": "Lyon"}
    result = {"_match_score": 0.6, "jurisdiction_code": "de", "registered_address_in_full": "Berlin"}
    score = await p.confidence_score(target, result)
    assert score == 0.6


# ── Orchestrator ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_orchestrator_skips_low_confidence():
    from services.enrichment.orchestrator import run_enrichment

    fake_provider = MagicMock()
    fake_provider.name = "fake"
    fake_provider.search = AsyncMock(return_value={"name": "Wrong Corp"})
    fake_provider.confidence_score = AsyncMock(return_value=0.2)
    fake_provider.enrich = AsyncMock(return_value={"legal_form": "AG"})

    mock_db = _make_mock_db()
    target = {"id": "test-target-id", "name": "Test GmbH", "country": "Germany", "city": "Berlin"}

    await run_enrichment(target=target, tenant_id="test-tenant-id", db=mock_db, providers=[fake_provider])

    fake_provider.enrich.assert_not_called()


@pytest.mark.asyncio
async def test_orchestrator_calls_enrich_on_good_confidence():
    from services.enrichment.orchestrator import run_enrichment

    fake_provider = MagicMock()
    fake_provider.name = "fake"
    fake_provider.search = AsyncMock(return_value={"name": "Test GmbH", "jurisdiction_code": "de"})
    fake_provider.confidence_score = AsyncMock(return_value=0.85)
    fake_provider.enrich = AsyncMock(return_value={"legal_form": "GmbH", "registration_number": "HRB 12345"})

    mock_db = _make_mock_db()
    target = {"id": "test-target-id", "name": "Test GmbH", "country": "Germany", "city": "Berlin"}

    await run_enrichment(target=target, tenant_id="test-tenant-id", db=mock_db, providers=[fake_provider])

    fake_provider.enrich.assert_called_once()


@pytest.mark.asyncio
async def test_orchestrator_handles_provider_exception():
    from services.enrichment.orchestrator import run_enrichment

    failing_provider = MagicMock()
    failing_provider.name = "failing"
    failing_provider.search = AsyncMock(side_effect=Exception("Network error"))

    mock_db = _make_mock_db()
    target = {"id": "test-target-id", "name": "Test Corp", "country": "France", "city": "Paris"}

    # Should not raise — exceptions are caught and recorded
    await run_enrichment(target=target, tenant_id="test-tenant-id", db=mock_db, providers=[failing_provider])


@pytest.mark.asyncio
async def test_orchestrator_skips_no_search_result():
    from services.enrichment.orchestrator import run_enrichment

    no_result_provider = MagicMock()
    no_result_provider.name = "empty"
    no_result_provider.search = AsyncMock(return_value=None)
    no_result_provider.confidence_score = AsyncMock(return_value=0.0)
    no_result_provider.enrich = AsyncMock(return_value={})

    mock_db = _make_mock_db()
    target = {"id": "test-target-id", "name": "Unknown Corp", "country": "Nowhere"}

    await run_enrichment(target=target, tenant_id="test-tenant-id", db=mock_db, providers=[no_result_provider])

    no_result_provider.enrich.assert_not_called()
    no_result_provider.confidence_score.assert_not_called()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_mock_db():
    job_data = {"id": "test-job-id", "status": "running"}

    mock_execute = MagicMock()
    mock_execute.data = [job_data]

    single_mock = MagicMock()
    single_mock.data = {**job_data, "status": "completed"}

    chain = MagicMock()
    chain.execute = MagicMock(return_value=mock_execute)
    chain.eq = MagicMock(return_value=chain)
    chain.single = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=single_mock)))
    chain.insert = MagicMock(return_value=chain)
    chain.update = MagicMock(return_value=chain)
    chain.select = MagicMock(return_value=chain)

    mock_db = MagicMock()
    mock_db.table = MagicMock(return_value=chain)
    return mock_db
