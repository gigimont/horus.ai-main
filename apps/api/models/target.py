from pydantic import BaseModel, UUID4
from typing import Optional
from datetime import datetime

class TargetBase(BaseModel):
    name: str
    country: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    industry_code: Optional[str] = None
    industry_label: Optional[str] = None
    employee_count: Optional[int] = None
    revenue_eur: Optional[int] = None
    founded_year: Optional[int] = None
    owner_age_estimate: Optional[int] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None

class TargetCreate(TargetBase):
    pass

class Target(TargetBase):
    id: UUID4
    tenant_id: UUID4
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
