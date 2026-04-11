"""
Vector store — handles PostgreSQL/pgvector database operations for CodeDocument storage.
"""

import logging

import psycopg

from config import DATABASE_URL, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

logger = logging.getLogger("context-compiler.vector_store")


def get_connection():
    """Create a new database connection (caller must manage lifecycle)."""
    return psycopg.connect(DATABASE_URL, autocommit=False)


def upsert_chunk(
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
    """Insert or update a single code chunk with its embedding vector."""
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
            %s, %s, NOW()
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
            EMBEDDING_MODEL, EMBEDDING_DIMENSIONS,
        ),
    )
