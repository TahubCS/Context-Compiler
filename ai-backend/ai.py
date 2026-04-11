"""
Gemini embedding client — wraps google-genai for embedding generation.

Rate limit strategy: exponential backoff with jitter on 429 errors.
We DO NOT switch models mid-scan — all vectors must use the same model
for cosine similarity to be meaningful across the codebase.
"""

import logging
import random
import time

from google import genai
from google.genai.errors import ClientError, APIError

from config import GOOGLE_GEMINI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

logger = logging.getLogger("context-compiler.ai")

# Singleton Gemini client (initialized once at import time)
gemini_client = genai.Client(api_key=GOOGLE_GEMINI_API_KEY)

# Retry config for 429 rate-limit errors
_MAX_RETRIES = 6
_BASE_DELAY_S = 5.0    # start at 5 s
_MAX_DELAY_S = 120.0   # cap at 2 min


def embed_text(text: str) -> list[float]:
    """
    Generate a 768-dim embedding vector for the given text.

    Retries up to _MAX_RETRIES times with exponential backoff + jitter
    when the Gemini API returns a 429 (rate limit / quota exceeded).
    Raises immediately on any other error.
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

        except ClientError as e:
            if e.code == 429:
                # Quota / rate limit hit — back off and retry
                if attempt == _MAX_RETRIES:
                    logger.error(
                        "Embedding rate-limited after %d retries, giving up.", _MAX_RETRIES
                    )
                    raise

                jitter = random.uniform(0, delay * 0.3)
                wait = min(delay + jitter, _MAX_DELAY_S)
                logger.warning(
                    "Rate limited (429) on attempt %d/%d — waiting %.1fs before retry.",
                    attempt + 1, _MAX_RETRIES, wait,
                )
                time.sleep(wait)
                delay = min(delay * 2, _MAX_DELAY_S)
            else:
                # 4xx but not 429 (e.g. 400 bad request, 403 auth) — fail fast
                logger.error("Gemini client error %s: %s", e.code, e.message)
                raise

        except APIError as e:
            # 5xx server errors — fail fast, no point retrying
            logger.error("Gemini server error %s: %s", e.code, e.message)
            raise
