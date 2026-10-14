"""
Context Compiler AI Backend - FastAPI application entry point.
"""

import hmac
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from urllib.parse import urlparse

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from ai import build_grounded_fallback_answer, embed_text, generate_grounded_answer
from config import (
    AI_BACKEND_SECRET,
    ALLOWED_GIT_HOSTS,
    ANSWER_TIMEOUT_SECONDS,
    APP_BASE_URL,
    QUERY_EMBED_MAX_RETRIES,
    logger,
)
from scanner import run_scan
from vector_store import get_connection, search_similar_chunks

app = FastAPI(title="Context Compiler AI Backend")

# Answer generation runs here so a slow model call can be abandoned once the
# time budget is spent; the worker finishes in the background and is discarded.
_answer_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="answer")


def require_backend_auth(authorization: str | None = Header(default=None)) -> None:
    expected = f"Bearer {AI_BACKEND_SECRET}".encode()
    if not authorization or not hmac.compare_digest(authorization.encode(), expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


AUTH = [Depends(require_backend_auth)]


class ScanRequest(BaseModel):
    scan_job_id: str
    repository_id: str
    github_url: str
    default_branch: str
    previous_indexed_commit_sha: str | None = None
    repository_index_format_version: int | None = None
    github_token: str
    callback_url: str
    callback_secret: str


class EmbedRequest(BaseModel):
    text: str


class AnswerRequest(BaseModel):
    repository_id: str
    question: str
    limit: int = 6
    language: str | None = None
    file_category: str | None = None
    path_prefix: str | None = None
    citations: list[dict] | None = None
    selected_files: list[str] | None = None


class SearchRequest(BaseModel):
    repository_id: str
    query: str
    limit: int = 6
    language: str | None = None
    file_category: str | None = None
    path_prefix: str | None = None


def validate_scan_urls(github_url: str, callback_url: str) -> None:
    repo = urlparse(github_url)
    if (
        repo.scheme != "https"
        or (repo.hostname or "").lower() not in ALLOWED_GIT_HOSTS
        or repo.username
        or repo.password
        or repo.port
    ):
        raise HTTPException(status_code=400, detail="github_url must be an https URL on an allowed git host")

    callback = urlparse(callback_url)
    if callback.scheme not in {"http", "https"} or callback.username or callback.password:
        raise HTTPException(status_code=400, detail="callback_url must be an http(s) URL without credentials")
    if APP_BASE_URL and not callback_url.startswith(APP_BASE_URL + "/"):
        raise HTTPException(status_code=400, detail="callback_url must target APP_BASE_URL")


def _embed_query(text: str) -> list[float]:
    try:
        return embed_text(text, max_retries=QUERY_EMBED_MAX_RETRIES, base_delay=1.0)
    except Exception as exc:
        logger.warning("Query embedding failed: %s", exc)
        raise HTTPException(
            status_code=503, detail="Embedding service is busy or unavailable; try again shortly"
        ) from exc


@app.post("/scan", dependencies=AUTH)
def trigger_scan(body: ScanRequest, background_tasks: BackgroundTasks):
    validate_scan_urls(body.github_url, body.callback_url)
    background_tasks.add_task(
        run_scan,
        scan_job_id=body.scan_job_id,
        repository_id=body.repository_id,
        github_url=body.github_url,
        default_branch=body.default_branch,
        previous_indexed_commit_sha=body.previous_indexed_commit_sha,
        repository_index_format_version=body.repository_index_format_version,
        github_token=body.github_token,
        callback_url=body.callback_url,
        callback_secret=body.callback_secret,
    )
    return {"status": "accepted"}


@app.post("/embed", dependencies=AUTH)
def embed_query(body: EmbedRequest):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    return {"embedding": _embed_query(body.text)}


@app.post("/search", dependencies=AUTH)
def search_repository(body: SearchRequest):
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query must not be empty")

    embedding = _embed_query(query)

    try:
        with get_connection() as conn:
            results = search_similar_chunks(
                conn,
                repository_id=body.repository_id,
                query=query,
                query_vector=embedding,
                limit=max(1, min(body.limit, 12)),
                language=body.language,
                file_category=body.file_category,
                path_prefix=body.path_prefix,
            )
    except Exception as exc:
        logger.exception(
            "Repository search failed for repo=%s query=%r",
            body.repository_id,
            query,
        )
        raise HTTPException(
            status_code=500, detail="Failed to retrieve repository context"
        ) from exc

    return {"results": results}


@app.post("/answer", dependencies=AUTH)
def answer_question(body: AnswerRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question must not be empty")

    started = time.monotonic()
    citations = body.citations or []
    if not citations:
        embedding = _embed_query(question)

        try:
            with get_connection() as conn:
                citations = search_similar_chunks(
                    conn,
                    repository_id=body.repository_id,
                    query=question,
                    query_vector=embedding,
                    limit=max(1, min(body.limit, 12)),
                    language=body.language,
                    file_category=body.file_category,
                    path_prefix=body.path_prefix,
                )
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail="Failed to retrieve repository context"
            ) from exc

    if not citations:
        return {
            "answer": (
                "I could not find relevant indexed context for that question yet. "
                "Try scanning the repository first or ask a narrower question."
            ),
            "citations": [],
        }

    selected_files = body.selected_files or []
    deadline = started + ANSWER_TIMEOUT_SECONDS
    degraded = False
    answer = ""
    future = _answer_executor.submit(
        generate_grounded_answer, question, citations, selected_files, deadline
    )
    try:
        answer = future.result(timeout=max(0.0, deadline - time.monotonic()))
    except FutureTimeoutError:
        logger.warning("Answer generation exceeded %.0fs budget; using fallback.", ANSWER_TIMEOUT_SECONDS)
        degraded = True
    except Exception as exc:
        logger.warning("Answer generation unavailable after fallback chain: %s", exc)
        degraded = True

    if not answer:
        answer = build_grounded_fallback_answer(question, citations, selected_files)
        degraded = True

    return {
        "answer": answer,
        "citations": citations,
        "degraded": degraded,
    }


@app.get("/health")
def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
