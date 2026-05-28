from app.services.search import normalize_substring_search, substring_search_pattern


def test_normalize_substring_search_ignores_short_terms():
    assert normalize_substring_search(" a ") == ""
    assert normalize_substring_search("ab") == ""
    assert normalize_substring_search(" abc ") == "abc"
    assert len(normalize_substring_search("x" * 120)) == 80


def test_substring_search_pattern_escapes_like_wildcards():
    assert substring_search_pattern("a%b_c\\d") == "%a\\%b\\_c\\\\d%"
