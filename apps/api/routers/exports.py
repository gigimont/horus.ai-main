from fastapi import APIRouter
router = APIRouter()

@router.post("/targets")
def export_targets():
    return {"message": "CSV/PDF export — implemented in Session 10"}
