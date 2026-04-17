from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup, scenarios, network, enrichment, officer_network
from config import settings

app = FastAPI(title="SearchFund AI API", version="1.0.0")

ALLOWED_ORIGINS = ["http://localhost:3000"]
if settings.environment == "production":
    ALLOWED_ORIGINS = ["https://horus-ai-main.vercel.app"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(targets.router, prefix="/targets", tags=["targets"])
app.include_router(scoring.router, prefix="/scoring", tags=["scoring"])
app.include_router(clusters.router, prefix="/clusters", tags=["clusters"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(exports.router, prefix="/exports", tags=["exports"])
app.include_router(pipeline.router, prefix="/pipeline", tags=["pipeline"])
app.include_router(billing.router, prefix="/billing", tags=["billing"])
app.include_router(rollup.router, prefix="/rollup", tags=["rollup"])
app.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
app.include_router(network.router, prefix="/network", tags=["network"])
app.include_router(enrichment.router, prefix="/enrichment", tags=["enrichment"])
app.include_router(officer_network.router, prefix="/officer-network", tags=["officer-network"])

@app.get("/health")
def health():
    return {"status": "ok"}
