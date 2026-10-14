"""
Query and code tokenization shared by lexical search and the hash embedder.
"""

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


# Words that carry no signal in a question about code ("how does X work", "add Y").
_QUERY_STOPWORDS = {
    "work", "get", "use", "us", "happen", "file", "code", "implement", "there", "their",
    "can", "should", "would", "about", "all", "any", "new", "add", "make", "find", "show",
    "look", "like", "into", "our", "my", "your", "via", "has", "have", "been", "being",
}


def query_terms(query: str, limit: int = 8) -> list[str]:
    """Distinct, stemmed, meaningful terms of a question, in order, for lexical matching."""
    terms: list[str] = []
    for token in tokenize(query):
        if len(token) < 3 or token in _QUERY_STOPWORDS or token in terms:
            continue
        terms.append(token)
        if len(terms) >= limit:
            break
    return terms
