"""Tests for website URL discovery."""
import pytest
from services.enrichment.website_discovery import _to_slug, _candidate_domains, discover_website
from unittest.mock import AsyncMock, patch, MagicMock


def test_slug_strips_legal_form():
    assert _to_slug("Müller Haustechnik GmbH") == "mueller-haustechnik"
    assert _to_slug("Siemens AG") == "siemens"
    assert _to_slug("Bauer GmbH & Co. KG") == "bauer"


def test_slug_handles_umlauts():
    assert _to_slug("Müller GmbH") == "mueller"
    assert _to_slug("Göbel AG") == "goebel"


def test_candidate_domains_german_company():
    candidates = _candidate_domains("Müller Haustechnik GmbH", "Germany")
    assert any(".de" in c for c in candidates)
    assert any("mueller-haustechnik" in c for c in candidates)


def test_candidate_domains_austrian_company():
    candidates = _candidate_domains("Bauer AG", "Austria")
    assert candidates[0].endswith(".at") or ".at" in candidates[0]


def test_candidate_domains_empty_name():
    candidates = _candidate_domains("GmbH", "Germany")
    # After stripping legal form, nothing left — empty or only .de
    # Should not crash
    assert isinstance(candidates, list)


@pytest.mark.asyncio
async def test_discover_website_returns_none_when_all_fail():
    """When all HTTP checks fail, return None."""
    with patch("services.enrichment.website_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.head = AsyncMock(side_effect=Exception("timeout"))
        mock_client.get = AsyncMock(side_effect=Exception("timeout"))
        mock_client_cls.return_value = mock_client
        result = await discover_website("Unknown Corp XYZ", "Germany")
        assert result is None
