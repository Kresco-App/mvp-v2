from __future__ import annotations

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings
from app.database import _build_async_url


def main() -> None:
    settings = get_settings()
    os.environ["DATABASE_URL"] = settings.database_url
    os.environ["PGSSLROOTCERT"] = settings.pgsslrootcert
    _, connect_args = _build_async_url(settings.database_url, settings.pgsslrootcert)
    print(
        "alembic_settings_resolved "
        f"strategy={settings.database_connection_strategy} "
        f"cloud_sql_socket={str(connect_args.get('host', '')).startswith('/cloudsql/')}"
    )

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    command.upgrade(config, "head")


if __name__ == "__main__":
    main()
