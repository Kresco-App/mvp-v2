# AGENTS.md

Instructions for AI coding agents working in this repository.

## sqz Token Compression

This workspace is configured for `sqz`, a local context-compression helper.
Use it only for verbose command output where compression will not hide
important details.

Good candidates:

- repeated file reads
- large `git diff` or `git log` output
- long test runs after the first exact failure has already been captured
- noisy build logs

Use:

```powershell
git diff 2>&1 | sqz compress
python -m pytest 2>&1 | sqz compress
gh run view <run-id> --log-failed 2>&1 | sqz compress
```

Do not use `sqz` for:

- exact CI/deploy/security failures where raw lines matter
- short commands
- interactive commands
- commands that may print secrets

If compressed output returns a ref token, expand it with:

```powershell
sqz expand <ref>
```

If `sqz` is unavailable, run commands normally.
