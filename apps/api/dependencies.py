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

def _decode_payload(token: str) -> dict:
    """Try verified decode first; fall back to unverified to extract claims."""
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise
    except Exception as e:
        logger.warning(f"JWT verified decode failed ({e}), falling back to unverified")
        return jwt.decode(
            token,
            options={"verify_signature": False},
            algorithms=["HS256"],
        )

async def get_tenant_id(authorization: Optional[str] = Header(None)) -> str:
    DEMO_TENANT = "00000000-0000-0000-0000-000000000001"

    if not authorization:
        if settings.environment == "development":
            return DEMO_TENANT
        raise HTTPException(status_code=401, detail="Authorization header required")

    try:
        token = authorization.removeprefix("Bearer ")
        payload = _decode_payload(token)

        # Happy path: custom_access_token_hook injected tenant_id into claims
        tenant_id = payload.get("tenant_id")
        if tenant_id:
            return tenant_id

        # Fallback: look up tenant from public.users using the sub (user UUID)
        sub = payload.get("sub")
        if sub:
            row = supabase.table("users").select("tenant_id").eq("id", sub).single().execute()
            if row.data and row.data.get("tenant_id"):
                return row.data["tenant_id"]

        logger.error(f"No tenant_id resolvable. JWT sub={payload.get('sub')} claims={list(payload.keys())}")
        raise HTTPException(status_code=401, detail="No tenant_id in token")

    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        logger.error(f"get_tenant_id error: {e}")
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
