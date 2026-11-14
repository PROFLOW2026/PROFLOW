"""Memory / work budgets for heavy PDF plans (env-configurable)."""
from __future__ import annotations

import os
from dataclasses import dataclass

from . import shape_engine as E
from .geometry import PdfMatrix

# Align with pdf_engine min_extent for coloured symbols — never drop at/above this in thinning.
SYMBOL_MIN_EXT_PT = 3.5


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class HeavyBudget:
    # Soft limits: informational noise prune only (sub-symbol paths).
    max_path_objects: int = 250_000
    # Hard limit: exceeding after noise prune may truncate symbol-scale work (partial sheet).
    max_path_objects_hard: int = 400_000
    max_plan_candidates: int = 12_000
    max_legend_rows: int = 120
    max_text_chars: int = 250_000
    max_match_cells: int = 400_000

    @classmethod
    def from_env(cls) -> HeavyBudget:
        return cls(
            max_path_objects=_int_env("PDF_MAX_PATH_OBJECTS", 250_000),
            max_path_objects_hard=_int_env("PDF_MAX_PATH_OBJECTS_HARD", 400_000),
            max_plan_candidates=_int_env("PDF_MAX_PLAN_CANDIDATES", 12_000),
            max_legend_rows=_int_env("PDF_MAX_LEGEND_ROWS", 120),
            max_text_chars=_int_env("PDF_MAX_TEXT_CHARS", 250_000),
            max_match_cells=_int_env("PDF_MAX_MATCH_CELLS", 400_000),
        )


@dataclass(frozen=True)
class HeavyAssessment:
    path_objects: int
    drawing_items: int
    needs_noise_prune: bool
    exceeds_hard: bool
    reason: str | None = None


def assess_sheet_heavy(vst: dict[str, int], n_drawings: int, w: float, h: float, budget: HeavyBudget) -> HeavyAssessment:
    paths = int(vst.get("paths", 0))
    needs_noise = n_drawings > budget.max_path_objects or paths > budget.max_path_objects
    exceeds_hard = n_drawings > budget.max_path_objects_hard or paths > budget.max_path_objects_hard
    reason = None
    if exceeds_hard:
        reason = f"path_objects={paths},drawing_items={n_drawings}"
    elif needs_noise:
        reason = f"noise_prune:paths={paths},items={n_drawings}"
    _ = w, h
    return HeavyAssessment(paths, n_drawings, needs_noise, exceeds_hard, reason)


def prune_subsymbol_drawings(
    drawings: list[dict],
    M: PdfMatrix,
    *,
    symbol_min: float = SYMBOL_MIN_EXT_PT,
) -> tuple[list[dict], int]:
    """Drop hatch / stroke crumbs below symbol scale only."""
    if not drawings:
        return drawings, 0
    kept: list[dict] = []
    dropped = 0
    for d in drawings:
        r = E.drect(d, M)
        if max(r.width, r.height) < symbol_min:
            dropped += 1
            continue
        kept.append(d)
    return kept, dropped


def cap_plan_candidates(plan: list[E.Comp], limit: int) -> tuple[list[E.Comp], int]:
    if len(plan) <= limit:
        return plan, 0
    ranked = sorted(plan, key=lambda c: (-c.n, -c.rad, c.rect.width * c.rect.height))
    return ranked[:limit], len(plan) - limit


def cap_legend_comps(comps: list[E.Comp], limit: int) -> tuple[list[E.Comp], int]:
    if len(comps) <= limit:
        return comps, 0
    return comps[:limit], len(comps) - limit


def cap_legend_comps_prioritize_text(
    comps: list[E.Comp],
    limit: int,
    text_score: list[int],
) -> tuple[list[E.Comp], int]:
    """Keep legend rows with decodable text when capping (same sheet linking)."""
    if len(comps) <= limit:
        return comps, 0
    scored = list(zip(comps, text_score, strict=False))
    scored.sort(key=lambda t: (-t[1], (t[0].rect.y0 + t[0].rect.y1) / 2))
    kept = [c for c, _ in scored[:limit]]
    return kept, len(comps) - limit


def cap_templates_for_match(
    plan_n: int, templates_n: int, budget: HeavyBudget
) -> tuple[int, int]:
    """Return max template count and plan count so n_t * n_p <= budget.max_match_cells."""
    if plan_n * templates_n <= budget.max_match_cells:
        return templates_n, plan_n
    if templates_n < 1:
        return 0, min(plan_n, budget.max_plan_candidates)
    max_plan = max(1, budget.max_match_cells // max(templates_n, 1))
    max_plan = min(max_plan, budget.max_plan_candidates, plan_n)
    return templates_n, max_plan