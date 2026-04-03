from fastapi import APIRouter
router = APIRouter()

@router.post("/")
def chat():
    return {"message": "AI copilot chat — implemented in Session 7"}
