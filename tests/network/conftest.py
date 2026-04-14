# tests/network/conftest.py
import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

# Add apps/api to path so services.* imports work
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../apps/api")))
# Add repo root to path so `from tests.network.conftest import ...` works
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

TARGET_A = {
    "id": "aaaaaaaa-0000-0000-0000-000000000001",
    "name": "Stahl GmbH",
    "industry_label": "Metal fabrication",
    "city": "Stuttgart",
    "country": "Germany",
    "description": "Precision steel parts for automotive OEMs",
    "employee_count": 120,
    "revenue_eur": 8000000,
}

TARGET_B = {
    "id": "bbbbbbbb-0000-0000-0000-000000000002",
    "name": "Metall AG",
    "industry_label": "Metal fabrication",
    "city": "Munich",
    "country": "Germany",
    "description": "Stamped metal components for automotive",
    "employee_count": 90,
    "revenue_eur": 6000000,
}

TARGET_C = {
    "id": "cccccccc-0000-0000-0000-000000000003",
    "name": "Kunststoff KG",
    "industry_label": "Plastics",
    "city": "Frankfurt",
    "country": "Germany",
    "description": "Injection moulded plastic housings",
    "employee_count": 60,
    "revenue_eur": 4000000,
}
