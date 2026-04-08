from fastapi import Depends, HTTPException, Header
from supabase import Client
from db.supabase import supabase
from config import settings
from typing import Optional
import jwt
import logging

logger = logging.getLogger(__name__)

async def get_db() -> Client:
    return supabase

async def get_tenant_id(authorization: Optional[str] = Header(None)) -> str:
    DEMO_TENANT = "00000000-0000-0000-0000-000000000001"

    if not authorization:
        if settings.environment == "development":
            return DEMO_TENANT
        raise HTTPException(status_code=401, detail="Authorization header required")

    try:
        token = authorization.replace("Bearer ", "")
        # Decode without signature verification — Supabase validates on its end
        payload = jwt.decode(
            token,
            options={"verify_signature": False},
            algorithms=["HS256"]
        )
        tenant_id = payload.get("tenant_id")
        if tenant_id:
            return tenant_id
        # If no tenant_id claim yet, look up by user sub
        user_id = payload.get("sub")
        if user_id:
            result = supabase.table("users").select("tenant_id").eq("id", user_id).single().execute()
            if result.data:
                return result.data["tenant_id"]
        return DEMO_TENANT
    except Exception as e:
        if settings.environment == "development":
            return DEMO_TENANT
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")

async def get_current_tenant(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
) -> dict:
    result = db.table("tenants").select("*").eq("id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return result.data
