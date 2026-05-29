def strip_stage_prefix(environ: dict, prefix: str) -> None:
    path = str(environ.get("PATH_INFO") or "")
    if path == prefix:
        environ["PATH_INFO"] = "/"
    elif path.startswith(prefix + "/"):
        environ["PATH_INFO"] = path[len(prefix) :]
