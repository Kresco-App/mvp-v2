#!/usr/bin/env python
import sys


def main() -> int:
    message = (
        "Django manage.py is deprecated in this repository.\n"
        "Use FastAPI + Alembic commands instead.\n"
        "Run backend with: python -m uvicorn app.main:create_app --factory --reload\n"
        "Run migrations with: alembic upgrade head\n"
    )
    sys.stderr.write(message)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
