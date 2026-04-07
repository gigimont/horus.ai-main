from fastapi import Depends, HTTPException, Header
from supabase import Client
from db.supabase import supabase
from config import settings
from typing import Optional
import jwt

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
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            if settings.environment == "development":
                return DEMO_TENANT
            raise HTTPException(status_code=401, detail="No tenant_id in token")
        return tenant_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        if settings.environment == "development":
            return DEMO_TENANT
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_tenant(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
) -> dict:
    result = db.table("tenants").select("*").eq("id", tenant_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return result.data
