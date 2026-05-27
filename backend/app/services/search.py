LIKE_ESCAPE = "\\"
MIN_SUBSTRING_SEARCH_CHARS = 3
MAX_SUBSTRING_SEARCH_CHARS = 80


def normalize_substring_search(
    value: str | None,
    *,
    min_length: int = MIN_SUBSTRING_SEARCH_CHARS,
    max_length: int = MAX_SUBSTRING_SEARCH_CHARS,
) -> str:
    term = (value or "").strip()[:max_length]
    return term if len(term) >= min_length else ""


def escape_like_wildcards(value: str) -> str:
    return (
        value
        .replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", f"{LIKE_ESCAPE}%")
        .replace("_", f"{LIKE_ESCAPE}_")
    )


def substring_search_pattern(value: str) -> str:
    return f"%{escape_like_wildcards(value)}%"
