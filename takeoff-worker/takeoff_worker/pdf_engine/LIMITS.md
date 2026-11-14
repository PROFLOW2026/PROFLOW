## Legend templates (Round 2)

- **`build_legend_templates(output)`** (`takeoff_worker/pdf_engine/legend.py`) — canonical way to obtain `LegendTemplate` list with `mask_b64`, `radius_pt`, `color_hex`, `tag_text`, `decoded_text`.
- Artifacts: `legend-templates-{fileId}.json`, per-row `legend-mask-b64-{Lk}`, PNG crops `legend-{sheetKey}-{n}.png`.
- Detection mask lookup: artifact `{detectionId}-mask.b64` (same 64×64 packed mask as library templates).
- **Pipeline note:** `pipeline.py` still builds `extra_templates` only when `decodedText` is set on legend rows. Agent 3 should call `build_legend_templates(out)` after the legend PDF and pass masks into `analyze(..., extra_templates=...)`. Until then, offline/corpus two-pass (legend → plan) matches research.

## Legend sources

- **Separate legend PDF** (7155 `*-מקרא.pdf`): full-page coloured `build_components` (research parity).
- **Embedded** (3643 / AS1749 / 4285): full-height right column (`auto_legend_components`) + `templates_for_plan_matching` (decodable rows only → `legendKey` on plan matches).

# PdfVectorEngine limits (Agent 1)

## Extraction (pypdfium2 vs PyMuPDF oracle)

- One pdfium path object maps to one drawing item. PyMuPDF may merge/split paths; expect ~0–3% count delta (measured: 74,933 vs 72,898 on `7155-A1-תאורה ג`).
- Bounds parity within ~0.4 pt after Y-flip (bottom-left → top-left display space).
- Page rotation ≠ 0: preview honors rotation via pdfium render; path points use `rotation_matrix` like PyMuPDF. Extremely nested Form XObjects may diverge.

## Legend zone (BOQ)

- Detections with `reasons` containing `legend_zone` are emitted for review but **`plan_quantity_detections_*` / BOQ must not count them**.
- Bottom title-band (7155): tight bbox of embedded legend rows (`y > 62%` page height, not right-column strips). Target ~46 excluded on 7155 תאורה ג (not the earlier ~88 over-count).
- Full-height right-column legends (rotated AS1749): geo zone disabled when `legend_comps ≥ 30` to avoid eating the plan; rely on `legend_zone_false_positive_*` + overlay review until column-specific dedupe lands.
- Stat `legend_zone_false_positive_{sheet}` counts excluded symbols whose center sits inside `plan_field_rect` (main drawing).

## Embedded legend text (Agent 3)

- `WorkerLegendEntry`: `rawText`, `decodedText`, `textBox` `{x0,y0,x1,y1}` (display pt), optional `reasons` (e.g. `legend_text_undecodable`).
- Extraction: pdfium per-char boxes → `legend_row_text_chars` (RTL via `decode_pdf_text`, mojibake guard).
- Stats on legend build: `legend_text_usable`, `legend_text_undecodable_count`.

## Legend / classification

- **7155-style** coloured single-piece symbols: legend-template matching works (research baseline).
- **3643 / AS1749**: complex multi-colour legend rows + text-as-outlines → high `unclassified`; `core_components` + column filter improves but not production-grade without user clusters.
- **7155 text layer**: often absent on symbols; legend description decode is `decodedBy=none`.

## Monochrome (2302, 1727)

- `black_symbol_candidates` is best-effort only: walls, dimension strings, and hatches are not reliably separated. Outputs use `monochrome_fallback` warning and `shape_cluster` / low confidence.

## Performance

- 7155 sheet (~75k paths): extraction ~6 s on Windows dev CPU (target <30 s).

## Memory / heavy plans

- Env budgets (`heavy_guard.py`): `PDF_MAX_PATH_OBJECTS` (250k, soft noise prune &lt;3.5pt only), `PDF_MAX_PATH_OBJECTS_HARD` (400k → `pdf_plan_too_heavy` + `partial`), `PDF_MAX_PLAN_CANDIDATES` (12k), `PDF_MAX_LEGEND_ROWS` (120), `PDF_MAX_TEXT_CHARS` (250k, info only), `PDF_MAX_MATCH_CELLS` (400k).
- `analyzed: partial` only when hard path budget exceeded or plan/legend caps actually dropped countable candidates.
- Run heavy scripts only via `scripts/run_capped.py` (6 GiB RSS cap).
- **2302 root cause (prior OOM):** unbounded per-char text scan + full-path legend/artifact build on ~118k vectors — not extract alone.

## AGPL

- Runtime code must not import PyMuPDF. Parity/regression tests may use PyMuPDF as oracle (`requirements-dev` / test-only).