import anthropic
from config import settings

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

async def score_target(target_data: dict) -> dict:
    """Stub — returns mock scores. Will be implemented in Session 3."""
    return {
        "transition_score": 7.5,
        "value_score": 6.8,
        "market_score": 7.2,
        "financial_score": 6.5,
        "overall_score": 7.0,
        "rationale": "Mock score — Claude integration pending.",
        "key_signals": ["owner age signal", "industry fragmentation", "revenue size"]
    }
