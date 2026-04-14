"""
Vector store — handles PostgreSQL/pgvector database operations for CodeDocument storage.
"""

import logging
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

import psycopg

from config import DATABASE_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

logger = logging.getLogger("context-compiler.vector_store")

# psycopg3 only accepts standard libpq URI params — strip any driver-specific
# hints like ?pgbouncer=true that Prisma/SQLAlchemy add to the connection string.
_PSYCOPG_UNSUPPORTED_PARAMS = {"pgbouncer"}

def _sanitize_db_url(url: str) -> str:
    """Remove query parameters that psycopg3 doesn't understand."""
    parsed = urlparse(url)
    params = {
        k: v for k, v in parse_qs(parsed.query).items()
        if k not in _PSYCOPG_UNSUPPORTED_PARAMS
    }
    clean_query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse(parsed._replace(query=clean_query))

_DB_URL = _sanitize_db_url(DATABASE_URL)


def get_connection():
    """Create a new database connection (caller must manage lifecycle)."""
    return psycopg.connect(_DB_URL, autocommit=False)


def upsert_chunk(
    conn,
    scan_job_id: str,
    repository_id: str,
    file_path: str,
    chunk_index: int,
    language: str | None,
    content: str,
    content_hash: str,
    token_count: int,
    embedding: list[float],
) -> None:
    """Insert or update a single code chunk with its embedding vector."""
    vector_literal = "[" + ",".join(str(v) for v in embedding) + "]"
    conn.execute(
        """
        INSERT INTO "CodeDocument" (
            id, "repositoryId", "lastSeenScanJobId", "filePath", "chunkIndex", language,
            content, "contentHash", "tokenCount", embedding,
            "embeddingModel", "embeddingDimensions", "updatedAt"
        )
        VALUES (
            gen_random_uuid(), %s, %s, %s, %s, %s,
            %s, %s, %s, %s::vector,
            %s, %s, NOW()
        )
        ON CONFLICT ("repositoryId", "filePath", "chunkIndex") DO UPDATE SET
            "lastSeenScanJobId" = EXCLUDED."lastSeenScanJobId",
            content            = EXCLUDED.content,
            "contentHash"      = EXCLUDED."contentHash",
            embedding          = EXCLUDED.embedding,
            "tokenCount"       = EXCLUDED."tokenCount",
            "updatedAt"        = NOW()
        WHERE "CodeDocument"."contentHash" != EXCLUDED."contentHash"
        """,
        (
            repository_id, scan_job_id, file_path, chunk_index, language,
            content, content_hash, token_count, vector_literal,
            EMBEDDING_MODEL, EMBEDDING_DIMENSIONS,
        ),
    )


def delete_stale_chunks(conn, repository_id: str, scan_job_id: str) -> None:
    """Delete chunks for a repository that were not refreshed by the current scan."""
    conn.execute(
        """
        DELETE FROM "CodeDocument"
        WHERE "repositoryId" = %s
          AND COALESCE("lastSeenScanJobId"::text, '') <> %s
        """,
        (repository_id, scan_job_id),
    )


def search_similar_chunks(
    conn,
    repository_id: str,
    query_vector: list[float],
    limit: int = 6,
) -> list[dict]:
    """Fetch relevant code chunks for repository QA."""
    vector_literal = "[" + ",".join(str(v) for v in query_vector) + "]"
    rows = conn.execute(
        """
        SELECT
            id::text,
            "filePath",
            "chunkIndex",
            language,
            content,
            (1 - (embedding <=> %s::vector))::float8 AS score
        FROM "CodeDocument"
        WHERE "repositoryId" = %s::uuid
          AND embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT %s
        """,
        (vector_literal, repository_id, vector_literal, limit),
    ).fetchall()

    return [
        {
            "id": row[0],
            "filePath": row[1],
            "chunkIndex": row[2],
            "language": row[3],
            "content": row[4],
            "score": float(row[5]),
        }
        for row in rows
    ]
