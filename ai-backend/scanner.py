"""
Repository scanner - clones a repo, chunks files, generates embeddings, and stores them.
"""

import hashlib
import logging
import os
import re
import shutil
import tempfile
import time
from pathlib import Path

import httpx
import psycopg
from git import Repo
from git.exc import GitCommandError

from ai import embed_text
from config import (
    BINARY_EXTENSIONS,
    CHUNK_MAX_LINES,
    CHUNK_OVERLAP_LINES,
    CURRENT_INDEX_FORMAT_VERSION,
    LANGUAGE_MAP,
    PROGRESS_EVERY,
    SCAN_HEARTBEAT_INTERVAL_SECONDS,
    SKIP_DIRS,
)
from vector_store import delete_stale_chunks, get_connection, upsert_chunk

logger = logging.getLogger("context-compiler.scanner")

_DOC_LANGUAGES = {"markdown"}
_CODE_LANGUAGES = {
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "cpp",
    "c",
    "ruby",
    "php",
    "swift",
    "kotlin",
}
_CONFIG_EXTENSIONS = {".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".sql"}


def _callback(url: str, secret: str, payload: dict) -> None:
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
    except Exception as exc:
        logger.warning("Callback failed: %s", exc)


class _ScanProgressReporter:
    def __init__(
        self,
        callback_url: str,
        callback_secret: str,
        scan_job_id: str,
        heartbeat_interval_s: int = SCAN_HEARTBEAT_INTERVAL_SECONDS,
    ) -> None:
        self.callback_url = callback_url
        self.callback_secret = callback_secret
        self.scan_job_id = scan_job_id
        self.heartbeat_interval_s = heartbeat_interval_s
        self.indexed_commit_sha: str | None = None
        self.files_discovered: int | None = None
        self.files_processed = 0
        self._last_sent_at = 0.0

    def set_scan_context(
        self,
        *,
        indexed_commit_sha: str | None = None,
        files_discovered: int | None = None,
        files_processed: int | None = None,
    ) -> None:
        if indexed_commit_sha is not None:
            self.indexed_commit_sha = indexed_commit_sha
        if files_discovered is not None:
            self.files_discovered = files_discovered
        if files_processed is not None:
            self.files_processed = files_processed

    def send_scanning(self, *, force: bool = False, phase: str | None = None) -> None:
        now = time.monotonic()
        if not force and now - self._last_sent_at < self.heartbeat_interval_s:
            return

        payload: dict[str, object] = {
            "scanJobId": self.scan_job_id,
            "scanStatus": "SCANNING",
        }
        if self.indexed_commit_sha is not None:
            payload["indexedCommitSha"] = self.indexed_commit_sha
            payload["indexFormatVersion"] = CURRENT_INDEX_FORMAT_VERSION
        if self.files_discovered is not None:
            payload["filesDiscovered"] = self.files_discovered
        payload["filesProcessed"] = self.files_processed
        if phase:
            payload["phase"] = phase

        _callback(self.callback_url, self.callback_secret, payload)
        self._last_sent_at = now

    def send_completed(self) -> None:
        payload: dict[str, object] = {
            "scanJobId": self.scan_job_id,
            "scanStatus": "COMPLETED",
            "indexFormatVersion": CURRENT_INDEX_FORMAT_VERSION,
            "filesProcessed": self.files_processed,
        }
        if self.indexed_commit_sha is not None:
            payload["indexedCommitSha"] = self.indexed_commit_sha
        if self.files_discovered is not None:
            payload["filesDiscovered"] = self.files_discovered
        _callback(self.callback_url, self.callback_secret, payload)

    def send_failed(self, error_message: str) -> None:
        _callback(
            self.callback_url,
            self.callback_secret,
            {
                "scanJobId": self.scan_job_id,
                "scanStatus": "FAILED",
                "errorMessage": error_message,
            },
        )


def _fixed_line_chunks(lines: list[str], overlap_lines: int = CHUNK_OVERLAP_LINES) -> list[str]:
    if not lines:
        return []

    chunks = []
    step = max(1, CHUNK_MAX_LINES - overlap_lines)
    start = 0
    while start < len(lines):
        chunk = "".join(lines[start : start + CHUNK_MAX_LINES])
        if chunk.strip():
            chunks.append(chunk)
        if start + CHUNK_MAX_LINES >= len(lines):
            break
        start += step
    return chunks


def _chunk_markdown(content: str) -> list[tuple[str, str]]:
    lines = content.splitlines(keepends=True)
    if not lines:
        return [("docs", content)]

    sections: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if re.match(r"^\s{0,3}#{1,6}\s", line) and current:
            sections.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        sections.append(current)

    chunks: list[tuple[str, str]] = []
    for section in sections:
        if len(section) <= CHUNK_MAX_LINES:
            text = "".join(section)
            if text.strip():
                chunks.append(("docs", text))
            continue
        for chunk in _fixed_line_chunks(section):
            chunks.append(("docs", chunk))
    return chunks or [("docs", content)]


def _chunk_code(content: str) -> list[tuple[str, str]]:
    lines = content.splitlines(keepends=True)
    if not lines:
        return [("code", content)]

    boundary_pattern = re.compile(
        r"^\s*(export\s+)?(async\s+)?(function|class|interface|type|const\s+\w+\s*=\s*\(|def |async def |fn |struct |enum )"
    )

    boundaries = [0]
    for index, line in enumerate(lines):
        if index == 0:
            continue
        if boundary_pattern.match(line):
            boundaries.append(index)
    boundaries.append(len(lines))
    boundaries = sorted(set(boundaries))

    segments = [lines[boundaries[i] : boundaries[i + 1]] for i in range(len(boundaries) - 1)]
    chunks: list[tuple[str, str]] = []
    current: list[str] = []
    current_lines = 0

    for segment in segments:
        if not segment:
            continue
        segment_len = len(segment)
        if segment_len > CHUNK_MAX_LINES:
            if current:
                text = "".join(current)
                if text.strip():
                    chunks.append(("code", text))
                current = []
                current_lines = 0
            for chunk in _fixed_line_chunks(segment):
                chunks.append(("code", chunk))
            continue

        if current and current_lines + segment_len > CHUNK_MAX_LINES:
            text = "".join(current)
            if text.strip():
                chunks.append(("code", text))
            overlap = current[-CHUNK_OVERLAP_LINES:] if CHUNK_OVERLAP_LINES > 0 else []
            current = overlap.copy()
            current_lines = len(current)

        current.extend(segment)
        current_lines += segment_len

    if current:
        text = "".join(current)
        if text.strip():
            chunks.append(("code", text))

    return chunks or [("code", content)]


def _chunk_file(content: str, language: str | None, suffix: str) -> list[tuple[str, str]]:
    if language in _DOC_LANGUAGES or suffix == ".md":
        return _chunk_markdown(content)
    if language in _CODE_LANGUAGES:
        return _chunk_code(content)
    if suffix in _CONFIG_EXTENSIONS:
        return [("config", chunk) for chunk in _fixed_line_chunks(content.splitlines(keepends=True))]
    return [("fallback", chunk) for chunk in _fixed_line_chunks(content.splitlines(keepends=True))] or [
        ("fallback", content)
    ]


def _collect_files(repo_dir: Path) -> list[Path]:
    files = []
    for path in repo_dir.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in BINARY_EXTENSIONS:
            continue
        files.append(path)
    return files


def _infer_file_category(relative_path: str, language: str | None, suffix: str) -> str:
    normalized = relative_path.lower()
    if language in _DOC_LANGUAGES or suffix == ".md" or normalized.startswith("docs/") or "readme" in normalized:
      return "docs"
    if (
        "/test/" in normalized
        or normalized.startswith("test/")
        or normalized.startswith("tests/")
        or ".test." in normalized
        or ".spec." in normalized
    ):
        return "tests"
    if suffix in _CONFIG_EXTENSIONS or normalized.startswith(".github/") or "config" in normalized:
        return "config"
    if language in _CODE_LANGUAGES:
        return "source"
    return "other"


def _infer_path_bucket(relative_path: str) -> str:
    parts = Path(relative_path).parts
    return parts[0] if parts else ""


def run_scan(
    scan_job_id: str,
    repository_id: str,
    github_url: str,
    default_branch: str,
    github_token: str,
    callback_url: str,
    callback_secret: str,
) -> None:
    logger.info(
        "Starting scan job=%s for repo=%s url=%s branch=%s",
        scan_job_id, repository_id, github_url, default_branch,
    )
    progress = _ScanProgressReporter(callback_url, callback_secret, scan_job_id)
    progress.send_scanning(force=True, phase="starting")

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            auth_url = github_url.replace("https://", f"https://x-access-token:{github_token}@")
            logger.info("Cloning %s (branch=%s) ...", github_url, default_branch)
            try:
                Repo.clone_from(auth_url, tmp_dir, branch=default_branch, depth=1)
            except GitCommandError as exc:
                if "Remote branch" in str(exc) and "not found" in str(exc):
                    logger.warning(
                        "Branch '%s' not found - falling back to remote default HEAD.",
                        default_branch,
                    )
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                    os.makedirs(tmp_dir, exist_ok=True)
                    Repo.clone_from(auth_url, tmp_dir, depth=1)
                else:
                    raise

            repo_dir = Path(tmp_dir)
            repo = Repo(repo_dir)
            indexed_commit_sha = repo.git.rev_parse("HEAD").strip()
            files = _collect_files(repo_dir)
            total_files = len(files)
            progress.set_scan_context(
                indexed_commit_sha=indexed_commit_sha,
                files_discovered=total_files,
                files_processed=0,
            )
            progress.send_scanning(force=True, phase="cloned")

            with get_connection() as conn:
                files_processed = 0

                for file_path in files:
                    progress.set_scan_context(files_processed=files_processed)
                    progress.send_scanning(phase="reading")
                    try:
                        content = file_path.read_text(encoding="utf-8", errors="ignore")
                    except Exception as exc:
                        logger.warning("Could not read %s: %s", file_path, exc)
                        continue

                    relative_path = str(file_path.relative_to(repo_dir))
                    suffix = file_path.suffix.lower()
                    language = LANGUAGE_MAP.get(suffix)
                    file_category = _infer_file_category(relative_path, language, suffix)
                    path_bucket = _infer_path_bucket(relative_path)
                    chunks = _chunk_file(content, language, suffix)

                    for chunk_index, (chunk_type, chunk_text) in enumerate(chunks):
                        content_hash = hashlib.sha256(chunk_text.encode()).hexdigest()
                        token_count = len(chunk_text.split())
                        progress.send_scanning(phase="embedding")

                        try:
                            embedding = embed_text(
                                chunk_text,
                                on_retry_wait=lambda _wait, _attempt, _max: progress.send_scanning(
                                    force=True, phase="embedding-retry"
                                ),
                            )
                        except Exception as exc:
                            message = (
                                "Embedding failed while indexing "
                                f"{relative_path} chunk {chunk_index}: {exc}"
                            )
                            logger.error(message)
                            raise RuntimeError(message) from exc

                        try:
                            progress.send_scanning(phase="writing")
                            upsert_chunk(
                                conn,
                                scan_job_id=scan_job_id,
                                repository_id=repository_id,
                                file_path=relative_path,
                                chunk_index=chunk_index,
                                language=language,
                                file_category=file_category,
                                chunk_type=chunk_type,
                                path_bucket=path_bucket,
                                content=chunk_text,
                                content_hash=content_hash,
                                token_count=token_count,
                                embedding=embedding,
                            )
                        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
                            logger.error(
                                "DB connectivity lost at %s chunk %d - aborting scan: %s",
                                relative_path,
                                chunk_index,
                                exc,
                            )
                            raise
                        except Exception as exc:
                            conn.rollback()
                            message = (
                                "Database upsert failed while indexing "
                                f"{relative_path} chunk {chunk_index}: {exc}"
                            )
                            logger.error(message)
                            raise RuntimeError(message) from exc

                    conn.commit()
                    files_processed += 1
                    progress.set_scan_context(files_processed=files_processed)

                    if files_processed % PROGRESS_EVERY == 0:
                        progress.send_scanning(force=True, phase="progress")
                    else:
                        progress.send_scanning(phase="progress")

                progress.send_scanning(force=True, phase="cleanup")
                delete_stale_chunks(conn, repository_id, scan_job_id)
                conn.commit()

        progress.send_completed()

    except Exception as exc:
        logger.exception("Scan FAILED for repo=%s: %s", repository_id, exc)
        progress.send_failed(str(exc))
