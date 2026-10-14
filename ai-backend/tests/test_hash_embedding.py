import math

from hash_embedding import hash_embed, tokenize


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b))


def test_tokenize_splits_identifiers_and_stems():
    assert tokenize("generateJwtToken user_tokens HTTPServer") == [
        "generate", "jwt", "token", "user", "token", "http", "server",
    ]


def test_embedding_is_deterministic_and_normalized():
    first = hash_embed("def validate_session(token): ...", 768)
    assert first == hash_embed("def validate_session(token): ...", 768)
    assert len(first) == 768
    assert math.isclose(math.sqrt(sum(v * v for v in first)), 1.0, rel_tol=1e-9)


def test_shared_terms_score_higher_than_unrelated_text():
    query = hash_embed("Where are JWT tokens generated?", 768)
    related = hash_embed("def _generate_jwt_token(self):\n    token = jwt.encode(payload)", 768)
    unrelated = hash_embed("class TagListAPIView(generics.ListAPIView): pass", 768)
    assert cosine(query, related) > cosine(query, unrelated)


def test_empty_text_is_not_a_zero_vector():
    assert any(hash_embed("", 16))
