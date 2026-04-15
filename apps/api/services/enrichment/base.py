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
        How confident this match is correct. Returns 0.0-1.0.
        """
        pass
