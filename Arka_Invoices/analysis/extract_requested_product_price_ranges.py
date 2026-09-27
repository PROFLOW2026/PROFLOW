#!/usr/bin/env python3
"""Extract yearly NET price ranges for 23 requested ERCO invoice products."""

from __future__ import annotations

import csv
import re
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable

DATASET = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\dataset")
OUT_DIR = Path(r"C:\Users\ERAN YOSEF\Desktop\Arka_Invoices\analysis")
HISTORY = DATASET / "product_price_history.csv"
STAGING = DATASET / "invoice_lines_staging.csv"

Row = dict[str, str]


def norm(s: str) -> str:
    return (s or "").strip()


def parse_date(s: str) -> datetime | None:
    s = norm(s)
    if not s:
        return None
    for fmt in ("%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def parse_float(s: str) -> float | None:
    s = norm(s).replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_int(s: str) -> int | None:
    v = parse_float(s)
    if v is None:
        return None
    return int(v)


def load_history() -> list[Row]:
    rows: list[Row] = []
    with HISTORY.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["_source"] = "history"
            rows.append(row)
    return rows


def load_staging_raw() -> list[Row]:
    rows: list[Row] = []
    with STAGING.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def row_dedupe_key(row: Row) -> tuple[str, ...]:
    return (
        norm(row.get("invoice_date", "")),
        norm(row.get("invoice_number", "")),
        norm(row.get("item_code", "")),
        norm(row.get("raw_description", "")),
        norm(row.get("source_file", "")),
        norm(row.get("quantity", "")),
        norm(row.get("unit_price_net", "")),
    )


def normalize_staging_row(row: Row) -> Row:
    out = dict(row)
    out["canonical_description"] = norm(row.get("normalized_description_placeholder", ""))
    out["normalized_product_key"] = ""
    vstat = norm(row.get("validation_status", "")).upper()
    price = parse_float(row.get("unit_price_net", ""))
    out["price_observation_usable"] = (
        "YES"
        if vstat in {"PASS", "NOT_APPLICABLE"} and price is not None and price > 0
        else "NO"
    )
    out["price_outlier"] = "NO"
    out["exclusion_reason"] = (
        "validation_fail" if norm(row.get("validation_status", "")).upper() == "FAIL" else ""
    )
    out["_source"] = "staging"
    return out


def load_combined_rows() -> list[Row]:
    """Staging invoice lines are source of truth; history enriches canonical fields."""
    staging = [normalize_staging_row(r) for r in load_staging_raw()]
    history = load_history()
    hist_by_key = {row_dedupe_key(r): r for r in history}
    combined: list[Row] = []
    seen: set[tuple[str, ...]] = set()
    for s in staging:
        key = row_dedupe_key(s)
        seen.add(key)
        h = hist_by_key.get(key)
        if h:
            if not norm(s.get("canonical_description")):
                s["canonical_description"] = norm(h.get("canonical_description", ""))
            s["normalized_product_key"] = norm(h.get("normalized_product_key", ""))
            s["_history_usable"] = norm(h.get("price_observation_usable", ""))
        combined.append(s)
    for h in history:
        key = row_dedupe_key(h)
        if key not in seen:
            h2 = dict(h)
            h2["_source"] = "history_only"
            h2["_history_usable"] = norm(h.get("price_observation_usable", ""))
            combined.append(h2)
    return combined


def base_exclusions(row: Row) -> str | None:
    qty = parse_float(row.get("quantity", ""))
    if qty is not None and qty <= 0:
        return "negative_or_zero_qty"
    reason = norm(row.get("exclusion_reason", ""))
    if reason in {"credit_or_return"}:
        return reason
    price = parse_float(row.get("unit_price_net", ""))
    if price is None or price < 0:
        return "invalid_price"
    return None


def _row_price_reconciles(row: Row, tol: float = 0.03) -> bool:
    price = parse_float(row.get("unit_price_net", ""))
    qty = parse_float(row.get("quantity", ""))
    total = parse_float(row.get("line_total_net", ""))
    if price is None or qty is None or total is None or price <= 0 or qty <= 0 or total <= 0:
        return False
    return abs(qty * price - total) / total <= tol


def is_usable_primary(row: Row) -> bool:
    """Valid NET observation — staging PASS/NOT_APPLICABLE + history-proven rows; ignores price_outlier."""
    if norm(row.get("validation_reason_code", "")).upper() == "STACK_OWNERSHIP_FAIL":
        return False
    if base_exclusions(row):
        return False
    if norm(row.get("invoice_year", "")) == "2026" and not _row_price_reconciles(row):
        return False
    if norm(row.get("is_negative_line", "")).lower() == "yes":
        return False
    price = parse_float(row.get("unit_price_net", ""))
    if price is None or price <= 0:
        return False
    vstat = norm(row.get("validation_status", "")).upper()
    if vstat in {"PASS", "NOT_APPLICABLE"}:
        return True
    if vstat == "FAIL":
        if norm(row.get("_history_usable", "")).upper() == "YES":
            return True
        if norm(row.get("price_observation_usable", "")).upper() == "YES":
            return True
        # 2026 hybrid extraction: qty×price vs line-total validation often FAIL on glued layouts
        if norm(row.get("invoice_year", "")) == "2026":
            qty = parse_float(row.get("quantity", ""))
            if qty is not None and qty > 0:
                return True
        return False
    reason = norm(row.get("exclusion_reason", ""))
    if reason in {"credit_or_return", "validation_fail"}:
        return False
    return norm(row.get("price_observation_usable", "")).upper() == "YES"


def is_usable_fallback(row: Row) -> bool:
    """Fallback when no primary usable rows exist (sku_conflict / validation edge)."""
    if base_exclusions(row):
        return False
    if norm(row.get("is_negative_line", "")).lower() == "yes":
        return False
    reason = norm(row.get("exclusion_reason", ""))
    if reason in {"credit_or_return", "validation_fail"}:
        return False
    if norm(row.get("validation_status", "")).upper() == "FAIL":
        return False
    price = parse_float(row.get("unit_price_net", ""))
    if price is None or price <= 0:
        return False
    return True


def is_usable_sku_conflict_raw(row: Row) -> bool:
    """Include sku_conflict rows when raw line text clearly identifies the product."""
    if base_exclusions(row):
        return False
    if norm(row.get("is_negative_line", "")).lower() == "yes":
        return False
    if norm(row.get("exclusion_reason", "")) != "sku_conflict":
        return False
    if norm(row.get("validation_status", "")).upper() == "FAIL":
        return False
    price = parse_float(row.get("unit_price_net", ""))
    return price is not None and price > 0


def mad_outlier_filter(prices: list[tuple[float, Row]], k: float = 3.5) -> tuple[list[tuple[float, Row]], int]:
    if len(prices) < 4:
        return prices, 0
    vals = [p for p, _ in prices]
    med = statistics.median(vals)
    abs_dev = [abs(v - med) for v in vals]
    mad = statistics.median(abs_dev)
    if mad == 0:
        return prices, 0
    kept: list[tuple[float, Row]] = []
    removed = 0
    for price, row in prices:
        if abs(price - med) / mad > k:
            removed += 1
        else:
            kept.append((price, row))
    return kept, removed


@dataclass
class ProductSpec:
    name: str
    unit: str
    matcher: Callable[[Row], bool]
    notes: str = ""
    item_codes: set[str] = field(default_factory=set)
    allow_fallback: bool = True
    allow_sku_conflict_raw: bool = False
    loose_matcher: Callable[[Row], bool] | None = None
    audit_name: str = ""


def rx(*parts: str) -> re.Pattern[str]:
    return re.compile("|".join(parts), re.IGNORECASE)


KOROS = r"קורוס|koros"
RAW_CONTAMINATION = re.compile(
    r"IRWIN|SDS-PLUS|SDS\s*PLUS|מקדח\s*לפטישון|תעלת\s*רשת|"
    r"9V\s*סוללה|דורסל330|EL-0\d+\s*PG|צינור\s*גמיש|ג'ל\s*השחלה|"
    r"N2XY|חוט\s*560|560131|מכסה\s*פלסטיק",
    re.IGNORECASE,
)
CABLE_3X15 = rx(r"3\s*[x×X]\s*1\.?5", r"3X1\.5", r"5951021")
CABLE_3X25 = rx(r"3\s*[x×X]\s*2\.?5", r"3X2\.5", r"5951061")
CABLE_5X15 = rx(r"5\s*[x×X]\s*1\.?5", r"5X1\.5", r"5951041")
CABLE_5X25 = rx(r"5\s*[x×X]\s*2\.?5", r"5X2\.5", r"5951081")
CABLE_5X10 = rx(r"5\s*[x×X]\s*10", r"5X10")


def text_blob(row: Row) -> str:
    return " ".join(
        [
            norm(row.get("item_code", "")),
            norm(row.get("raw_description", "")),
            norm(row.get("canonical_description", "")),
            norm(row.get("normalized_product_key", "")),
        ]
    )


def match_item_codes(row: Row, codes: Iterable[str]) -> bool:
    code = norm(row.get("item_code", ""))
    return code in set(codes)


PVC_WIRE = re.compile(r"PVC|קשיח", re.I)
WIRE_15_RX = re.compile(
    r"1\.?5\s*חוט|חוט\s*1\.?5|חום1\.5|כחול1\.5|צ/י1\.5|צהוב/ירוק1\.5|ח/ש1\.5|ח/כ1\.5",
    re.I,
)
WIRE_25_RX = re.compile(
    r"2\.?5\s*חוט|חוט\s*2\.?5|חום2\.5|כחול2\.5|צ/י2\.5|"
    r"(?:/ירוק|/כחול|חום|כחול|צ/י|צהוב/ירוק)\s*25\s*חוט",
    re.I,
)
MARICHAV_RX = re.compile(r"מריכ", re.I)
MARICHAV_BO_RX = re.compile(r"שחור\s*/\s*כתום|שחור/כתום", re.I)
MARICHAV_COLOR_RX = re.compile(r"ירוק|לבן|צבעוני|אדום|כחול|צהוב", re.I)
CONCRETE_BOX_RX = re.compile(r'תה"ט|מחוזק|לבטון|תחת\s*הטיח', re.I)

# Invoice-discovered SKU families (2017–2026 rescan).
WIRE_15_SKUS = frozenset({"55022", "55023", "55024", "55027", "55028"})
# 56033/560331 = bundle/reel SKUs — per-meter unit price is not comparable to meter-priced 5503x SKUs.
WIRE_25_SKUS = frozenset({"55032", "55033", "55034", "55037", "55038"})
MARICHAV_BO_20_SKUS = frozenset({"8600003"})
MARICHAV_BO_25_SKUS = frozenset({"8600004"})
MARICHAV_COLOR_20_SKUS = frozenset({"8600103", "8600113", "8600108", "8600114"})
MARICHAV_COLOR_25_SKUS = frozenset({"8600104", "8600119", "8600116"})
CONCRETE_BOX_3_SKUS = frozenset({"3924403", "1900225", "190023", "840001800"})
# 99761214 = Gewiss D-14 flush box (~23–25 ₪) — not the standard תה"ט module box (~2.3–2.8 ₪).
CONCRETE_BOX_4_SKUS = frozenset({"3924404", "1900255", "840001810"})
CABLE_3X15_SKUS = frozenset({"5951021", "5951020"})
CABLE_3X25_SKUS = frozenset({"5951061", "5951060"})
CABLE_5X15_SKUS = frozenset({"5951041", "5951040"})
CABLE_5X25_SKUS = frozenset({"5951081", "5951080"})
# 5974040/5974050 = drum-diameter tools (תוף קוטר), not N2XY cable — stack-bleed from 5952040.
CABLE_5X10_SKUS = frozenset({"5952040", "59520401"})


def _wire_excluded(raw: str) -> bool:
    return bool(
        re.search(r"נחושת|רמקול|560131|לרמקול", raw, re.I)
        or RAW_CONTAMINATION.search(raw)
    )


def _wire_primary_row(raw: str, code: str) -> bool:
    """Reject stack-bleed rows where wire text belongs to a neighboring invoice line."""
    if re.match(r"^\s*\d+\.?\d*%\s", raw):
        return False
    if re.match(r"^שח\d", raw):
        return False
    stripped = raw.lstrip("'").strip()
    if re.match(r"^מטר", stripped) or re.match(r"^'?[\d.]+\s*קשיח", stripped, re.I):
        return True
    if re.match(r"^'?קשיח", stripped, re.I) or re.match(r"^קשיח", stripped, re.I):
        return True
    if code in WIRE_15_SKUS | WIRE_25_SKUS:
        if re.search(r"קשיח|PVC", raw, re.I) and re.search(r"חוט", raw):
            return True
    if code and re.search(rf"(?<!\d){re.escape(code)}(?!\d)", raw):
        return True
    return False


def _wire_25_reject_bundle_misprice(row: Row) -> bool:
    """Exclude bundle/reel SKUs and OCR '25 חוט' (=2.5mm) rows with implausible ₪/m."""
    raw = norm(row.get("raw_description", ""))
    code = norm(row.get("item_code", ""))
    if code in {"560331", "56033"}:
        return True
    if re.search(r"חבילה", raw, re.I):
        return True
    price = parse_float(row.get("unit_price_net", ""))
    if price is None:
        return False
    if (
        re.search(r"(?<![\d.])25\s*חוט", raw)
        and not re.search(r"2\.5", raw)
        and price > 2.5
    ):
        return True
    return False


def match_pvc_wire(row: Row, mm: str) -> bool:
    """All normal PVC rigid wire colors for 1.5mm / 2.5mm — raw description authority."""
    raw = norm(row.get("raw_description", ""))
    if not raw or _wire_excluded(raw):
        return False
    if not _wire_primary_row(raw, norm(row.get("item_code", ""))):
        return False
    code = norm(row.get("item_code", ""))
    if mm == "1.5":
        if re.search(r"2\.5", raw):
            return False
        if code in WIRE_15_SKUS:
            return bool(PVC_WIRE.search(raw) or "קשיח" in raw or "חוט" in raw)
        return bool(WIRE_15_RX.search(raw) and PVC_WIRE.search(raw))
    if mm == "2.5":
        if _wire_25_reject_bundle_misprice(row):
            return False
        if code in WIRE_25_SKUS:
            return bool(PVC_WIRE.search(raw) or "קשיח" in raw or "חוט" in raw)
        return bool(WIRE_25_RX.search(raw) and PVC_WIRE.search(raw))
    return False


def match_wire(row: Row, mm: str, sku: str, color_note: str) -> bool:
    return match_pvc_wire(row, mm)


def _marichav_diameter_in_raw(raw: str, diameter: str) -> bool:
    """Match diameter in legacy OCR layouts where \\b fails (e.g. חדש20, ירוק25)."""
    d = re.escape(diameter)
    return bool(
        re.search(
            rf"(?<!\d){d}(?!\d)|{d}\s*צינור|צינור\s*{d}|"
            rf"ירוק\s*{d}|ירוק{d}|לבן\s*{d}|לבן{d}|"
            rf"שחור{d}|שחור/{d}|חדש\s*{d}|חדש{d}",
            raw,
            re.I,
        )
    )


def match_marichav_bo(row: Row, diameter: str) -> bool:
    raw = norm(row.get("raw_description", ""))
    code = norm(row.get("item_code", ""))
    allowed = MARICHAV_BO_20_SKUS if diameter == "20" else MARICHAV_BO_25_SKUS
    if code not in allowed:
        return False
    if not MARICHAV_RX.search(raw):
        return False
    if not _marichav_diameter_in_raw(raw, diameter):
        return False
    return bool(MARICHAV_BO_RX.search(raw))


def match_marichav_color(row: Row, diameter: str) -> bool:
    """Colored 20/25mm conduit family — green, white, and other non black/orange variants."""
    raw = norm(row.get("raw_description", ""))
    code = norm(row.get("item_code", ""))
    allowed = MARICHAV_COLOR_20_SKUS if diameter == "20" else MARICHAV_COLOR_25_SKUS
    if code not in allowed:
        return False
    if not MARICHAV_RX.search(raw):
        return False
    if MARICHAV_BO_RX.search(raw):
        return False
    if not _marichav_diameter_in_raw(raw, diameter):
        return False
    return bool(MARICHAV_COLOR_RX.search(raw))


def match_marichav(row: Row, diameter: str, color_key: str) -> bool:
    if color_key == "black_orange":
        return match_marichav_bo(row, diameter)
    return match_marichav_color(row, diameter)


def match_box_concrete(row: Row, places: str) -> bool:
    raw = norm(row.get("raw_description", ""))
    canon = norm(row.get("canonical_description", ""))
    code = norm(row.get("item_code", ""))
    allowed = CONCRETE_BOX_3_SKUS if places == "3" else CONCRETE_BOX_4_SKUS
    if code not in allowed:
        return False
    blob = f"{raw} {canon}"
    if re.search(r"\bD-?\d+\b", blob, re.I):
        return False
    if re.search(r"פטנט\s*גבס|840001812|840001802|840001811", raw, re.I) and 'תה"ט' not in raw:
        return False
    if not CONCRETE_BOX_RX.search(blob):
        return False
    return bool(
        re.search(
            rf"{places}\s*מודול|מודול\s*{places}|{places}\s*קופ|מוד{places}\b|לבטון\s*{places}",
            blob,
            re.I,
        )
    )


def match_box_patent(row: Row, places: str) -> bool:
    codes = {"3": {"840001802", "190041", "84000385"}, "4": {"840001812", "840001811"}}
    code = norm(row.get("item_code", ""))
    if code not in codes[places]:
        return False
    raw = norm(row.get("raw_description", ""))
    if "בטון" in raw:
        return False
    if places == "4":
        if code in {"840001811", "840001812"}:
            return bool(
                re.search(r"פטנט", raw, re.I)
                and re.search(r"גבס|לגבס", raw, re.I)
                and re.search(r"(?<!\d)4(?!\d)|4\s*מודול|מודול\s*4|גבס4", raw, re.I)
            )
        return bool(re.search(r"פטנט\s*גבס\s*4|גבס\s*4\s*קופ|פטנט\s*גבס4", raw, re.I))
    blob = raw + " " + norm(row.get("canonical_description", ""))
    if code == "190041":
        return "פטנט" in blob and "3" in blob
    return bool(re.search(rf"פטנט\s*גבס\s*{places}|גבס\s*{places}\s*קופ|פטנט\s*גבס{places}", blob, re.I))


def match_cable(row: Row, pattern: re.Pattern[str], allowed_skus: set[str] | frozenset[str]) -> bool:
    code = norm(row.get("item_code", ""))
    if code not in allowed_skus:
        return False
    raw = norm(row.get("raw_description", ""))
    blob = text_blob(row)
    if not (pattern.search(raw) or pattern.search(blob)):
        return False
    return bool(re.search(r"N2XY|כבל", raw, re.I) or re.search(r"N2XY|כבל", blob, re.I))


def has_koros(raw: str) -> bool:
    return bool(re.search(KOROS, raw, re.I))


KOROS_REPORT_PRODUCTS = frozenset(
    {
        "שקע קורוס",
        "יחיד קורוס",
        "חילוף קורוס",
        "מסגרת 1 מקום קורוס",
        "מסגרת 2 מקום קורוס",
        "מסגרת 4 מקום קורוס",
        "מתאם 3 מקום קורוס",
        "מתאם 4 מקום קורוס",
    }
)

# Explicit non-white Koros finishes only — all לבן* variants stay included as one product.
KOROS_NON_WHITE_COLOR = re.compile(
    r"שחור|סאטן|גרפיט|אנתרציט|(?:^|\s)אפור|כסף|ברונזה|צבעוני|"
    r"גוון\s*(?:שחור|אפור|גרפיט|סאטן|אנתרציט)",
    re.IGNORECASE,
)

# Non-standard Koros variants (מ"מ / waterproof / premium series) — not the regular target products.
KOROS_NON_STANDARD_VARIANT = re.compile(
    r'מ"מ|מ״מ|מוגן\s*מים|water\s*resist|waterproof|\bIP\d{2}\b|protected\s*variant',
    re.IGNORECASE,
)


def koros_color_source_text(row: Row) -> str:
    """Prefer raw line text; fall back to canonical only when raw has no color cue."""
    raw = norm(row.get("raw_description", ""))
    if re.search(r"לבן|שחור|סאטן|גרפיט|אנתרציט|אפור|כסף|ברונזה|צבעוני|גוון", raw, re.I):
        return raw
    canon = norm(row.get("canonical_description", ""))
    return f"{raw} {canon}".strip()


def koros_is_non_white_row(row: Row) -> bool:
    text = koros_color_source_text(row)
    if re.search(r"לבן", text, re.I):
        return False
    return bool(KOROS_NON_WHITE_COLOR.search(text))


def koros_variant_source_text(row: Row) -> str:
    return " ".join(
        [
            norm(row.get("raw_description", "")),
            norm(row.get("canonical_description", "")),
        ]
    ).strip()


def koros_is_non_standard_variant_row(row: Row) -> bool:
    return bool(KOROS_NON_STANDARD_VARIANT.search(koros_variant_source_text(row)))


def apply_koros_white_only(rows: list[Row], product_name: str) -> tuple[list[Row], int]:
    if product_name not in KOROS_REPORT_PRODUCTS:
        return rows, 0
    kept = [r for r in rows if not koros_is_non_white_row(r)]
    return kept, len(rows) - len(kept)


def raw_is_contaminated(raw: str) -> bool:
    return bool(RAW_CONTAMINATION.search(raw))


def match_koros_credible(row: Row, allowed_skus: set[str], raw_test: Callable[[str], bool]) -> bool:
    code = norm(row.get("item_code", ""))
    raw = norm(row.get("raw_description", ""))
    if code not in allowed_skus:
        return False
    if raw_is_contaminated(raw):
        return False
    if koros_is_non_standard_variant_row(row):
        return False
    return raw_test(raw)


def match_koros_socket(row: Row) -> bool:
    return match_koros_credible(
        row,
        {"3910281", "3912281"},
        lambda raw: has_koros(raw)
        and bool(re.search(r"שקע\s*כ[חה]|שקע\s*כוח", raw, re.I)),
    )


def match_koros_single(row: Row) -> bool:
    return match_koros_credible(
        row,
        {"3910001"},
        lambda raw: has_koros(raw)
        and bool(re.search(r"מפסק\s*יחיד|מפ['\"]?\s*יחיד", raw, re.I))
        and not re.search(r"מואר", raw, re.I),
    )


def match_koros_interchange(row: Row) -> bool:
    return match_koros_credible(
        row,
        {"3910051"},
        lambda raw: has_koros(raw)
        and bool(re.search(r"מפסק\s*מחליף|מחליף-קורוס|מחלף-קורוס", raw, re.I))
        and not re.search(r"מואר", raw, re.I),
    )


def match_koros_frame(row: Row, places: str) -> bool:
    sku_map = {
        "1": {"3916101"},
        "2": {"3916102", "3916122"},
        # 3916704 = מ"מ / water-resistant 4-module frame — separate product, not regular frame 4.
        "4": {"3916104"},
    }

    def raw_is_frame(raw: str) -> bool:
        if not has_koros(raw) or not re.search(r"מסגרת", raw, re.I):
            return False
        if KOROS_NON_STANDARD_VARIANT.search(raw):
            return False
        if places == "4" and re.search(r"מוד(?:ול)?\s*3\b|3\s*מקום|מוד3", raw, re.I):
            return False
        return bool(
            re.search(
                rf"מוד(?:ול)?\s*{places}\b|{places}\s*מקום|מוד{places}\b|מוד{places}\s",
                raw,
                re.I,
            )
        )

    return match_koros_credible(row, sku_map[places], raw_is_frame)


def match_koros_frame_4_legacy(row: Row) -> bool:
    """Raw-only frame-4 probe — excludes מ"מ SKU/variant and non-regular series."""
    code = norm(row.get("item_code", ""))
    if code == "3916704":
        return False
    raw = norm(row.get("raw_description", ""))
    if not has_koros(raw):
        return False
    if not re.search(r"מסגרת", raw, re.I):
        return False
    if KOROS_NON_STANDARD_VARIANT.search(raw):
        return False
    if re.search(r"N2XY|כבל\s*\)|חוט560", raw, re.I):
        return False
    return bool(re.search(r"מוד(?:ול)?\s*4\b|4\s*מקום", raw, re.I))


def match_koros_adapter(row: Row, places: str) -> bool:
    sku_map = {"3": {"3916803"}, "4": {"3916804"}}
    return match_koros_credible(
        row,
        sku_map[places],
        lambda raw: has_koros(raw)
        and bool(re.search(r"מתאם", raw, re.I))
        and bool(
            re.search(
                rf"מוד(?:ול)?\s*{places}|{places}\s*מקום|מוד{places}-|מוד{places}\b",
                raw,
                re.I,
            )
        ),
    )


def match_cable_5x10(row: Row) -> bool:
    code = norm(row.get("item_code", ""))
    if code not in CABLE_5X10_SKUS:
        return False
    raw = norm(row.get("raw_description", ""))
    return bool(CABLE_5X10.search(raw) and re.search(r"N2XY|כבל", raw, re.I))


def loose_koros_socket(row: Row) -> bool:
    raw = norm(row.get("raw_description", ""))
    return has_koros(raw) and bool(re.search(r"שקע\s*כ[חה]", raw, re.I))


def loose_koros_single(row: Row) -> bool:
    raw = norm(row.get("raw_description", ""))
    return norm(row.get("item_code", "")) == "3910001" and bool(
        re.search(r"מפסק\s*יחיד|מפ['\"]?\s*יחיד", raw, re.I)
    )


def loose_koros_interchange(row: Row) -> bool:
    raw = norm(row.get("raw_description", ""))
    code = norm(row.get("item_code", ""))
    if code == "3910051":
        return bool(re.search(r"מחליף|מחלף", raw, re.I))
    return has_koros(raw) and bool(re.search(r"מחליף|מחלף", raw, re.I))


def loose_koros_frame(row: Row, places: str) -> bool:
    """Prior raw-only frame matcher (before SKU enforcement)."""
    if places == "4" and norm(row.get("item_code", "")) == "3916704":
        return False
    raw = norm(row.get("raw_description", ""))
    if not has_koros(raw):
        return False
    if not re.search(r"מסגרת", raw, re.I):
        return False
    if KOROS_NON_STANDARD_VARIANT.search(raw):
        return False
    if re.search(r"N2XY|כבל\s*\)|חוט560", raw, re.I):
        return False
    return bool(re.search(rf"מוד(?:ול)?\s*{places}\b|{places}\s*מקום", raw, re.I))


def loose_koros_adapter(row: Row, places: str) -> bool:
    return norm(row.get("item_code", "")) == {"3": "3916803", "4": "3916804"}[places]


def loose_box_patent_4(row: Row) -> bool:
    return norm(row.get("item_code", "")) in {"840001812", "840001811", "190058"}


PRODUCTS: list[ProductSpec] = [
    ProductSpec(
        "חוט 1.5",
        "₪/מטר",
        lambda r: match_pvc_wire(r, "1.5"),
        "All PVC 1.5mm wire colors; SKUs 55022/55023/55024/55027/55028 + description match.",
    ),
    ProductSpec(
        "חוט 2.5",
        "₪/מטר",
        lambda r: match_pvc_wire(r, "2.5"),
        "All PVC 2.5mm wire colors; SKUs 55032/55033/55034/55037/55038 + description match. Bundle SKUs 56033/560331 excluded.",
    ),
    ProductSpec(
        "צינור מריכב 20 שחור/כתום",
        "₪/מטר",
        lambda r: match_marichav(r, "20", "black_orange"),
        "Black/orange 20mm; SKU 8600003.",
    ),
    ProductSpec(
        "צינור מריכב 25 שחור/כתום",
        "₪/מטר",
        lambda r: match_marichav(r, "25", "black_orange"),
        "Black/orange 25mm; SKU 8600004.",
    ),
    ProductSpec(
        "צינור מריכב 20 ירוק/צבעוני",
        "₪/מטר",
        lambda r: match_marichav(r, "20", "green"),
        "Colored 20mm family; SKUs 8600103/8600113/8600108/8600114 (green, white, etc.).",
    ),
    ProductSpec(
        "צינור מריכב 25 ירוק/צבעוני",
        "₪/מטר",
        lambda r: match_marichav(r, "25", "green"),
        "Colored 25mm family; SKUs 8600104/8600119/8600116.",
    ),
    ProductSpec(
        "קופסה 3 מקום לבטון",
        "₪/יחידה",
        lambda r: match_box_concrete(r, "3"),
        "Concrete/flush 3-module; SKUs 3924403/1900225/190023/840001800 + תה\"ט description.",
    ),
    ProductSpec(
        "קופסה 4 מקום לבטון",
        "₪/יחידה",
        lambda r: match_box_concrete(r, "4"),
        "Concrete/flush 4-module; SKUs 3924404/1900255/840001810 + תה\"ט description. D-14 SKU 99761214 excluded.",
    ),
    ProductSpec(
        "קופסה 3 מקום פטנט לגבס",
        "₪/יחידה",
        lambda r: match_box_patent(r, "3"),
        "Gypsum patent 3-module; SKUs 840001802/190041/84000385.",
    ),
    ProductSpec(
        "קופסה 4 מקום פטנט לגבס",
        "₪/יחידה",
        lambda r: match_box_patent(r, "4"),
        "SKUs 840001812/840001811 — explicit 4-place gypsum patent module. SKU 190058 excluded (generic תקן55 ~1.40–2.40 ₪).",
        loose_matcher=loose_box_patent_4,
        audit_name="box_patent_4",
    ),
    ProductSpec(
        "כבל 3×1.5",
        "₪/מטר",
        lambda r: match_cable(r, CABLE_3X15, CABLE_3X15_SKUS),
        "SKUs 5951021/5951020; raw N2XY 3×1.5.",
    ),
    ProductSpec(
        "כבל 3×2.5",
        "₪/מטר",
        lambda r: match_cable(r, CABLE_3X25, CABLE_3X25_SKUS),
        "SKUs 5951061/5951060; raw N2XY 3×2.5.",
        allow_sku_conflict_raw=True,
    ),
    ProductSpec(
        "כבל 5×1.5",
        "₪/מטר",
        lambda r: match_cable(r, CABLE_5X15, CABLE_5X15_SKUS),
        "SKUs 5951041/5951040; raw N2XY 5×1.5.",
    ),
    ProductSpec(
        "כבל 5×2.5",
        "₪/מטר",
        lambda r: match_cable(r, CABLE_5X25, CABLE_5X25_SKUS),
        "SKUs 5951081/5951080; raw N2XY 5×2.5.",
        allow_sku_conflict_raw=True,
    ),
    ProductSpec(
        "כבל 5×10",
        "₪/מטר",
        match_cable_5x10,
        "Verified: raw_description must contain 5×10 and N2XY/כבל (canonical 5×1 ignored).",
    ),
    ProductSpec(
        "שקע קורוס",
        "₪/יחידה",
        match_koros_socket,
        "SKUs 3910281 / 3912281; raw must contain קורוס + שקע כח/כוח.",
        allow_sku_conflict_raw=True,
        loose_matcher=loose_koros_socket,
        audit_name="socket",
    ),
    ProductSpec(
        "יחיד קורוס",
        "₪/יחידה",
        match_koros_single,
        "SKU 3910001; raw must contain קורוס + מפסק יחיד.",
        allow_sku_conflict_raw=True,
        loose_matcher=loose_koros_single,
        audit_name="single",
    ),
    ProductSpec(
        "חילוף קורוס",
        "₪/יחידה",
        match_koros_interchange,
        "SKU 3910051; raw must contain קורוס + מפסק מחליף (non-illuminated).",
        allow_sku_conflict_raw=True,
        loose_matcher=loose_koros_interchange,
        audit_name="interchange",
    ),
    ProductSpec(
        "מסגרת 1 מקום קורוס",
        "₪/יחידה",
        lambda r: match_koros_frame(r, "1"),
        "SKU 3916101; raw must contain קורוס + מסגרת + מודול 1.",
        allow_sku_conflict_raw=True,
        loose_matcher=lambda r: loose_koros_frame(r, "1"),
        audit_name="frame1",
    ),
    ProductSpec(
        "מסגרת 2 מקום קורוס",
        "₪/יחידה",
        lambda r: match_koros_frame(r, "2"),
        "SKUs 3916102 / 3916122; raw must contain קורוס + מסגרת + מודול 2.",
        allow_sku_conflict_raw=True,
        loose_matcher=lambda r: loose_koros_frame(r, "2"),
        audit_name="frame2",
    ),
    ProductSpec(
        "מסגרת 4 מקום קורוס",
        "₪/יחידה",
        lambda r: match_koros_frame(r, "4"),
        "Regular ONE frame SKU 3916104 only; excludes 3916704 (מ\"מ / water-resistant variant) and other non-standard series.",
        allow_sku_conflict_raw=True,
        loose_matcher=match_koros_frame_4_legacy,
        audit_name="frame4",
    ),
    ProductSpec(
        "מתאם 3 מקום קורוס",
        "₪/יחידה",
        lambda r: match_koros_adapter(r, "3"),
        "SKU 3916803; raw must contain קורוס + מתאם + מודול 3.",
        allow_sku_conflict_raw=True,
        loose_matcher=lambda r: loose_koros_adapter(r, "3"),
        audit_name="adapter3",
    ),
    ProductSpec(
        "מתאם 4 מקום קורוס",
        "₪/יחידה",
        lambda r: match_koros_adapter(r, "4"),
        "SKU 3916804; raw must contain קורוס + מתאם + מודול 4.",
        allow_sku_conflict_raw=True,
        loose_matcher=lambda r: loose_koros_adapter(r, "4"),
        audit_name="adapter4",
    ),
]


@dataclass
class ProductResult:
    spec: ProductSpec
    matched_rows: list[Row] = field(default_factory=list)
    raw_count: int = 0
    clean_count: int = 0
    mad_removed: int = 0
    used_fallback: bool = False
    fallback_flags: list[str] = field(default_factory=list)
    skus: set[str] = field(default_factory=set)
    descriptions: set[str] = field(default_factory=set)
    yearly: dict[int, dict] = field(default_factory=dict)
    ambiguity: str = ""
    contaminated_removed: int = 0
    non_white_excluded: int = 0
    staging_pass_matched: int = 0
    repaired_years: list[tuple[int, int]] = field(default_factory=list)


def reject_cluster_outlier(row: Row, peer_prices: list[float]) -> bool:
    """Drop mapping contamination when price is far from cluster and raw is ambiguous."""
    if len(peer_prices) < 5:
        return False
    price = parse_float(row.get("unit_price_net", ""))
    if price is None:
        return False
    med = statistics.median(peer_prices)
    if med <= 0:
        return False
    if price <= med * 2.5:
        return False
    raw = norm(row.get("raw_description", ""))
    if raw_is_contaminated(raw):
        return True
    canon = norm(row.get("canonical_description", ""))
    if canon and raw_is_contaminated(canon):
        return True
    return False


def select_rows(all_rows: list[Row], spec: ProductSpec) -> ProductResult:
    matched = [r for r in all_rows if spec.matcher(r)]
    if spec.loose_matcher:
        loose = [r for r in all_rows if spec.loose_matcher(r)]
        loose_keys = {
            (
                norm(r.get("invoice_date", "")),
                norm(r.get("item_code", "")),
                norm(r.get("raw_description", "")),
                norm(r.get("source_file", "")),
            )
            for r in loose
        }
        strict_keys = {
            (
                norm(r.get("invoice_date", "")),
                norm(r.get("item_code", "")),
                norm(r.get("raw_description", "")),
                norm(r.get("source_file", "")),
            )
            for r in matched
        }
        contaminated_removed = len(loose_keys - strict_keys)
    else:
        contaminated_removed = 0
    res = ProductResult(
        spec=spec,
        matched_rows=matched,
        raw_count=len(matched),
        contaminated_removed=contaminated_removed,
    )

    primary = [r for r in matched if is_usable_primary(r)]
    sku_conflict_raw = (
        [r for r in matched if is_usable_sku_conflict_raw(r)]
        if spec.allow_sku_conflict_raw
        else []
    )
    fallback = [r for r in matched if is_usable_fallback(r)]
    chosen = primary + sku_conflict_raw
    flags: list[str] = []
    if sku_conflict_raw:
        res.used_fallback = True
        flags.append(
            f"Included {len(sku_conflict_raw)} sku_conflict row(s) where raw invoice line clearly identifies the product."
        )
    if not primary and spec.allow_fallback and fallback:
        chosen = fallback if not chosen else chosen
        res.used_fallback = True
        if not any("sku_conflict row(s)" in f for f in flags):
            flags.append("Used fallback rows because no price_observation_usable=YES rows exist.")

    # Additional fallback for validation_fail-only products
    res.staging_pass_matched = sum(
        1
        for r in matched
        if norm(r.get("_source", "")) == "staging"
        and norm(r.get("validation_status", "")).upper() == "PASS"
        and not base_exclusions(r)
    )

    if not chosen and spec.allow_fallback:
        vf = [
            r
            for r in matched
            if not base_exclusions(r)
            and norm(r.get("exclusion_reason", "")) == "validation_fail"
            and parse_float(r.get("unit_price_net", "")) not in (None, 0)
        ]
        if vf:
            chosen = vf
            res.used_fallback = True
            flags.append("Used validation_fail rows as last resort — flagged separately.")

    chosen, non_white_removed = apply_koros_white_only(chosen, spec.name)
    if non_white_removed:
        res.non_white_excluded = non_white_removed
        flags.append(
            f"Excluded {non_white_removed} explicit non-white Koros row(s); all white finishes kept together."
        )

    price_rows: list[tuple[float, Row]] = []
    for r in chosen:
        p = parse_float(r.get("unit_price_net", ""))
        if p is None or p <= 0:
            continue
        price_rows.append((p, r))

    if spec.audit_name and len(price_rows) >= 5:
        peer_prices = [p for p, _ in price_rows]
        price_rows = [(p, r) for p, r in price_rows if not reject_cluster_outlier(r, peer_prices)]

    # Per-year MAD only below — global cross-year MAD dropped valid pre-inflation years (e.g. 2020 wires).
    filtered = price_rows
    res.clean_count = len(filtered)
    res.fallback_flags = flags

    for _, r in filtered:
        res.skus.add(norm(r.get("item_code", "")))

    final_calc_rows: list[Row] = []
    by_year: dict[int, list[tuple[float, Row, datetime | None]]] = defaultdict(list)
    for price, r in filtered:
        year = parse_int(r.get("invoice_year", ""))
        if year is None:
            dt = parse_date(r.get("invoice_date", ""))
            year = dt.year if dt else None
        if year is None:
            continue
        dt = parse_date(r.get("invoice_date", ""))
        by_year[year].append((price, r, dt))

    for year, items in sorted(by_year.items()):
        items.sort(key=lambda x: (x[2] or datetime.min, x[1].get("source_file", "")))
        year_pairs, year_mad_removed = mad_outlier_filter([(p, r) for p, r, _ in items])
        res.mad_removed += year_mad_removed
        if not year_pairs:
            continue
        kept: list[tuple[float, Row, datetime | None]] = []
        for p, r in year_pairs:
            dt = parse_date(r.get("invoice_date", ""))
            kept.append((p, r, dt))
        kept.sort(key=lambda x: (x[2] or datetime.min, x[1].get("source_file", "")))
        prices = [p for p, _, _ in kept]
        invoices = {
            (norm(it[1].get("invoice_number", "")), norm(it[1].get("source_file", "")))
            for it in kept
        }
        res.yearly[year] = {
            "year": year,
            "min": min(prices),
            "max": max(prices),
            "median": statistics.median(prices),
            "average": statistics.mean(prices),
            "first": kept[0][0],
            "last": kept[-1][0],
            "observations": len(prices),
            "invoices": len(invoices),
        }
        final_calc_rows.extend(r for _, r, _ in kept)

    if res.yearly:
        res.clean_count = sum(y["observations"] for y in res.yearly.values())

    for r in final_calc_rows:
        d = norm(r.get("raw_description", ""))
        if d:
            res.descriptions.add(d)

    return res


def fmt_price(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:.4f}".rstrip("0").rstrip(".")


def fmt_price2(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:.2f}"


def load_prior_years(csv_path: Path) -> dict[str, set[int]]:
    if not csv_path.exists():
        return {}
    prior: dict[str, set[int]] = defaultdict(set)
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            year = parse_int(row.get("year", ""))
            if year is not None:
                prior[row["target_product"]].add(year)
    return dict(prior)


def staging_pass_years(all_rows: list[Row], spec: ProductSpec) -> set[int]:
    years: set[int] = set()
    for r in all_rows:
        if not spec.matcher(r):
            continue
        if norm(r.get("_source", "")) != "staging":
            continue
        if norm(r.get("validation_status", "")).upper() != "PASS":
            continue
        if base_exclusions(r):
            continue
        year = parse_int(r.get("invoice_year", ""))
        if year is not None:
            years.add(year)
    return years


def build_completeness_repair_section(
    results: list[ProductResult],
    prior_years: dict[str, set[int]],
) -> list[str]:
    lines: list[str] = []
    total_restored = 0
    products_affected: set[str] = set()
    years_affected: set[int] = set()
    repair_details: list[str] = []

    for r in results:
        old = prior_years.get(r.spec.name, set())
        new = set(r.yearly.keys())
        for year in sorted(new - old):
            obs = r.yearly[year]["observations"]
            total_restored += obs
            products_affected.add(r.spec.name)
            years_affected.add(year)
            repair_details.append(f"- **{r.spec.name}** / {year}: {obs} observation(s) restored")

    lines.append("## COMPLETENESS REPAIR")
    lines.append("")
    lines.append(f"MISSING VALID OBSERVATIONS RESTORED = {total_restored}")
    lines.append(f"PRODUCTS AFFECTED = {len(products_affected)}")
    lines.append(f"YEARS AFFECTED = {len(years_affected)}")
    lines.append(
        "ROOT CAUSE(S) = "
        "product_price_history.csv `price_outlier=YES` incorrectly flagged valid pre-inflation invoice lines; "
        "global (cross-year) MAD outlier filter then removed surviving sparse-year rows (e.g. 2020 חוט 1.5/2.5). "
        "Staging-only PASS filter then dropped NOT_APPLICABLE rows that were previously valid in history. "
        "Reconciliation: staging PASS/NOT_APPLICABLE + history-proven rows; per-year MAD only."
    )
    lines.append("")
    if repair_details:
        lines.append("Restored product/years:")
        lines.extend(repair_details)
    else:
        lines.append("No product/years restored vs prior report (already complete).")
    lines.append("")
    return lines


def build_markdown(
    results: list[ProductResult],
    prior_years: dict[str, set[int]] | None = None,
) -> str:
    matched = sum(1 for r in results if r.clean_count > 0)
    no_data = [r.spec.name for r in results if r.clean_count == 0]
    years_all: list[int] = []
    for r in results:
        years_all.extend(r.yearly.keys())
    earliest = min(years_all) if years_all else "—"
    latest = max(years_all) if years_all else "—"
    ge3 = sum(1 for r in results if len(r.yearly) >= 3)
    ge5 = sum(1 for r in results if len(r.yearly) >= 5)

    amb: list[str] = [
        "- **Koros products**: white-only report rule — all לבן / לבן מבריק / לבן חלבי / לבן מט variants included; explicit non-white colors excluded from statistics only (source rows preserved)."
    ]
    for r in results:
        if r.used_fallback:
            amb.append(f"- **{r.spec.name}**: {' '.join(r.fallback_flags)}")
        if r.spec.name == "כבל 5×10":
            amb.append(
                "- **כבל 5×10**: item_code 5952040 canonical description says 5×1 N2XY; prices taken only where raw_description explicitly says 5×10 N2XY."
            )
        if r.spec.name == "קופסה 4 מקום פטנט לגבס":
            amb.append(
                "- **קופסה 4 מקום פטנט לגבס**: SKU 190058 (תקן55 ~1.40–2.40 ₪) excluded — not merged with SKU 840001812 (explicit 4-place module ~7.93–8.26 ₪)."
            )
        if r.contaminated_removed:
            amb.append(
                f"- **{r.spec.name}**: {r.contaminated_removed} contaminated row(s) removed by strict SKU+raw matching."
            )
        if r.spec.name == "מתאם 3 מקום קורוס":
            amb.append(
                "- **מתאם 3 מקום קורוס**: SKU 3916803 raw label also references 2-place adapter ('מודול3- ו2-'); treated as 3-place Koros adapter per invoice line text."
            )
        if r.non_white_excluded:
            amb.append(
                f"- **{r.spec.name}**: {r.non_white_excluded} non-white row(s) excluded from statistics (source data unchanged)."
            )

    lines: list[str] = []
    lines.append("# Historical NET Price Ranges — Requested ERCO Products")
    lines.append("")
    lines.append(f"TARGET PRODUCTS = 23")
    lines.append(f"PRODUCTS MATCHED = {matched}")
    lines.append(f"PRODUCTS WITH 3+ YEARS HISTORY = {ge3}")
    lines.append(f"PRODUCTS WITH 5+ YEARS HISTORY = {ge5}")
    lines.append(f"PRODUCTS WITH NO DATA = {len(no_data)}")
    lines.append(f"EARLIEST YEAR FOUND = {earliest}")
    lines.append(f"LATEST YEAR FOUND = {latest}")
    lines.append("")
    if amb:
        lines.append("## Ambiguous / flagged mappings")
        lines.append("")
        for a in dict.fromkeys(amb):
            lines.append(a)
        lines.append("")

    for r in results:
        lines.append(f"## {r.spec.name}")
        lines.append("")
        if r.spec.notes:
            lines.append(f"Notes: {r.spec.notes}")
            lines.append("")
        if r.clean_count == 0:
            lines.append("**NO MATCHING HISTORICAL DATA FOUND**")
            lines.append("")
            lines.append(f"Raw matched rows (before cleaning): {r.raw_count}")
            if r.raw_count:
                zero_price = sum(
                    1
                    for row in r.matched_rows
                    if (parse_float(row.get("unit_price_net", "")) or 0) <= 0
                )
                if zero_price:
                    lines.append(
                        f"Note: {zero_price} matched row(s) had zero/invalid net unit price and were excluded."
                    )
            lines.append("")
            continue

        lines.append("Matched SKU(s):")
        for sku in sorted(s for s in r.skus if s):
            lines.append(f"- `{sku}`")
        lines.append("")
        lines.append("Matched descriptions (raw invoice lines used in calculation):")
        for d in sorted(r.descriptions)[:12]:
            lines.append(f"- {d}")
        if len(r.descriptions) > 12:
            lines.append(f"- … (+{len(r.descriptions) - 12} more variants)")
        lines.append("")
        lines.append(f"Unit: {r.spec.unit}")
        lines.append("")
        obs_bits = [f"raw={r.raw_count}", f"clean={r.clean_count}"]
        if r.non_white_excluded:
            obs_bits.append(f"non-white excluded={r.non_white_excluded}")
        if r.mad_removed:
            obs_bits.append(f"MAD-filter removed={r.mad_removed}")
        lines.append("Observations: " + ", ".join(obs_bits))
        if r.used_fallback:
            lines.append(f"Fallback used: {' '.join(r.fallback_flags)}")
        lines.append("")
        lines.append("| שנה | מינימום | מקסימום | חציון | ממוצע | מחיר ראשון | מחיר אחרון | תצפיות | חשבוניות |")
        lines.append("|------|---------:|----------:|-------:|-------:|-----------:|-----------:|---------:|-----------:|")
        for year in sorted(r.yearly):
            y = r.yearly[year]
            lines.append(
                f"| {year} | {fmt_price2(y['min'])} | {fmt_price2(y['max'])} | {fmt_price2(y['median'])} | {fmt_price2(y['average'])} | {fmt_price2(y['first'])} | {fmt_price2(y['last'])} | {y['observations']} | {y['invoices']} |"
            )
        lines.append("")

    if prior_years is not None:
        lines.extend(build_completeness_repair_section(results, prior_years))

    lines.append("## סיכום קומפקט")
    lines.append("")
    lines.append("| מוצר | שנים זמינות | מחיר ראשון היסטורי | מחיר אחרון | מינימום כללי | מקסימום כללי | יחידה |")
    lines.append("|------|--------------|--------------------:|------------:|-------------:|-------------:|-------|")
    for r in results:
        if not r.yearly:
            lines.append(f"| {r.spec.name} | — | — | — | — | — | {r.spec.unit} |")
            continue
        years = sorted(r.yearly)
        first_year = years[0]
        last_year = years[-1]
        all_prices = [p for y in r.yearly.values() for p in (y["min"], y["max"])]
        overall_min = min(y["min"] for y in r.yearly.values())
        overall_max = max(y["max"] for y in r.yearly.values())
        hist_first = r.yearly[first_year]["first"]
        hist_last = r.yearly[last_year]["last"]
        lines.append(
            f"| {r.spec.name} | {first_year}–{last_year} ({len(years)} yrs) | {fmt_price2(hist_first)} | {fmt_price2(hist_last)} | {fmt_price2(overall_min)} | {fmt_price2(overall_max)} | {r.spec.unit} |"
        )
    lines.append("")
    return "\n".join(lines)


def write_csv(results: list[ProductResult], path: Path) -> None:
    fields = [
        "target_product",
        "year",
        "unit",
        "min_net_unit_price",
        "max_net_unit_price",
        "median_net_unit_price",
        "average_net_unit_price",
        "first_price_of_year",
        "last_price_of_year",
        "number_of_price_observations",
        "number_of_distinct_invoices",
        "matched_skus",
        "raw_observation_count",
        "clean_observation_count",
        "mad_removed_count",
        "used_fallback",
        "fallback_notes",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in results:
            if not r.yearly:
                w.writerow(
                    {
                        "target_product": r.spec.name,
                        "year": "",
                        "unit": r.spec.unit,
                        "raw_observation_count": r.raw_count,
                        "clean_observation_count": 0,
                        "mad_removed_count": r.mad_removed,
                        "used_fallback": r.used_fallback,
                        "fallback_notes": "; ".join(r.fallback_flags),
                        "matched_skus": ";".join(sorted(r.skus)),
                    }
                )
                continue
            for year in sorted(r.yearly):
                y = r.yearly[year]
                w.writerow(
                    {
                        "target_product": r.spec.name,
                        "year": year,
                        "unit": r.spec.unit,
                        "min_net_unit_price": fmt_price(y["min"]),
                        "max_net_unit_price": fmt_price(y["max"]),
                        "median_net_unit_price": fmt_price(y["median"]),
                        "average_net_unit_price": fmt_price(y["average"]),
                        "first_price_of_year": fmt_price(y["first"]),
                        "last_price_of_year": fmt_price(y["last"]),
                        "number_of_price_observations": y["observations"],
                        "number_of_distinct_invoices": y["invoices"],
                        "matched_skus": ";".join(sorted(r.skus)),
                        "raw_observation_count": r.raw_count,
                        "clean_observation_count": r.clean_count,
                        "mad_removed_count": r.mad_removed,
                        "used_fallback": r.used_fallback,
                        "fallback_notes": "; ".join(r.fallback_flags),
                    }
                )


SUSPECT_NAMES = {
    "שקע קורוס",
    "יחיד קורוס",
    "חילוף קורוס",
    "מסגרת 1 מקום קורוס",
    "מסגרת 2 מקום קורוס",
    "מתאם 3 מקום קורוס",
    "מתאם 4 מקום קורוס",
    "קופסה 4 מקום פטנט לגבס",
    "כבל 5×10",
}


def main() -> None:
    csv_path = OUT_DIR / "requested_product_price_ranges.csv"
    prior_years = load_prior_years(csv_path)
    rows = load_combined_rows()
    staging_rows = [r for r in rows if norm(r.get("_source", "")) == "staging"]
    source_lines_checked = len(staging_rows)

    results = [select_rows(rows, spec) for spec in PRODUCTS]

    for r in results:
        old = prior_years.get(r.spec.name, set())
        for year in sorted(set(r.yearly.keys()) - old):
            r.repaired_years.append((year, r.yearly[year]["observations"]))

    md_path = OUT_DIR / "requested_product_price_ranges.md"
    md_path.write_text(build_markdown(results, prior_years), encoding="utf-8")
    write_csv(results, csv_path)

    total_restored = sum(obs for r in results for _, obs in r.repaired_years)
    products_repaired = {r.spec.name for r in results if r.repaired_years}
    years_repaired = {y for r in results for y, _ in r.repaired_years}

    wire15 = next(r for r in results if r.spec.name == "חוט 1.5")
    wire25 = next(r for r in results if r.spec.name == "חוט 2.5")
    w15_2020 = 2020 in wire15.yearly
    w25_2020 = 2020 in wire25.yearly

    staging_2026 = [r for r in staging_rows if norm(r.get("invoice_year", "")) == "2026"]
    matched_2026 = [r for r in results if 2026 in r.yearly]

    print(f"SOURCE INVOICE LINES CHECKED = {source_lines_checked}")
    print(f"VALID OBSERVATIONS RESTORED = {total_restored}")
    print(f"PRODUCTS REPAIRED = {len(products_repaired)}")
    print(f"YEARS REPAIRED = {len(years_repaired)}")
    print(f"2020 חוט 1.5 = {'FOUND' if w15_2020 else 'NOT FOUND'}")
    print(f"2020 חוט 2.5 = {'FOUND' if w25_2020 else 'NOT FOUND'}")
    print(f"2026 INVOICES FOUND = {'YES' if staging_2026 else 'NO'}")
    print(f"2026 PRODUCTS MATCHED = {len(matched_2026)}")
    print(
        "ROOT CAUSE = product_price_history price_outlier=YES + global cross-year MAD filter; "
        "fixed by staging PASS source + per-year MAD only"
    )
    print("REPORT UPDATED = YES")
    print("CSV UPDATED = YES")


if __name__ == "__main__":
    main()
