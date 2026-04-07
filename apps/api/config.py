from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    anthropic_api_key: str
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    environment: str = "development"

    class Config:
        env_file = ".env"

settings = Settings()

STRIPE_PLANS = {
    "pro": {
        "name": "Pro",
        "price_id": "",
        "price_monthly": 149,
        "features": ["Unlimited targets", "AI scoring", "Map view", "Pipeline CRM", "CSV export"],
    },
    "enterprise": {
        "name": "Enterprise",
        "price_id": "",
        "price_monthly": 499,
        "features": ["Everything in Pro", "API access", "Custom clustering", "Priority support"],
    }
}
