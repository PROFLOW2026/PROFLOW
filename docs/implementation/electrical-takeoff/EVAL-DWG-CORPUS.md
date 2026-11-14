# DWG corpus evaluation (engine-only + pipeline)

Root: `Downloads\בדיקה\` (read-only). Runs: `run_capped.py` one case per invocation (`corpus_run.py dwg_3031_*`), 2026-11-14.

**Label legend**

| Label | Meaning |
|---|---|
| **DWG oracle** | Counts come from the DWG engine on this file (inserts in picked viewport, frozen/hidden excluded from plan qty). No independent human recount. |
| **unverified** | Engine ran; no PDF pairing or human control sheet — classification % is diagnostic only. |
| **human-verified** | _(none in this batch)_ |

## Summary

| Case | Label | sec | peak RSS | sheets | det (plan) | classified % | scale | hidden (boq excl.) | viewport notes |
|---|---|---:|---:|---:|---:|---:|---|---:|---|
| 3031-M | **DWG oracle** / det **unverified** cls | 139.2 | 0.51 GiB | 10 | 3416 | 7.0% | unverified | 3003 | Per-layout `pick_sheet_viewport` → 800×600 previews; inserts on frozen layers not counted (e.g. GND 832h, M1F 603h). |
| 3031-D123 | **DWG oracle** | 52.0 | 0.18 GiB | 15 | 3432 | 33.8% | unverified | 0 | Floor layouts B1-F*; xref missing (3031-IEC, A–F, BB). |
| 3031-D124 | **DWG oracle** | 104.1 | 0.22 GiB | 20 | 4806 | 27.9% | unverified | 0 | B2/B3 floor stacks; multiple WP xrefs missing. |
| 3031-SW | **unverified** | 41.1 | 0.16 GiB | 5 | 4409 | 0.1% | unverified | 0 | SW1–SW5 switchgear sheets; almost all UNCLASSIFIED. |
| 3031-GND | **unverified** | 4.4 | 0.14 GiB | 8 | 280 | 0.0% | unverified | 0 | M1/M2/M3 C+F pairs; legend-less. |
| 3031-PIT | **unverified** | 0.3 | 0.08 GiB | 3 | 0 | n/a | unverified | 0 | F1/IEC/M0 — no inserts in viewport (empty plan qty). |

## 3031-M viewport / scale (honest)

- **Viewport:** `dwg_engine.viewport.pick_sheet_viewport` chooses per layout by insert density (not last paper reg). Every listed sheet rendered **800×600** (`previewMaxEdgePx=2048` pipeline default) — consistent crops, not full paper extents.
- **Scale:** `scale=None`, `verified=False` on all M layouts — **unverified** for BOQ length/m²; point counts only are **DWG oracle**.
- **Hidden layers:** `boq_hidden_layers_sheet=3003` — frozen/hidden inserts excluded from countable set; visible plan qty **3416** matches summed sheet `det` with `hiddenByLayers` on sheet rows (e.g. GND 98 visible + 832 hidden).
- **Batch note:** `corpus_dwg_batch.py` (all cases + `renderPreview=True` + tracemalloc) hit **RSS cap 6 GiB** on 3031-M alone; use per-case `corpus_run` under `run_capped` instead.

## Warnings (typical)

- `dwg_unstable_objects` (LibreDWG) on all 3031 files.
- `xref_missing` on M, D123, D124, GND (expected offline corpus).
- `possible_duplicate` collapsed stacks on SW2–SW5.

## Commands

```text
cd takeoff-worker
.\.venv\Scripts\python scripts\run_capped.py --rss-gib 6 --timeout 600 -- python scripts\corpus_run.py dwg_3031_m
# … dwg_3031_d123 | dwg_3031_d124 | dwg_3031_sw | dwg_3031_gnd | dwg_3031_pit
```

Convert cache: `takeoff-worker/.cache/` (gitignored).