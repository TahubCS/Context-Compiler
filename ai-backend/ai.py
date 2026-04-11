"""
Gemini embedding client — wraps google-genai for embedding generation.
"""

import logging

from google import genai

from config import GOOGLE_GEMINI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS

logger = logging.getLogger("context-compiler.ai")

# Singleton Gemini client (initialized once at import time)
gemini_client = genai.Client(api_key=GOOGLE_GEMINI_API_KEY)


def embed_text(text: str) -> list[float]:
    """Generate a 768-dim embedding vector for the given text."""
    result = gemini_client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config={"output_dimensionality": EMBEDDING_DIMENSIONS},
    )
    return result.embeddings[0].values
