from dotenv import load_dotenv
load_dotenv()

import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from google import genai

from scanner import run_scan

app = FastAPI(title="Context Compiler AI Backend")

_gemini_client = genai.Client(api_key=os.environ["GOOGLE_GEMINI_API_KEY"])


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
        gemini_client=_gemini_client,
        db_url=os.environ["DATABASE_URL"],
    )
    return {"status": "accepted"}


@app.post("/embed")
async def embed_text(body: EmbedRequest):
    """
    Single-text embedding endpoint used by the Next.js search API (Phase 3).
    Returns a 768-float vector via Gemini embedding-001 with MRL reduction.
    """
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    result = _gemini_client.models.embed_content(
        model="models/gemini-embedding-001",
        contents=body.text,
        config={"output_dimensionality": 768},
    )
    embedding = result.embeddings[0].values
    return {"embedding": embedding}


@app.get("/health")
async def health():
    return {"ok": True}
