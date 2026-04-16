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
