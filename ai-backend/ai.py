"""
Gemini client helpers for embeddings and grounded answer generation.
"""

import logging
import random
import time
from collections.abc import Callable

from google import genai
from google.genai.errors import APIError, ClientError

from config import (
    ANSWER_MODEL,
    ANSWER_MODEL_FALLBACKS,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    GOOGLE_GEMINI_API_KEY,
)

logger = logging.getLogger("context-compiler.ai")

gemini_client = genai.Client(api_key=GOOGLE_GEMINI_API_KEY)

_MAX_RETRIES = 6
_BASE_DELAY_S = 5.0
_MAX_DELAY_S = 120.0


def _compute_wait(delay: float) -> float:
    jitter = random.uniform(0, delay * 0.3)
    return min(delay + jitter, _MAX_DELAY_S)


def embed_text(
    text: str,
    on_retry_wait: Callable[[float, int, int], None] | None = None,
) -> list[float]:
    """
    Generate a 768-dim embedding vector for the given text.
    """
    delay = _BASE_DELAY_S

    for attempt in range(_MAX_RETRIES + 1):
        try:
            result = gemini_client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text,
                config={"output_dimensionality": EMBEDDING_DIMENSIONS},
            )
            return result.embeddings[0].values
        except ClientError as exc:
            if exc.code == 429:
                if attempt == _MAX_RETRIES:
                    logger.error(
                        "Embedding rate-limited after %d retries, giving up.", _MAX_RETRIES
                    )
                    raise

                wait = _compute_wait(delay)
                logger.warning(
                    "Rate limited (429) on attempt %d/%d, waiting %.1fs before retry.",
                    attempt + 1,
                    _MAX_RETRIES,
                    wait,
                )
                if on_retry_wait:
                    on_retry_wait(wait, attempt + 1, _MAX_RETRIES)
                time.sleep(wait)
                delay = min(delay * 2, _MAX_DELAY_S)
            else:
                logger.error("Gemini client error %s: %s", exc.code, exc.message)
                raise
        except APIError as exc:
            logger.error("Gemini server error %s: %s", exc.code, exc.message)
            raise


def _answer_models() -> list[str]:
    models: list[str] = []
    for model in [ANSWER_MODEL, *ANSWER_MODEL_FALLBACKS]:
        if model and model not in models:
            models.append(model)
    return models


def _should_fallback_answer_error(exc: Exception) -> bool:
    if isinstance(exc, ClientError):
        return exc.code == 429
    if isinstance(exc, APIError):
        return exc.code in {500, 503}
    return False


def _generate_with_model_once(model: str, prompt: str) -> str:
    response = gemini_client.models.generate_content(
        model=model,
        contents=prompt,
    )
    return (response.text or "").strip()


def generate_grounded_answer(question: str, citations: list[dict]) -> str:
    """
    Generate a concise answer using the retrieved repository context only.
    """
    context_blocks: list[str] = []
    for citation in citations:
        context_blocks.append(
            "\n".join(
                [
                    f"FILE: {citation['filePath']} (chunk {citation['chunkIndex']})",
                    citation["content"],
                ]
            )
        )

    prompt = "\n\n".join(
        [
            "You answer questions about a code repository.",
            "Use only the supplied repository context.",
            "If the context is incomplete, say what is missing instead of inventing details.",
            "Keep the answer concise, high-signal, and reference file paths when useful.",
            f"Question:\n{question}",
            "Repository context:",
            "\n\n".join(context_blocks),
        ]
    )

    last_error: Exception | None = None
    for model in _answer_models():
        try:
            answer = _generate_with_model_once(model, prompt)
            if model != ANSWER_MODEL:
                logger.warning("Answer generation fell back from %s to %s.", ANSWER_MODEL, model)
            return answer
        except Exception as exc:
            last_error = exc
            if _should_fallback_answer_error(exc):
                logger.warning(
                    "Answer model %s is temporarily unavailable, trying next model immediately: %s",
                    model,
                    exc,
                )
                continue

            logger.warning(
                "Answer model %s failed, trying next fallback if available: %s",
                model,
                exc,
            )
            continue

    raise RuntimeError("All Gemini answer models failed.") from last_error
