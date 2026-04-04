from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from dependencies import get_db, get_tenant_id
from config import settings
import anthropic
import json

router = APIRouter()
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

@router.post("/stream")
async def chat_stream(
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    db=Depends(get_db)
):
    body = await request.json()
    messages = body.get("messages", [])
    context = body.get("context", {})

    system = f"""You are an AI copilot for a Search Fund operator evaluating SME acquisition targets.
You have deep expertise in M&A, business valuation, and SME succession dynamics.
Be concise, analytical, and practical. Answer in 2–4 sentences unless a longer answer is clearly needed.

Current target context:
{json.dumps(context, indent=2)}
"""

    def generate():
        with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
