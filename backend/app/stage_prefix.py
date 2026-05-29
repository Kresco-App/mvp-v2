def strip_stage_prefix(environ: dict, prefix: str) -> None:
    script_name = str(environ.get("SCRIPT_NAME") or "")
    if script_name == prefix:
        environ["SCRIPT_NAME"] = ""
    elif script_name.startswith(prefix + "/"):
        environ["SCRIPT_NAME"] = script_name[len(prefix) :]

    path = str(environ.get("PATH_INFO") or "")
    if path == prefix:
        environ["PATH_INFO"] = "/"
    elif path.startswith(prefix + "/"):
        environ["PATH_INFO"] = path[len(prefix) :]
