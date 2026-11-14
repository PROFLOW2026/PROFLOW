"""Load catalog.default.json (mirrors TS catalog.ts)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from ..models import CatalogType

_PKG = Path(__file__).resolve().parent
_REPO_CATALOG = _PKG.parents[3] / "src/modules/electrical-takeoff/domain/catalog.default.json"


def _catalog_path() -> Path:
    local = _PKG / "catalog.default.json"
    if local.is_file():
        return local
    if _REPO_CATALOG.is_file():
        return _REPO_CATALOG
    raise FileNotFoundError("catalog.default.json not found")


@lru_cache(maxsize=1)
def load_default_catalog() -> list[CatalogType]:
    path = _catalog_path()
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [CatalogType.model_validate(item) for item in raw]