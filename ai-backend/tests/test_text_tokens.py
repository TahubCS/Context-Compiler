from text_tokens import query_terms
from vector_store import _escape_like


def test_query_terms_drop_question_words_and_stem():
    assert query_terms("Where are JWT tokens generated?") == ["jwt", "token", "generat"]
    assert query_terms("How does following a user work?") == ["follow", "user"]


def test_query_terms_split_identifiers_and_dedupe():
    assert query_terms("getFavoriteCount favorite_count") == ["favorite", "count"]


def test_query_terms_limit():
    assert len(query_terms("alpha beta gamma delta epsilon zeta theta iota kappa", limit=8)) == 8


def test_escape_like_makes_wildcards_literal():
    assert _escape_like("src/my_app%") == "src/my\\_app\\%"
    assert _escape_like("a\\b") == "a\\\\b"
