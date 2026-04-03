from pydantic import BaseModel, UUID4
from typing import Optional
from datetime import datetime

class ScoreResult(BaseModel):
    transition_score: float
    value_score: float
    market_score: float
    financial_score: float
    overall_score: float
    rationale: str
    key_signals: list[str]

class TargetScore(ScoreResult):
    id: UUID4
    target_id: UUID4
    tenant_id: UUID4
    scored_at: datetime
    model_version: str = "v1"
