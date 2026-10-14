"""
Search tests against a real PostgreSQL + pgvector database.

Skipped unless TEST_DATABASE_URL points at a disposable database; CI provides one. The
tests create their own minimal "CodeDocument" table, so the database must not be shared.
"""

import os
import uuid

import pytest

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL is not set")

DIMENSIONS = 768


@pytest.fixture(scope="module")
def conn():
    import psycopg

    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute("CREATE EXTENSION IF NOT EXISTS vector")
        connection.execute('DROP TABLE IF EXISTS "CodeDocument"')
        connection.execute(
            f"""
            CREATE TABLE "CodeDocument" (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "repositoryId" uuid NOT NULL,
                "lastSeenScanJobId" uuid,
                "filePath" text NOT NULL,
                "chunkIndex" int NOT NULL DEFAULT 0,
                language text,
                "fileCategory" text,
                "chunkType" text,
                "pathBucket" text,
                content text NOT NULL,
                "contentHash" text NOT NULL,
                "tokenCount" int NOT NULL DEFAULT 0,
                embedding vector({DIMENSIONS}),
                "embeddingModel" text,
                "embeddingDimensions" int,
                "searchTokens" tsvector,
                metadata jsonb,
                "createdAt" timestamp(3) NOT NULL DEFAULT now(),
                "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
                UNIQUE ("repositoryId", "filePath", "chunkIndex")
            )
            """
        )
        connection.execute(
            'CREATE INDEX idx_code_documents_embedding ON "CodeDocument" USING hnsw (embedding vector_cosine_ops)'
        )
        connection.execute('CREATE INDEX ON "CodeDocument" ("repositoryId")')
        connection.execute('CREATE INDEX idx_code_documents_search ON "CodeDocument" USING GIN ("searchTokens")')
        connection.commit()
        yield connection


def _insert(conn, repository_id: str, file_path: str, content: str, chunk_index: int = 0) -> None:
    from hash_embedding import hash_embed
    from vector_store import upsert_chunk

    upsert_chunk(
        conn,
        scan_job_id=str(uuid.uuid4()),
        repository_id=repository_id,
        file_path=file_path,
        chunk_index=chunk_index,
        language="typescript",
        file_category="source",
        chunk_type="code",
        path_bucket=file_path.split("/")[0],
        content=content,
        content_hash=str(hash(content)),
        token_count=len(content.split()),
        embedding=hash_embed(content, DIMENSIONS),
    )


@pytest.fixture(scope="module")
def repos(conn):
    """A small repository indexed next to a much larger one."""
    small = str(uuid.uuid4())
    large = str(uuid.uuid4())
    _insert(conn, small, "src/auth/hash.ts", "export async function hashPassword(password: string) { return bcrypt.hash(password, 12) }")
    _insert(conn, small, "src/user/update-password.ts", "export async function updatePassword(user, password) { user.password = password }")
    _insert(conn, small, "src/user/profile.ts", "export function getProfile(user) { return { name: user.name } }")
    _insert(conn, small, "src/my_app/feature.ts", "export const feature = true")
    for i in range(400):
        _insert(conn, large, f"pkg/module{i}/password-{i}.ts", f"export function check{i}(password: string, user) {{ return password.length > {i} }}")
    conn.commit()
    return {"small": small, "large": large}


def test_upsert_writes_weighted_search_tokens(conn, repos):
    row = conn.execute(
        """SELECT "searchTokens"::text FROM "CodeDocument" WHERE "repositoryId" = %s AND "filePath" = 'src/auth/hash.ts'""",
        (repos["small"],),
    ).fetchone()
    assert "'hash':" in row[0] and "A" in row[0]


def test_semantic_search_is_not_starved_by_other_repositories(conn, repos):
    from hash_embedding import hash_embed
    from vector_store import _semantic_candidates

    # The large repository dominates the shared HNSW index; the small one must still get all its rows.
    rows = _semantic_candidates(conn, repos["small"], hash_embed("password", DIMENSIONS), None, None, None, 4)
    assert len(rows) == 4
    assert {row["filePath"] for row in rows} >= {"src/auth/hash.ts", "src/user/update-password.ts"}


def test_rare_terms_outweigh_common_ones(conn, repos):
    from hash_embedding import hash_embed
    from vector_store import search_hybrid_chunks

    query = "How are user passwords hashed?"
    results = search_hybrid_chunks(conn, repos["small"], query, hash_embed(query, DIMENSIONS), limit=4)
    assert results[0]["filePath"] == "src/auth/hash.ts"


def test_lexical_search_uses_the_token_index(conn, repos):
    from vector_store import _has_search_tokens, _lexical_candidates

    assert _has_search_tokens(conn, repos["small"])
    rows = _lexical_candidates(conn, repos["small"], "hash password", None, None, None, 10)
    assert rows and rows[0]["filePath"] in {"src/auth/hash.ts", "src/user/update-password.ts"}


def test_path_prefix_wildcards_match_literally(conn, repos):
    from hash_embedding import hash_embed
    from vector_store import _semantic_candidates

    # "_" is a LIKE wildcard; unescaped, "src/my_" would also match "src/myXapp".
    rows = _semantic_candidates(conn, repos["small"], hash_embed("feature", DIMENSIONS), None, None, "src/my_", 10)
    assert [row["filePath"] for row in rows] == ["src/my_app/feature.ts"]
