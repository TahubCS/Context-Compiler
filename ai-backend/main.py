"""
Context Compiler AI Backend - FastAPI application entry point.
"""

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from ai import embed_text, generate_grounded_answer
from config import logger
from scanner import run_scan
from vector_store import get_connection, search_similar_chunks

app = FastAPI(title="Context Compiler AI Backend")


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


class SearchRequest(BaseModel):
    repository_id: str
    query: str
    limit: int = 6
    language: str | None = None
    file_category: str | None = None
    path_prefix: str | None = None


@app.post("/scan")
async def trigger_scan(body: ScanRequest, background_tasks: BackgroundTasks):
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


@app.post("/embed")
async def embed_query(body: EmbedRequest):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    embedding = embed_text(body.text)
    return {"embedding": embedding}


@app.post("/search")
async def search_repository(body: SearchRequest):
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query must not be empty")

    embedding = embed_text(query)

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


@app.post("/answer")
async def answer_question(body: AnswerRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question must not be empty")

    embedding = embed_text(question)

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

    try:
        answer = generate_grounded_answer(question, citations)
    except Exception as exc:
        logger.warning("Answer generation unavailable after fallback chain: %s", exc)
        answer = (
            "I found relevant repository context, but answer generation is temporarily "
            "unavailable. Review the citations below or try again shortly."
        )

    if not answer:
        answer = "I found relevant context, but could not synthesize a reliable answer from it."

    return {
        "answer": answer,
        "citations": citations,
    }


@app.get("/health")
async def health():
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
