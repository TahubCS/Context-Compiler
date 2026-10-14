"""
Deterministic, offline "hashing trick" embeddings.

Used when EMBEDDING_PROVIDER=hash: in tests, CI and the offline eval, where no
Gemini key is available. It captures shared identifiers and words, not meaning,
so retrieval scores from it are a lower bound for what Gemini embeddings give.
"""

import hashlib
import math
import re

_WORD_RE = re.compile(r"[A-Za-z0-9]+")
_CAMEL_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")
_STOPWORDS = {
    "the", "and", "for", "are", "how", "does", "where", "what", "which", "when", "who",
    "with", "from", "into", "this", "that", "its", "is", "of", "to", "in", "on", "a",
    "an", "be", "by", "or", "as", "it", "at", "do", "we", "you", "self", "return",
}


def _stem(token: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if len(token) > len(suffix) + 3 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    for word in _WORD_RE.findall(text):
        for part in _CAMEL_RE.findall(word) or [word]:
            token = part.lower()
            if len(token) < 2 or token in _STOPWORDS:
                continue
            tokens.append(_stem(token))
    return tokens


def _bucket(feature: str, dimensions: int) -> tuple[int, float]:
    digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
    value = int.from_bytes(digest, "big")
    return value % dimensions, 1.0 if (value >> 63) & 1 else -1.0


def hash_embed(text: str, dimensions: int) -> list[float]:
    counts: dict[str, float] = {}
    tokens = tokenize(text)
    for token in tokens:
        counts[token] = counts.get(token, 0.0) + 1.0
    for left, right in zip(tokens, tokens[1:]):
        bigram = f"{left} {right}"
        counts[bigram] = counts.get(bigram, 0.0) + 0.5

    vector = [0.0] * dimensions
    for feature, count in counts.items():
        index, sign = _bucket(feature, dimensions)
        vector[index] += sign * (1.0 + math.log(count))

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        # pgvector cosine distance is undefined for zero vectors.
        vector[0] = 1.0
        return vector
    return [value / norm for value in vector]
