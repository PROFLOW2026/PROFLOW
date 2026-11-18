"""Which sheet owns a symbol when several viewports contain the same point.

A viewport is an overview when its view height is at least the model box height.
Size and containment do not choose between two partial sheets.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class SheetClaim:
    sheet_key: str
    partial: bool
    overview: bool


@dataclass(frozen=True)
class SheetDecision:
    owner_sheet_key: str
    needs_review: bool
    candidate_sheet_keys: tuple[str, ...]


def is_overview_viewport(view_height: float, model_height: float) -> bool:
    if model_height <= 0 or view_height <= 0:
        return False
    return view_height + 1e-6 >= model_height


def decide_sheet_owner(claims: list[SheetClaim]) -> SheetDecision:
    """One certain owner, or a review flag when two partial sheets both contain the point."""
    if not claims:
        return SheetDecision("", True, ())
    partial: list[str] = []
    overview: list[str] = []
    seen_partial: set[str] = set()
    seen_overview: set[str] = set()
    order: list[str] = []
    for claim in claims:
        if claim.sheet_key not in order:
            order.append(claim.sheet_key)
        if claim.partial and claim.sheet_key not in seen_partial:
            seen_partial.add(claim.sheet_key)
            partial.append(claim.sheet_key)
        elif claim.overview and claim.sheet_key not in seen_overview:
            seen_overview.add(claim.sheet_key)
            overview.append(claim.sheet_key)
    if len(partial) == 1:
        return SheetDecision(partial[0], False, ())
    if len(partial) > 1:
        return SheetDecision(partial[0], True, tuple(partial))
    if len(overview) == 1:
        return SheetDecision(overview[0], False, ())
    if len(overview) > 1:
        return SheetDecision(overview[0], True, tuple(overview))
    return SheetDecision(order[0], False, ())
