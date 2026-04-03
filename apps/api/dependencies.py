from fastapi import Depends, HTTPException, Header
from supabase import Client
from db.supabase import supabase
from typing import Optional

async def get_db() -> Client:
    return supabase

async def get_tenant_id(authorization: Optional[str] = Header(None)) -> str:
    return "00000000-0000-0000-0000-000000000001"  # Dev shortcut — replaced in Session 9

async def get_current_tenant(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
) -> dict:
    result = db.table("tenants").select("*").eq("id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return result.data
