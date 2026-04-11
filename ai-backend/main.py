"""
Context Compiler AI Backend — FastAPI application entry point.
"""

from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

from config import logger  # noqa: F401 — ensures logging is configured on startup
from ai import embed_text
from scanner import run_scan

app = FastAPI(title="Context Compiler AI Backend")


# ── Request / Response models ─────────────────────────────────────────────────


class ScanRequest(BaseModel):
    repository_id: str
    github_url: str
    default_branch: str
    github_token: str
    callback_url: str
    callback_secret: str


class EmbedRequest(BaseModel):
    text: str


# ── Routes ────────────────────────────────────────────────────────────────────


@app.post("/scan")
async def trigger_scan(body: ScanRequest, background_tasks: BackgroundTasks):
    """
    Fire-and-forget scan endpoint called by Next.js.
    Returns immediately; the actual scan runs in the background.
    """
    background_tasks.add_task(
        run_scan,
        repository_id=body.repository_id,
        github_url=body.github_url,
        default_branch=body.default_branch,
        github_token=body.github_token,
        callback_url=body.callback_url,
        callback_secret=body.callback_secret,
    )
    return {"status": "accepted"}


@app.post("/embed")
async def embed_query(body: EmbedRequest):
    """
    Single-text embedding endpoint used by the Next.js search API.
    Returns a 768-float vector via Gemini embedding-001 with MRL reduction.
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    embedding = embed_text(body.text)
    return {"embedding": embedding}


@app.get("/health")
async def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
