from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    anthropic_api_key: str
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    environment: str = "development"

    class Config:
        env_file = ".env"

settings = Settings()
