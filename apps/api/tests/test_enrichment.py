"""
Tests for enrichment orchestrator and GLEIF provider.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock


# ── Provider name ─────────────────────────────────────────────────────────────

def test_provider_name_defined():
    from services.enrichment.gleif import GLEIFProvider
    provider = GLEIFProvider()
    assert provider.name == "gleif"


# ── Country mapping ───────────────────────────────────────────────────────────

def test_country_to_code_known():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    assert p._country_to_code("Germany") == "DE"
    assert p._country_to_code("ITALIA") == "IT"
    assert p._country_to_code("france") == "FR"


def test_country_to_code_portugal():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    assert p._country_to_code("Portugal") == "PT"


def test_country_to_code_two_letter_passthrough():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    assert p._country_to_code("de") == "DE"
    assert p._country_to_code("PL") == "PL"


# ── Year extraction ───────────────────────────────────────────────────────────

def test_extract_year_valid():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    assert p._extract_year("1987-03-15T00:00:00Z") == 1987
    assert p._extract_year("2003-01-01T00:00:00Z") == 2003


def test_extract_year_none():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    assert p._extract_year(None) is None
    assert p._extract_year("") is None


# ── Legal form extraction ─────────────────────────────────────────────────────

def test_extract_legal_form_gmbh():
    from services.enrichment.gleif import _extract_legal_form
    assert _extract_legal_form("Müller Haustechnik GmbH") == "GmbH"


def test_extract_legal_form_ag():
    from services.enrichment.gleif import _extract_legal_form
    assert _extract_legal_form("Siemens Aktiengesellschaft") == "Aktiengesellschaft"
    assert _extract_legal_form("Siemens AG") == "AG"


def test_extract_legal_form_gmbh_co_kg():
    from services.enrichment.gleif import _extract_legal_form
    assert _extract_legal_form("Müller GmbH & Co. KG") == "GmbH & Co. KG"


def test_extract_legal_form_none():
    from services.enrichment.gleif import _extract_legal_form
    assert _extract_legal_form("Unknown Holdings") is None


# ── Confidence scoring ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confidence_country_and_city_boost():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    target = {"name": "Müller GmbH", "country": "Germany", "city": "Munich"}
    # Simulate GLEIF record structure
    result = {
        "_match_score": 0.8,
        "attributes": {
            "lei": "TESTLEI",
            "entity": {
                "legalAddress": {"country": "DE", "city": "Munich"},
                "jurisdiction": "DE",
                "status": "ACTIVE",
            },
        },
    }
    score = await p.confidence_score(target, result)
    # 0.8 + 0.15 (country) + 0.05 (jurisdiction) + 0.10 (city) = 1.1 → capped at 1.0
    assert score == 1.0


@pytest.mark.asyncio
async def test_confidence_no_boost():
    from services.enrichment.gleif import GLEIFProvider
    p = GLEIFProvider()
    target = {"name": "Acme Corp", "country": "France", "city": "Lyon"}
    result = {
        "_match_score": 0.6,
        "attributes": {
            "lei": "TESTLEI",
            "entity": {
                "legalAddress": {"country": "DE", "city": "Berlin"},
                "jurisdiction": "DE",
                "status": "ACTIVE",
            },
        },
    }
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
    import json
    from unittest.mock import MagicMock, patch
    from services.enrichment.web_enrichment import WebEnrichmentProvider
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
    mock_content = MagicMock()
    mock_content.text = json.dumps(mock_response)
    mock_message = MagicMock()
    mock_message.content = [mock_content]
    target = {"name": "Müller GmbH", "industry_label": "HVAC", "city": "München", "country": "Germany"}
    search_result = {"content": "some website content here", "url": "https://example.com", "source": "jina", "content_length": 500}
    with patch.object(p.client, 'messages') as mock_messages:
        mock_messages.create.return_value = mock_message
        result = await p.enrich(target, search_result)
    assert result["directors"] == ["Hans Müller"]
    assert result["is_family_business"] is True
    assert result["succession_risk"] == "high"
    assert result["founder_age_estimate"] == "62-67"
