"""
Website URL auto-discovery.
Since Jina Search requires auth, we use heuristic domain construction:
  1. Normalize company name → candidate domains
  2. Verify candidates with HTTP HEAD request
  3. Return first responding URL or None
"""
import re
import unicodedata
import httpx
from typing import Optional


# Legal form suffixes to strip from company name before building domain
_LEGAL_FORMS = re.compile(
    r'\b(GmbH|AG|KG|OHG|GbR|eG|SE|UG|e\.V\.|e\.G\.|GmbH\s*&\s*Co\.?\s*KG|'
    r'Ltd|LLC|Inc|Corp|SRL|SAS|BV|NV|SA|Ltda|Pty)\b',
    re.IGNORECASE
)
_PUNCT = re.compile(r'[^\w\s-]')
_MULTI_SPACE = re.compile(r'\s+')
_UMLAUT_MAP = str.maketrans({'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue'})
# Orphaned connector remnants left after legal form stripping (e.g. "& Co." from "GmbH & Co. KG")
_ORPHAN_CO = re.compile(r'(&\s*Co\.?|&)', re.IGNORECASE)


def _to_slug(text: str) -> str:
    """Convert text to URL-safe slug: strip legal forms, transliterate, lowercase, hyphenate."""
    text = text.translate(_UMLAUT_MAP)
    text = _LEGAL_FORMS.sub('', text)
    # Strip orphaned connectors left by legal-form removal (e.g. "& Co." from "GmbH & Co. KG")
    text = _ORPHAN_CO.sub('', text)
    text = _PUNCT.sub('', text)
    text = _MULTI_SPACE.sub('-', text.strip())
    return text.strip('-').lower()


def _candidate_domains(company_name: str, country: str = "") -> list[str]:
    """Generate candidate domains from company name."""
    slug = _to_slug(company_name)
    if not slug:
        return []

    # Also try stripping common connectors
    slug_compact = slug.replace('-', '')

    # Country TLD preference
    tld = "de"
    country_lower = (country or "").lower()
    if "austria" in country_lower or country_lower in ("at", "österreich", "oesterreich"):
        tld = "at"
    elif "switzerland" in country_lower or country_lower in ("ch", "schweiz"):
        tld = "ch"
    elif "netherlands" in country_lower or country_lower in ("nl",):
        tld = "nl"
    elif "france" in country_lower or country_lower in ("fr",):
        tld = "fr"
    elif "italy" in country_lower or country_lower in ("it", "italia"):
        tld = "it"
    elif "spain" in country_lower or country_lower in ("es", "españa"):
        tld = "es"
    elif "poland" in country_lower or country_lower in ("pl",):
        tld = "pl"
    elif "uk" in country_lower or "united kingdom" in country_lower or "great britain" in country_lower:
        tld = "co.uk"

    candidates = []
    for s in [slug, slug_compact]:
        if not s:
            continue
        candidates.append(f"https://www.{s}.{tld}")
        candidates.append(f"https://{s}.{tld}")
        if tld != "com":
            candidates.append(f"https://www.{s}.com")
            candidates.append(f"https://{s}.com")

    # Deduplicate preserving order
    seen = set()
    unique = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


async def _verify_url(url: str, client: httpx.AsyncClient) -> bool:
    """Return True if URL responds with HTTP 200-399."""
    try:
        resp = await client.head(url, timeout=8.0, follow_redirects=True)
        return resp.status_code < 400
    except Exception:
        try:
            # Some servers reject HEAD — try GET with short read
            resp = await client.get(url, timeout=8.0, follow_redirects=True)
            return resp.status_code < 400
        except Exception:
            return False


async def discover_website(company_name: str, country: str = "", city: str = "") -> Optional[str]:
    """
    Discover company website via heuristic domain construction + HTTP verification.
    Returns first verified URL or None.
    """
    candidates = _candidate_domains(company_name, country)
    if not candidates:
        return None

    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0 (compatible; HorusAI/1.0)"},
        verify=False,  # Some SME sites have self-signed certs
    ) as client:
        for url in candidates[:6]:  # Try up to 6 candidates
            if await _verify_url(url, client):
                return url
    return None
