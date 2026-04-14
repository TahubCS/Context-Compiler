"""
Gemini client helpers for embeddings and grounded answer generation.
"""

import logging
import random
import time

from google import genai
from google.genai.errors import APIError, ClientError

from config import ANSWER_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, GOOGLE_GEMINI_API_KEY

logger = logging.getLogger("context-compiler.ai")

gemini_client = genai.Client(api_key=GOOGLE_GEMINI_API_KEY)

_MAX_RETRIES = 6
_BASE_DELAY_S = 5.0
_MAX_DELAY_S = 120.0


def embed_text(text: str) -> list[float]:
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

                jitter = random.uniform(0, delay * 0.3)
                wait = min(delay + jitter, _MAX_DELAY_S)
                logger.warning(
                    "Rate limited (429) on attempt %d/%d, waiting %.1fs before retry.",
                    attempt + 1,
                    _MAX_RETRIES,
                    wait,
                )
                time.sleep(wait)
                delay = min(delay * 2, _MAX_DELAY_S)
            else:
                logger.error("Gemini client error %s: %s", exc.code, exc.message)
                raise
        except APIError as exc:
            logger.error("Gemini server error %s: %s", exc.code, exc.message)
            raise


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

    response = gemini_client.models.generate_content(
        model=ANSWER_MODEL,
        contents=prompt,
    )

    return (response.text or "").strip()
