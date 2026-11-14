# Electrical takeoff accuracy report

Generated: **2026-11-14 Round 7** via `takeoff-worker/scripts/accuracy_report.py` (each case wrapped in `scripts/run_capped.py`, 6 GiB RSS, 8 min/case). **2302 / 1727:** `pending_guard` (Agent 1 memory fix).

**Policy:** No **human-verified** BOQ accuracy claim. Labels: **DWG oracle** (7155 pairing), **unverified** (PDF-only / no control count), **pending_guard** (deferred heavy run).

## Summary table

| Case | GT label | Wall (s) | Det | Plan qty | Classified (plan %) | High conf | Unclassified plan | BOQ countable | Legend zone excl | Merge PDF% |
|------|----------|---------:|----:|---------:|--------------------:|----------:|------------------:|--------------:|-----------------:|-----------:|
| **7155_light_g** | DWG oracle + PDF↔DWG agreement | 95–107 | 478 | 432 | 380 (**88.0%**) | 11–15 | 210 | **250** | **46** | **82.4%** (150 pairs) |
| **3643** | unverified | 14–18 | 34–42 | same | **0.0%** | 0 | all plan | 34–42 | 0 | — |
| **2267** | unverified | 13–26 | 153–155 | 143–145 | **0.0%** | 0 | 143–145 | 143–145 | **10** | — |
| **4285** | unverified | 21 | 394 | 304 | **0.0%** | 0 | 304 | 304 | **87** | — |
| **as1749** | unverified | 23 | 634 | 634 | **0.0%** | 0 | 634 | 634 | 0 | — |
| **2302** | pending_guard | — | — | — | — | — | — | — | — | — |
| **1727** | pending_guard | — | — | — | — | — | — | — | — | — |

### Round 7 notes

- **7155 (re-verify):** DWG תאורה ג **219** visible; PDF plan **228** dets / **182** plan-qty after legend zone; **46** `legend_zone` (BOQ excluded); merge **150** twins = **82.4%** of plan-qty; **boq_countable 250**; **boq_excluded_pdf_only 32**. No regression vs lead targets.
- **Embedded PDF-only:** Legend text mostly **outline / undecodable** → **legend_rows_classified ≈ 0**; plan detections stay **UNK** (shape cluster) → **0% type classification**. **AS1749:** **50** usable legend strings but **no legendKey** link to plan symbols yet → honest **0%** on detections; symbol group labels (`symbol group #N`) for review.
- **4285 / as1749** accuracy rows refreshed from capped `corpus_run.py` (accuracy harness batch partially lock-blocked on 4285).

## Regenerate

```powershell
cd takeoff-worker
.\.venv\Scripts\python.exe scripts/run_capped.py --rss-gib 6 --timeout 7200 -- `
  .\.venv\Scripts\python.exe scripts/accuracy_report.py --no-dwg
```

Include `--cases 7155_light_g` for a single case. Do **not** run 2302/1727 until Agent 1 guard ships.

## Case detail (harness)

### 7155_light_g
- **Status:** succeeded | **~95s** | *DWG oracle + PDF↔DWG agreement*
- Detections: 478 | plan qty: 432 | Classified: 380 (79.5%, plan **88.0%**) | BOQ countable: **250**
- Legend zone excluded (BOQ): **46** | pdf_only excluded: 32
- PDF cls **86.8%** / DWG cls **88.8%** | Merge PDF: **82.4%** (150 pairs)

### 3643 / 2267 / 4285 / as1749
- All **unverified** — no human control count.
- **0%** plan-type classification (high conf **0**); symbol groups assigned for human naming / library save.
- Legend text usable (engine): 3643 **0**, 2267 **0** (+2 undecodable rows), 4285 **0**, as1749 **50** usable / **8** undecodable.