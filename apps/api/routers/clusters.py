from fastapi import APIRouter
router = APIRouter()

@router.get("/")
def list_clusters():
    return {"message": "Cluster discovery — implemented in Session 7"}

@router.post("/refresh")
def refresh_clusters():
    return {"message": "Cluster refresh — implemented in Session 7"}
