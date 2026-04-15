"""
Vector store - handles PostgreSQL/pgvector database operations for CodeDocument storage.
"""

import logging
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import psycopg

from config import DATABASE_URL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL

logger = logging.getLogger("context-compiler.vector_store")

_PSYCOPG_UNSUPPORTED_PARAMS = {"pgbouncer"}


def _sanitize_db_url(url: str) -> str:
    parsed = urlparse(url)
    params = {k: v for k, v in parse_qs(parsed.query).items() if k not in _PSYCOPG_UNSUPPORTED_PARAMS}
    clean_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=clean_query))


_DB_URL = _sanitize_db_url(DATABASE_URL)


def get_connection():
    return psycopg.connect(_DB_URL, autocommit=False, prepare_threshold=None)


def upsert_chunk(
    conn,
    scan_job_id: str,
    repository_id: str,
    file_path: str,
    chunk_index: int,
    language: str | None,
    file_category: str,
    chunk_type: str,
    path_bucket: str,
    content: str,
    content_hash: str,
    token_count: int,
    embedding: list[float],
) -> None:
    """Insert or update a single code chunk with metadata and embedding vector."""
    vector_literal = "[" + ",".join(str(v) for v in embedding) + "]"
    conn.execute(
        """
        INSERT INTO "CodeDocument" (
            id, "repositoryId", "lastSeenScanJobId", "filePath", "chunkIndex", language,
            "fileCategory", "chunkType", "pathBucket",
            content, "contentHash", "tokenCount", embedding,
            "embeddingModel", "embeddingDimensions", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), %s, %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s::vector,
            %s, %s, NOW()
        )
        ON CONFLICT ("repositoryId", "filePath", "chunkIndex") DO UPDATE SET
            "lastSeenScanJobId" = EXCLUDED."lastSeenScanJobId",
            language            = EXCLUDED.language,
            "fileCategory"      = EXCLUDED."fileCategory",
            "chunkType"         = EXCLUDED."chunkType",
            "pathBucket"        = EXCLUDED."pathBucket",
            content             = EXCLUDED.content,
            "contentHash"       = EXCLUDED."contentHash",
            embedding           = EXCLUDED.embedding,
            "tokenCount"        = EXCLUDED."tokenCount",
            "updatedAt"         = NOW()
        """,
        (
            repository_id,
            scan_job_id,
            file_path,
            chunk_index,
            language,
            file_category,
            chunk_type,
            path_bucket,
            content,
            content_hash,
            token_count,
            vector_literal,
            EMBEDDING_MODEL,
            EMBEDDING_DIMENSIONS,
        ),
    )


def get_existing_chunk_hashes_for_file(
    conn,
    repository_id: str,
    file_path: str,
) -> dict[int, str]:
    rows = conn.execute(
        """
        SELECT "chunkIndex", "contentHash"
        FROM "CodeDocument"
        WHERE "repositoryId" = %s
          AND "filePath" = %s
        """,
        (repository_id, file_path),
    ).fetchall()
    return {int(row[0]): row[1] for row in rows}


def delete_stale_chunks(conn, repository_id: str, scan_job_id: str) -> None:
    conn.execute(
        """
        DELETE FROM "CodeDocument"
        WHERE "repositoryId" = %s
          AND COALESCE("lastSeenScanJobId"::text, '') <> %s
        """,
        (repository_id, scan_job_id),
    )


def delete_chunks_for_paths(conn, repository_id: str, file_paths: list[str]) -> None:
    if not file_paths:
        return

    conn.execute(
        """
        DELETE FROM "CodeDocument"
        WHERE "repositoryId" = %s
          AND "filePath" = ANY(%s)
        """,
        (repository_id, file_paths),
    )


def delete_chunks_for_file_except_indices(
    conn,
    repository_id: str,
    file_path: str,
    keep_chunk_indices: list[int],
) -> None:
    if keep_chunk_indices:
        conn.execute(
            """
            DELETE FROM "CodeDocument"
            WHERE "repositoryId" = %s
              AND "filePath" = %s
              AND NOT ("chunkIndex" = ANY(%s))
            """,
            (repository_id, file_path, keep_chunk_indices),
        )
        return

    conn.execute(
        """
        DELETE FROM "CodeDocument"
        WHERE "repositoryId" = %s
          AND "filePath" = %s
        """,
        (repository_id, file_path),
    )


def mark_file_chunks_seen(
    conn,
    repository_id: str,
    file_path: str,
    scan_job_id: str,
) -> None:
    conn.execute(
        """
        UPDATE "CodeDocument"
        SET "lastSeenScanJobId" = %s
        WHERE "repositoryId" = %s
          AND "filePath" = %s
        """,
        (scan_job_id, repository_id, file_path),
    )


def search_similar_chunks(
    conn,
    repository_id: str,
    query_vector: list[float],
    limit: int = 6,
    language: str | None = None,
    file_category: str | None = None,
    path_prefix: str | None = None,
) -> list[dict]:
    """Fetch relevant code chunks for repository QA."""
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"
    like_path = f"{path_prefix}%" if path_prefix else None
    rows = conn.execute(
        """
        SELECT
            id::text,
            "filePath",
            "chunkIndex",
            language,
            "fileCategory",
            "chunkType",
            "pathBucket",
            content,
            (1 - (embedding <=> %s::vector))::float8 AS score
        FROM "CodeDocument"
        WHERE "repositoryId" = %s::uuid
          AND embedding IS NOT NULL
          AND (%s::text IS NULL OR language = %s)
          AND (%s::text IS NULL OR "fileCategory" = %s)
          AND (%s::text IS NULL OR "filePath" ILIKE %s)
        ORDER BY embedding <=> %s::vector
        LIMIT %s
        """,
        (
            vector_literal,
            repository_id,
            language,
            language,
            file_category,
            file_category,
            like_path,
            like_path,
            vector_literal,
            limit,
        ),
    ).fetchall()

    return [
        {
            "id": row[0],
            "filePath": row[1],
            "chunkIndex": row[2],
            "language": row[3],
            "fileCategory": row[4],
            "chunkType": row[5],
            "pathBucket": row[6],
            "content": row[7],
            "score": float(row[8]),
        }
        for row in rows
    ]
