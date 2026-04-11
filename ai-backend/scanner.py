"""
Repository scanner — clones a repo, chunks files, generates embeddings, and stores them.
"""

import hashlib
import logging
import os
import shutil
import tempfile
from pathlib import Path

import httpx
from git import Repo
from git.exc import GitCommandError

from config import (
    CHUNK_MAX_LINES,
    PROGRESS_EVERY,
    SKIP_DIRS,
    BINARY_EXTENSIONS,
    LANGUAGE_MAP,
)
from ai import embed_text
from vector_store import get_connection, upsert_chunk

logger = logging.getLogger("context-compiler.scanner")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _callback(url: str, secret: str, payload: dict) -> None:
    """Send a status update to the Next.js callback endpoint."""
    try:
        logger.info("Callback -> %s  payload=%s", url, payload)
        resp = httpx.patch(
            url,
            json=payload,
            headers={"x-callback-secret": secret},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning("Callback returned %s: %s", resp.status_code, resp.text)
    except Exception as e:
        logger.warning("Callback failed: %s", e)  # Best-effort — don't abort scan


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


# ── Main scan function ────────────────────────────────────────────────────────


def run_scan(
    repository_id: str,
    github_url: str,
    default_branch: str,
    github_token: str,
    callback_url: str,
    callback_secret: str,
) -> None:
    """
    Full scan pipeline:
    1. Clone repo
    2. Collect and chunk files
    3. Generate embeddings (gemini-embedding-001, 768-dim MRL)
    4. Upsert CodeDocument rows
    5. Callback with progress and final status
    """
    logger.info(
        "Starting scan for repo=%s url=%s branch=%s",
        repository_id, github_url, default_branch,
    )
    _callback(callback_url, callback_secret, {"scanStatus": "SCANNING"})

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            # Inject token into clone URL
            auth_url = github_url.replace(
                "https://", f"https://x-access-token:{github_token}@"
            )
            logger.info("Cloning %s (branch=%s) ...", github_url, default_branch)
            try:
                Repo.clone_from(auth_url, tmp_dir, branch=default_branch, depth=1)
            except GitCommandError as e:
                # Branch name stored in DB may be stale (e.g. repo uses 'master'
                # but we stored 'main'). Fall back to the remote's default HEAD.
                if "Remote branch" in str(e) and "not found" in str(e):
                    logger.warning(
                        "Branch '%s' not found — falling back to remote default HEAD.",
                        default_branch,
                    )
                    # Clear the temp dir before re-cloning into it
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                    os.makedirs(tmp_dir, exist_ok=True)
                    Repo.clone_from(auth_url, tmp_dir, depth=1)
                else:
                    raise
            logger.info("Clone complete")

            repo_dir = Path(tmp_dir)
            files = _collect_files(repo_dir)
            total_files = len(files)
            logger.info("Discovered %d files to process", total_files)

            _callback(
                callback_url,
                callback_secret,
                {"scanStatus": "SCANNING", "filesDiscovered": total_files},
            )

            logger.info("Connecting to database ...")
            with get_connection() as conn:
                logger.info("Database connected")
                files_processed = 0

                for file_path in files:
                    try:
                        content = file_path.read_text(encoding="utf-8", errors="ignore")
                    except Exception as e:
                        logger.warning("Could not read %s: %s", file_path, e)
                        continue

                    relative_path = str(file_path.relative_to(repo_dir))
                    language = LANGUAGE_MAP.get(file_path.suffix.lower())
                    chunks = _chunk_file(content)

                    for chunk_index, chunk_text in enumerate(chunks):
                        content_hash = hashlib.sha256(chunk_text.encode()).hexdigest()
                        token_count = len(chunk_text.split())  # rough word-token estimate

                        try:
                            embedding = embed_text(chunk_text)
                        except Exception as e:
                            logger.error(
                                "Embedding failed for %s chunk %d: %s",
                                relative_path, chunk_index, e,
                            )
                            continue

                        try:
                            upsert_chunk(
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
                        except Exception as e:
                            logger.error(
                                "DB upsert failed for %s chunk %d: %s",
                                relative_path, chunk_index, e,
                            )
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

        logger.info("Scan completed: %d/%d files processed", files_processed, total_files)
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
        logger.exception("Scan FAILED for repo=%s: %s", repository_id, exc)
        _callback(
            callback_url,
            callback_secret,
            {"scanStatus": "FAILED", "errorMessage": str(exc)},
        )
