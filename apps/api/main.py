from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import targets, scoring, clusters, chat, exports, pipeline

app = FastAPI(title="SearchFund AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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

@app.get("/health")
def health():
    return {"status": "ok"}
