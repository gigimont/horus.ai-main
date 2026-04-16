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
