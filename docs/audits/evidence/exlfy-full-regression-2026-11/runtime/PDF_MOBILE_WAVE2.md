# PDF_MOBILE_WAVE2 — EXLFY (2026-11-14)

**Scope:** Automated pointer/touch against `PdfJsViewer` + viewport gap widths.  
**DB:** local `projectflow_e2e` only. **No Production. No product fixes.**

## A. Viewport gaps (dashboard)

| Width | Status | Screenshot |
|-------|--------|------------|
| 360 | **VERIFIED PASS** | `screenshots/viewports/dashboard-360.png` |
| 430 | **VERIFIED PASS** | `screenshots/viewports/dashboard-430.png` |
| 1920 | **VERIFIED PASS** | `screenshots/viewports/dashboard-1920.png` |

Spec: `exlfy-viewport-gaps.spec.ts` · project `regression-viewport-gaps` · FAB cleared bottom nav @≤430.  
Prior widths 320/375/390/768/1280 + dark@390 remain **PASS** from earlier viewport smoke.

## B. PdfJsViewer interactive probe

| Check | Status | Reason |
|-------|--------|--------|
| Seeded document/PDF URL | **UNVERIFIED** | `.world.json` / audit fixtures have no document content URL |
| Company-files upload → preview | **HARNESS** | Browse error: storage must be reconnected (`pdf-company-files-no-upload.png`) |
| OCR upload → `viewOriginal` → PdfJsViewer | **HARNESS** | OCR job not selected after PDF attach (`pdf-ocr-upload-failed.png`); mock/provider path unstable this run |
| Pointer zoom / hand-tool / mouse pan | **UNVERIFIED** | Viewer shell never mounted this wave |
| Synthetic TouchEvents on live viewer | **UNVERIFIED** | Blocked by open_viewer HARNESS |
| Touch pan gap (product model) | **UNVERIFIED** (code) | Confirmed in `bug-03/TOUCH_PAN_GAPS.md`: no touch drag-pan; mouse hand-tool only; pinch uses `transform` until commit |
| PDF geometry unit probe | **VERIFIED PASS** | Prior wave: `bug-03/pdf-transform-scroll-probe.test.ts` + `scroll-extent-probe.json` |
| Real Android / iOS device | **UNVERIFIED** | No device lab |

Spec: `exlfy-pdf-touch-probe.spec.ts` · `RUN_LOG_PDF.txt` · `_pdf_verdicts.json`.

## C. Touch gap summary (carry forward)

| Input | Mechanism | Gap |
|-------|-----------|-----|
| 1-finger touch | Native `overflow-auto` only | No dedicated pan; fails when `touch-none` during pinch / shell body lock |
| 2-finger pinch | `gestureScale` CSS transform | Layout scroll extents do not grow until `commitGestureZoom` |
| Mouse + hand tool | `scrollLeft`/`scrollTop` | **No touch equivalent** |
| Image preview parity | `zoomable-preview-image` has pointer-capture pan | PDF does not mirror |

## D. Interpretation

Interactive browser PDF gestures remain **blocked by harness storage/OCR paths** in this wave, not by a new product finding beyond BUG-03 code evidence. Real-device QA stays **UNVERIFIED**.
