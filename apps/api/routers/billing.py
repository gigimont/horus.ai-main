from fastapi import APIRouter, Depends, HTTPException, Request
from dependencies import get_db, get_tenant_id, get_current_tenant
from config import settings, STRIPE_PLANS

router = APIRouter()

try:
    import stripe
    stripe.api_key = settings.stripe_secret_key
    STRIPE_AVAILABLE = bool(settings.stripe_secret_key)
except Exception:
    STRIPE_AVAILABLE = False

@router.get("/plans")
def get_plans():
    return {"plans": STRIPE_PLANS}

@router.post("/checkout")
async def create_checkout(
    request: Request,
    tenant: dict = Depends(get_current_tenant),
    db=Depends(get_db)
):
    if not STRIPE_AVAILABLE:
        raise HTTPException(400, "Stripe not configured")
    body = await request.json()
    plan_id = body.get("plan_id")
    if plan_id not in STRIPE_PLANS:
        raise HTTPException(400, "Invalid plan")
    price_id = STRIPE_PLANS[plan_id]["price_id"]
    if not price_id:
        raise HTTPException(400, "Plan price not configured in Stripe yet — add price IDs to config.py")
    origin = body.get("origin", "http://localhost:3000")
    import stripe as _stripe
    session = _stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{origin}/settings?upgraded=true",
        cancel_url=f"{origin}/settings",
        metadata={"tenant_id": str(tenant["id"]), "plan_id": plan_id},
        client_reference_id=str(tenant["id"]),
    )
    return {"url": session.url}

@router.post("/portal")
async def billing_portal(
    request: Request,
    tenant: dict = Depends(get_current_tenant)
):
    if not STRIPE_AVAILABLE:
        raise HTTPException(400, "Stripe not configured")
    body = await request.json()
    origin = body.get("origin", "http://localhost:3000")
    stripe_customer_id = tenant.get("stripe_customer_id")
    if not stripe_customer_id:
        raise HTTPException(400, "No Stripe customer found for this tenant")
    import stripe as _stripe
    session = _stripe.billing_portal.Session.create(
        customer=stripe_customer_id,
        return_url=f"{origin}/settings",
    )
    return {"url": session.url}

@router.post("/webhook")
async def stripe_webhook(request: Request, db=Depends(get_db)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        import stripe as _stripe
        event = _stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(400, "Invalid webhook signature")
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        tenant_id = session["metadata"].get("tenant_id")
        plan_id = session["metadata"].get("plan_id")
        customer_id = session.get("customer")
        if tenant_id and plan_id:
            db.table("tenants").update({"plan": plan_id, "stripe_customer_id": customer_id}).eq("id", tenant_id).execute()
    elif event["type"] == "customer.subscription.deleted":
        customer_id = event["data"]["object"].get("customer")
        if customer_id:
            db.table("tenants").update({"plan": "trial"}).eq("stripe_customer_id", customer_id).execute()
    return {"received": True}
