import os
import tempfile
import hashlib
import uuid
from pathlib import Path

import httpx
import psycopg
from git import Repo
from google import genai

# ── Constants ─────────────────────────────────────────────────────────────────

CHUNK_MAX_LINES = 100       # Max lines per chunk
PROGRESS_EVERY = 10         # Call back every N files processed

SKIP_DIRS = {
    ".git", "node_modules", "vendor", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".turbo", "coverage",
}

BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".woff", ".woff2", ".ttf", ".eot",
    ".mp4", ".mp3", ".wav", ".avi", ".mov",
    ".exe", ".dll", ".so", ".dylib", ".bin",
    ".lock",  # package-lock / yarn.lock are too noisy
}

LANGUAGE_MAP = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cs": "csharp",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp",
    ".c": "c", ".h": "c",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".sql": "sql",
    ".sh": "bash",
    ".html": "html",
    ".css": "css",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _callback(url: str, secret: str, payload: dict) -> None:
    """Send a status update to the Next.js callback endpoint."""
    try:
        httpx.patch(
            url,
            json=payload,
            headers={"x-callback-secret": secret},
            timeout=10,
        )
    except Exception:
        pass  # Best-effort — don't let callback failures abort the scan


def _chunk_file(content: str) -> list[str]:
    """Split file content into chunks of up to CHUNK_MAX_LINES lines."""
    lines = content.splitlines(keepends=True)
    chunks = []
    for i in range(0, len(lines), CHUNK_MAX_LINES):
        chunk = "".join(lines[i : i + CHUNK_MAX_LINES])
        if chunk.strip():
            chunks.append(chunk)
    return chunks or [content]


def _collect_files(repo_dir: Path) -> list[Path]:
    """Walk repo dir, skipping binary files and common noise directories."""
    files = []
    for path in repo_dir.rglob("*"):
        if not path.is_file():
            continue
        # Skip if any parent dir is in SKIP_DIRS
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in BINARY_EXTENSIONS:
            continue
        files.append(path)
    return files


def _embed(client: genai.Client, text: str) -> list[float]:
    result = client.models.embed_content(
        model="models/gemini-embedding-001",
        contents=text,
        config={"output_dimensionality": 768},
    )
    return result.embeddings[0].values


def _upsert_chunk(
    conn,
    repository_id: str,
    file_path: str,
    chunk_index: int,
    language: str | None,
    content: str,
    content_hash: str,
    token_count: int,
    embedding: list[float],
) -> None:
    vector_literal = "[" + ",".join(str(v) for v in embedding) + "]"
    conn.execute(
        """
        INSERT INTO "CodeDocument" (
            id, "repositoryId", "filePath", "chunkIndex", language,
            content, "contentHash", "tokenCount", embedding,
            "embeddingModel", "embeddingDimensions", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), %s, %s, %s, %s,
            %s, %s, %s, %s::vector,
            'gemini-embedding-001', 768, NOW()
        )
        ON CONFLICT ("repositoryId", "filePath", "chunkIndex") DO UPDATE SET
            content            = EXCLUDED.content,
            "contentHash"      = EXCLUDED."contentHash",
            embedding          = EXCLUDED.embedding,
            "tokenCount"       = EXCLUDED."tokenCount",
            "updatedAt"        = NOW()
        WHERE "CodeDocument"."contentHash" != EXCLUDED."contentHash"
        """,
        (
            repository_id, file_path, chunk_index, language,
            content, content_hash, token_count, vector_literal,
        ),
    )


# ── Main scan function ────────────────────────────────────────────────────────

def run_scan(
    repository_id: str,
    github_url: str,
    default_branch: str,
    github_token: str,
    callback_url: str,
    callback_secret: str,
    gemini_client: genai.Client,
    db_url: str,
) -> None:
    """
    Full scan pipeline:
    1. Clone repo
    2. Collect and chunk files
    3. Generate embeddings (gemini-embedding-001, 768-dim MRL)
    4. Upsert CodeDocument rows
    5. Callback with progress and final status
    """
    _callback(callback_url, callback_secret, {"scanStatus": "SCANNING"})

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Inject token into clone URL
            auth_url = github_url.replace(
                "https://", f"https://x-access-token:{github_token}@"
            )
            Repo.clone_from(auth_url, tmp_dir, branch=default_branch, depth=1)

            repo_dir = Path(tmp_dir)
            files = _collect_files(repo_dir)
            total_files = len(files)

            _callback(
                callback_url,
                callback_secret,
                {"scanStatus": "SCANNING", "filesDiscovered": total_files},
            )

            with psycopg.connect(db_url, autocommit=False) as conn:
                files_processed = 0

                for file_path in files:
                    try:
                        content = file_path.read_text(encoding="utf-8", errors="ignore")
                    except Exception:
                        continue

                    relative_path = str(file_path.relative_to(repo_dir))
                    language = LANGUAGE_MAP.get(file_path.suffix.lower())
                    chunks = _chunk_file(content)

                    for chunk_index, chunk_text in enumerate(chunks):
                        content_hash = hashlib.sha256(chunk_text.encode()).hexdigest()
                        token_count = len(chunk_text.split())  # rough word-token estimate

                        try:
                            embedding = _embed(gemini_client, chunk_text)
                        except Exception:
                            continue

                        try:
                            _upsert_chunk(
                                conn,
                                repository_id=repository_id,
                                file_path=relative_path,
                                chunk_index=chunk_index,
                                language=language,
                                content=chunk_text,
                                content_hash=content_hash,
                                token_count=token_count,
                                embedding=embedding,
                            )
                        except Exception:
                            conn.rollback()
                            continue

                    conn.commit()
                    files_processed += 1

                    if files_processed % PROGRESS_EVERY == 0:
                        _callback(
                            callback_url,
                            callback_secret,
                            {
                                "scanStatus": "SCANNING",
                                "filesDiscovered": total_files,
                                "filesProcessed": files_processed,
                            },
                        )

        _callback(
            callback_url,
            callback_secret,
            {
                "scanStatus": "COMPLETED",
                "filesDiscovered": total_files,
                "filesProcessed": files_processed,
            },
        )

    except Exception as exc:
        _callback(
            callback_url,
            callback_secret,
            {"scanStatus": "FAILED", "errorMessage": str(exc)},
        )
