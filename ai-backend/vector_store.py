import logging
import re
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import psycopg

from config import DATABASE_URL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL

logger = logging.getLogger("context-compiler.vector_store")

_PSYCOPG_UNSUPPORTED_PARAMS = {"pgbouncer"}
_SYMBOL_QUERY_RE = re.compile(r"^[A-Za-z_$][\w$]*(?:[.:][A-Za-z_$][\w$]*)*$")
_SEARCH_SEMANTIC_LIMIT = 40
_SEARCH_LEXICAL_LIMIT = 30
_MAX_RESULTS_PER_FILE = 2


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


def _normalize_optional_filter(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _is_symbol_style_query(query: str) -> bool:
    return bool(_SYMBOL_QUERY_RE.fullmatch(query.strip()))


def _extract_symbol_token(query: str) -> str:
    return re.split(r"[.:]", query.strip())[-1]


def _compile_symbol_patterns(symbol: str) -> tuple[re.Pattern[str], re.Pattern[str]]:
    escaped = re.escape(symbol)
    exact = re.compile(rf"(?<![\w$]){escaped}(?![\w$])", re.IGNORECASE)
    declaration = re.compile(
        "|".join(
            [
                rf"(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+{escaped}\b",
                rf"(?:^|\s)(?:export\s+)?(?:const|let|var)\s+{escaped}\b",
                rf"(?:^|\s)class\s+{escaped}\b",
                rf"(?:^|\s)(?:async\s+def|def)\s+{escaped}\b",
            ]
        ),
        re.IGNORECASE | re.MULTILINE,
    )
    return exact, declaration


def _semantic_candidates(
    conn,
    repository_id: str,
    query_vector: list[float],
    language: str | None,
    file_category: str | None,
    path_prefix: str | None,
    limit: int,
) -> list[dict]:
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
            "chunkIndex": int(row[2]),
            "language": row[3],
            "fileCategory": row[4],
            "chunkType": row[5],
            "pathBucket": row[6],
            "content": row[7],
            "semanticScore": float(row[8]),
        }
        for row in rows
    ]


def _lexical_candidates(
    conn,
    repository_id: str,
    query: str,
    language: str | None,
    file_category: str | None,
    path_prefix: str | None,
    limit: int,
) -> list[dict]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    like_path_prefix = f"{path_prefix}%" if path_prefix else None
    is_symbol_style = _is_symbol_style_query(normalized_query)

    if is_symbol_style:
        symbol = _extract_symbol_token(normalized_query)
        exact_symbol_re, declaration_re = _compile_symbol_patterns(symbol)
        token_like = f"%{symbol.lower()}%"

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
                content
            FROM "CodeDocument"
            WHERE "repositoryId" = %s::uuid
              AND (%s::text IS NULL OR language = %s)
              AND (%s::text IS NULL OR "fileCategory" = %s)
              AND (%s::text IS NULL OR "filePath" ILIKE %s)
              AND (
                lower("filePath") LIKE %s
                OR lower(content) LIKE %s
              )
            ORDER BY "chunkIndex" ASC
            LIMIT %s
            """,
            (
                repository_id,
                language,
                language,
                file_category,
                file_category,
                like_path_prefix,
                like_path_prefix,
                token_like,
                token_like,
                limit,
            ),
        ).fetchall()

        results: list[dict] = []
        for row in rows:
            content = row[7]
            file_path = row[1]
            results.append(
                {
                    "id": row[0],
                    "filePath": file_path,
                    "chunkIndex": int(row[2]),
                    "language": row[3],
                    "fileCategory": row[4],
                    "chunkType": row[5],
                    "pathBucket": row[6],
                    "content": content,
                    "pathMatch": symbol.lower() in file_path.lower(),
                    "declarationMatch": bool(declaration_re.search(content)),
                    "symbolMatch": bool(exact_symbol_re.search(content)),
                }
            )
        return results

    tokens = [token.lower() for token in re.findall(r"[A-Za-z_][\w$-]{2,}", normalized_query)[:4]]
    if not tokens:
        return []

    path_patterns = [f"%{token}%" for token in tokens]
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
            CASE WHEN lower("filePath") LIKE ANY(%s) THEN 1 ELSE 0 END AS path_match,
            CASE WHEN lower(content) LIKE ANY(%s) THEN 1 ELSE 0 END AS content_match
        FROM "CodeDocument"
        WHERE "repositoryId" = %s::uuid
          AND (%s::text IS NULL OR language = %s)
          AND (%s::text IS NULL OR "fileCategory" = %s)
          AND (%s::text IS NULL OR "filePath" ILIKE %s)
          AND (
            lower("filePath") LIKE ANY(%s)
            OR lower(content) LIKE ANY(%s)
          )
        ORDER BY path_match DESC, content_match DESC, "chunkIndex" ASC
        LIMIT %s
        """,
        (
            path_patterns,
            path_patterns,
            repository_id,
            language,
            language,
            file_category,
            file_category,
            like_path_prefix,
            like_path_prefix,
            path_patterns,
            path_patterns,
            limit,
        ),
    ).fetchall()

    return [
        {
            "id": row[0],
            "filePath": row[1],
            "chunkIndex": int(row[2]),
            "language": row[3],
            "fileCategory": row[4],
            "chunkType": row[5],
            "pathBucket": row[6],
            "content": row[7],
            "pathMatch": bool(row[8]),
            "contentMatch": bool(row[9]),
        }
        for row in rows
    ]


def _fetch_context_slice(
    conn,
    repository_id: str,
    file_path: str,
    chunk_index: int,
    source_content: str,
) -> tuple[str, int, int]:
    window = 2 if len(source_content) < 360 else 1
    start_index = max(0, chunk_index - window)
    end_index = chunk_index + window
    rows = conn.execute(
        """
        SELECT "chunkIndex", content
        FROM "CodeDocument"
        WHERE "repositoryId" = %s::uuid
          AND "filePath" = %s
          AND "chunkIndex" BETWEEN %s AND %s
        ORDER BY "chunkIndex" ASC
        """,
        (repository_id, file_path, start_index, end_index),
    ).fetchall()

    if not rows:
        return source_content, chunk_index, chunk_index

    actual_start = int(rows[0][0])
    actual_end = int(rows[-1][0])
    stitched = "\n\n".join(row[1] for row in rows)
    return stitched, actual_start, actual_end


def _merge_candidate(candidate_map: dict[str, dict], raw: dict, is_symbol_query: bool) -> None:
    candidate = candidate_map.setdefault(
        raw["id"],
        {
            "id": raw["id"],
            "filePath": raw["filePath"],
            "chunkIndex": raw["chunkIndex"],
            "language": raw.get("language"),
            "fileCategory": raw.get("fileCategory"),
            "chunkType": raw.get("chunkType"),
            "pathBucket": raw.get("pathBucket"),
            "sourceContent": raw["content"],
            "semanticScore": 0.0,
            "pathMatch": False,
            "symbolMatch": False,
            "declarationMatch": False,
            "contentMatch": False,
        },
    )

    candidate["sourceContent"] = raw["content"]
    candidate["semanticScore"] = max(candidate["semanticScore"], raw.get("semanticScore", 0.0))
    candidate["pathMatch"] = candidate["pathMatch"] or raw.get("pathMatch", False)
    candidate["symbolMatch"] = candidate["symbolMatch"] or raw.get("symbolMatch", False)
    candidate["declarationMatch"] = candidate["declarationMatch"] or raw.get("declarationMatch", False)
    candidate["contentMatch"] = candidate["contentMatch"] or raw.get("contentMatch", False)

    score = candidate["semanticScore"]
    if candidate["pathMatch"]:
        score += 0.22 if is_symbol_query else 0.12
    if candidate["symbolMatch"]:
        score += 0.42
    if candidate["declarationMatch"]:
        score += 0.38
    if candidate["contentMatch"] and not is_symbol_query:
        score += 0.08
    if is_symbol_query and candidate.get("fileCategory") == "source":
        score += 0.08

    candidate["finalScore"] = score


def _match_reason(candidate: dict) -> str:
    if candidate["declarationMatch"]:
        return "Likely declaration"
    if candidate["symbolMatch"]:
        return "Exact symbol"
    if candidate["pathMatch"]:
        return "Path match"
    return "Semantic match"


def search_hybrid_chunks(
    conn,
    repository_id: str,
    query: str,
    query_vector: list[float],
    limit: int = 6,
    language: str | None = None,
    file_category: str | None = None,
    path_prefix: str | None = None,
) -> list[dict]:
    language = _normalize_optional_filter(language)
    file_category = _normalize_optional_filter(file_category)
    path_prefix = _normalize_optional_filter(path_prefix)
    normalized_query = query.strip()
    is_symbol_query = _is_symbol_style_query(normalized_query)

    semantic_rows = _semantic_candidates(
        conn,
        repository_id,
        query_vector,
        language,
        file_category,
        path_prefix,
        _SEARCH_SEMANTIC_LIMIT,
    )
    try:
        lexical_rows = _lexical_candidates(
            conn,
            repository_id,
            normalized_query,
            language,
            file_category,
            path_prefix,
            _SEARCH_LEXICAL_LIMIT,
        )
    except Exception:
        logger.exception(
            "Hybrid lexical search failed for repo=%s query=%r; falling back to semantic-only results.",
            repository_id,
            normalized_query,
        )
        lexical_rows = []

    candidate_map: dict[str, dict] = {}
    for row in semantic_rows:
        _merge_candidate(candidate_map, row, is_symbol_query)
    for row in lexical_rows:
        _merge_candidate(candidate_map, row, is_symbol_query)

    ranked = sorted(
        candidate_map.values(),
        key=lambda candidate: (
            candidate.get("finalScore", candidate["semanticScore"]),
            candidate["declarationMatch"],
            candidate["symbolMatch"],
            candidate["pathMatch"],
        ),
        reverse=True,
    )

    per_file_counts: dict[str, int] = {}
    results: list[dict] = []
    for candidate in ranked:
        file_path = candidate["filePath"]
        if per_file_counts.get(file_path, 0) >= _MAX_RESULTS_PER_FILE:
            continue

        try:
            context_content, start_chunk_index, end_chunk_index = _fetch_context_slice(
                conn,
                repository_id,
                file_path,
                candidate["chunkIndex"],
                candidate["sourceContent"],
            )
        except Exception:
            logger.exception(
                "Context slice fetch failed for repo=%s path=%s chunk=%s; using primary chunk only.",
                repository_id,
                file_path,
                candidate["chunkIndex"],
            )
            context_content = candidate["sourceContent"]
            start_chunk_index = candidate["chunkIndex"]
            end_chunk_index = candidate["chunkIndex"]

        results.append(
            {
                "id": candidate["id"],
                "filePath": file_path,
                "chunkIndex": candidate["chunkIndex"],
                "primaryChunkIndex": candidate["chunkIndex"],
                "contextStartChunkIndex": start_chunk_index,
                "contextEndChunkIndex": end_chunk_index,
                "language": candidate.get("language"),
                "fileCategory": candidate.get("fileCategory"),
                "chunkType": candidate.get("chunkType"),
                "pathBucket": candidate.get("pathBucket"),
                "content": context_content,
                "score": round(float(candidate.get("finalScore", candidate["semanticScore"])), 4),
                "matchReason": _match_reason(candidate),
                "declarationHint": "high" if candidate["declarationMatch"] else None,
            }
        )
        per_file_counts[file_path] = per_file_counts.get(file_path, 0) + 1

        if len(results) >= limit:
            break

    return results


def search_similar_chunks(
    conn,
    repository_id: str,
    query: str,
    query_vector: list[float],
    limit: int = 6,
    language: str | None = None,
    file_category: str | None = None,
    path_prefix: str | None = None,
) -> list[dict]:
    """Fetch hybrid-ranked repository context for search and answer generation."""
    return search_hybrid_chunks(
        conn,
        repository_id=repository_id,
        query=query,
        query_vector=query_vector,
        limit=limit,
        language=language,
        file_category=file_category,
        path_prefix=path_prefix,
    )
