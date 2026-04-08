import httpx
from config import settings
import asyncio
import logging

logger = logging.getLogger(__name__)

MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"


async def geocode_location(city: str, country: str = None) -> tuple[float, float] | None:
    """
    Geocode a city+country string using Mapbox Geocoding API.
    Returns (lat, lng) or None if not found.
    """
    query_parts = [p for p in [city, country] if p]
    query = ", ".join(query_parts)

    params = {
        "access_token": settings.mapbox_token,
        "limit": 1,
        "types": "place,locality,region",
    }
    if country:
        params["country"] = country.lower()

    async with httpx.AsyncClient() as client:
        try:
            encoded_query = httpx.URL(query)
            res = await client.get(
                f"{MAPBOX_GEOCODING_URL}/{encoded_query}.json",
                params=params,
                timeout=8.0
            )
            res.raise_for_status()
            data = res.json()

            features = data.get("features", [])
            if not features:
                return None

            coords = features[0]["geometry"]["coordinates"]
            lng, lat = coords[0], coords[1]
            return round(lat, 6), round(lng, 6)

        except Exception as e:
            logger.warning(f"Geocoding failed for '{query}': {e}")
            return None


async def geocode_target(target: dict, db) -> bool:
    """
    Geocode a single target and write lat/lng to DB.
    Returns True if successful.
    """
    city    = target.get("city")
    region  = target.get("region")
    country = target.get("country")

    location = city or region
    if not location:
        return False

    result = await geocode_location(location, country)
    if not result:
        if city and region:
            result = await geocode_location(region, country)
        if not result:
            return False

    lat, lng = result
    db.table("targets").update({
        "lat": lat,
        "lng": lng,
        "geocoded_at": "now()"
    }).eq("id", target["id"]).execute()

    logger.info(f"Geocoded '{location}' → ({lat}, {lng})")
    return True


async def geocode_all_ungeocode(tenant_id: str, db) -> dict:
    """
    Geocode all targets that don't yet have coordinates.
    """
    result = db.table("targets").select(
        "id, name, city, region, country"
    ).eq("tenant_id", tenant_id).is_("deleted_at", "null").is_("lat", "null").execute()

    targets = result.data or []
    if not targets:
        return {"total": 0, "success": 0, "failed": 0}

    success = 0
    failed  = 0

    for t in targets:
        ok = await geocode_target(t, db)
        if ok:
            success += 1
        else:
            failed += 1
        await asyncio.sleep(0.1)

    return {"total": len(targets), "success": success, "failed": failed}
