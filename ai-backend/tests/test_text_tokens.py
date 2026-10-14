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


def test_path_tokens_split_name_and_directories():
    from text_tokens import path_tokens

    assert path_tokens("packages/lib/server-only/auth/hash.ts") == (["hash"], ["packag", "lib", "server", "only", "auth"])
    assert path_tokens("internal/reader/handler/handler.go") == (["handler"], ["internal", "reader", "handler"])


def test_declared_name_tokens_across_languages():
    from text_tokens import declared_name_tokens

    assert {"sign", "field", "token"} <= declared_name_tokens("export const signFieldWithToken = async ({ token }) => {")
    assert {"refresh", "feed"} <= declared_name_tokens("func (h *Handler) RefreshFeed(store *storage.Storage) error {")
    assert {"generate", "jwt", "token"} <= declared_name_tokens("    def _generate_jwt_token(self):")
    assert {"user", "manager"} <= declared_name_tokens("class UserManager(BaseUserManager):")
    assert declared_name_tokens("const limit = 10") == set()
