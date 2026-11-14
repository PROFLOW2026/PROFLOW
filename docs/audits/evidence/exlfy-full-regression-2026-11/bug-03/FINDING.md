# BUG-03 — Plan PDF cannot pan freely after zoom

**Audit type:** READ-ONLY (code + git history)  
**Date:** 2026-11-14  
**Example file:** `3643-EL-M2.pdf` (cloud-linked / storage preview context)  
**Scope:** EXLFY surfaces using in-app PDF preview (main app company files, project-plans drawing workspace, contractor `AuthorizedFilePreviewDialog`, documents preview)

---

## Summary

Pan-after-zoom for plan PDFs is implemented in a **single shared viewer** (`PdfJsViewer`) used by both cloud storage preview and project-plans. The viewer uses **two different zoom mechanisms**: (1) layout zoom via `pageWidth` / `zoomFactor`, and (2) live pinch preview via CSS `transform: scale()`. Panning depends on **scroll overflow of the layout box**, not the visual transform. That mismatch, plus **no touch/pointer drag-pan** (unlike image preview), explains why users cannot reach other areas of a drawing after zoom—especially on mobile inside the fullscreen preview shell.

**Classification:** Shared component defect in `src/modules/external-storage/ui/pdf-js-viewer.tsx`, amplified by `storage-file-preview-shell.tsx` body scroll lock. **Not** a project-plans overlay regression when sheet-mark tool is `view`.

**Severity:** **High (P1)** — blocks core field workflow on large engineering sheets; affects all three surfaces equally wherever PDF preview is used.

---

## Reproduction path (code-level, not manual QA in this audit)

| Step | Surface |
|------|---------|
| Open PDF from cloud storage (`StorageFilePreviewDialog`) or plan revision (`DrawingRevisionPdfWorkspace` / contractor `AuthorizedFilePreviewDialog`) | Same `PdfJsViewer` inside `StorageFilePreviewShell` |
| Zoom via pinch or toolbar +/- | `zoomFactor` and/or `gestureScale` change |
| Attempt one-finger drag / scroll to pan | Native `overflow-auto` scroll and/or hand tool (mouse only) |

---

## Verified code evidence

### 1. Single shared viewer (cloud + plans)

| Consumer | File |
|----------|------|
| Cloud storage browser | `src/modules/external-storage/ui/storage-file-preview-dialog.tsx` |
| Authorized / contractor revision stream | `src/modules/external-storage/ui/authorized-file-preview-dialog.tsx` |
| Internal project plans + sheet marks overlay | `src/modules/project-plans/ui/drawing-revision-pdf-workspace.tsx` |
| Compare dialog | `src/modules/project-plans/ui/drawing-revision-compare-dialog.tsx` |
| Documents | `src/modules/documents/ui/document-preview-dialog.tsx` |

All import `PdfJsViewer` from `src/modules/external-storage/ui/pdf-js-viewer.tsx`.

### 2. Pinch zoom uses CSS transform (does not grow scrollable area)

During pinch, scale is applied with `transform: scale(gestureScale)` on the page stack (`visualScale`). Layout width remains tied to `pageWidth` until `commitGestureZoom()` merges scale into `zoomFactor`:

- `commitGestureZoom`: multiplies `zoomFactor`, resets `gestureScale` to 1 (`pdf-js-viewer.tsx` ~177–184).
- Pinch handlers only run when `!handToolActive` (~249–281).
- Wrapper style applies transform when `visualScale !== 1` (~642–648).
- Commit delayed by `PDF_PINCH_COMMIT_MS` (120ms) on `touchend` (~278–280).

**Effect:** While `gestureScale !== 1` (during pinch and until commit + re-render), the user sees a larger drawing but **scrollWidth/scrollHeight do not include the transformed pixels**—native pan cannot reach clipped regions.

### 3. Pan implementation gaps

| Input | Behavior | Evidence |
|-------|----------|----------|
| Mouse + hand tool ON | Sets `scrollLeft`/`scrollTop` on mouse move | `onPanMouseDown` / `onPanMouseMove` (~379–401); requires `handToolActive` |
| Mouse drag, hand tool OFF | No pan | Same guards |
| Touch one-finger | No explicit pan handler; relies on `touch-pan-x touch-pan-y` + `overflow-auto` | Class on scroll root (~609–610); touch listeners only for **two-finger** pinch (~249–286) |
| Touch + hand tool ON | Pinch disabled (`if (handToolActive) return`); hand pan still mouse-only | ~250, 263, 379 |

Compare **`ZoomablePreviewImage`** (`zoomable-preview-image.tsx`): uses `onPointerDown`/`onPointerMove` with `setPointerCapture` for drag pan on mouse **and** touch (~53–71), plus translate-based pan after zoom. PDF path deliberately does not mirror this.

### 4. Preview shell body lock (mobile risk)

`StorageFilePreviewShell.lockBodyScroll()` sets `document.body.style.touchAction = 'none'` while open (~24). The inner PDF scroll viewport uses `touch-pan-x touch-pan-y`, but global `touch-action: none` on `body` is a known cause of **broken nested scrolling on iOS Safari**. Unit test only asserts unlock on close (`storage-file-preview-shell.test.tsx`); no test that inner PDF scroll works under lock.

### 5. UI overlay layer (project plans)

`DrawingSheetMarksPageOverlay` sets `pointer-events-none` when `tool === 'view'` (~85–91). Overlay does **not** block pan in default view mode. Interactive measure/pin/note tools intentionally capture clicks (`interactive ? cursor-crosshair : pointer-events-none`).

### 6. PDF render layers

`PdfLazyPage` disables text/annotation layers (`renderTextLayer={false}`, `renderAnnotationLayer={false}`) — reduces pointer capture from PDF.js layers (~76–77).

### 7. Tests gap

`tests/ui/pdf-js-viewer-mobile-toolbar.test.tsx` covers mobile toolbar menu + rotate only. **No** tests for pinch commit, scroll extents after zoom, or touch pan.

### 8. Git history (relevant commits)

| Commit | Message | Relevance |
|--------|---------|-----------|
| `f6c45b02` | lazy PDF pages, pinch zoom, devicePixelRatio re-render | Introduced `gestureScale` + transform preview + deferred `commitGestureZoom` |
| `5cd8a858` | hand tool, zoom presets, mobile more menu | Mouse-only pan via hand tool; pinch disabled when hand tool active |
| `adae59d6` | design-v2 shell attribute | Cosmetic on preview shell |

No recent commit in the examined range fixes pan-after-zoom.

---

## Root cause hypothesis vs evidence

| # | Hypothesis | Confidence | Evidence |
|---|------------|------------|----------|
| **H1 (primary)** | **Transform-based pinch preview decouples visual zoom from scrollable layout**, so pan cannot reach off-screen content until scale is committed into `pageWidth`; users perceive this as “stuck” after zoom | **High** | Transform wrapper ~642–648; `commitGestureZoom` ~177–184; 120ms delay ~278–280; no pan offset model |
| **H2** | **Mobile one-finger pan relies on native scroll inside a body `touch-action: none` lock**, which may fail on iOS/Android even after layout zoom commits | **Medium** (needs device QA) | `storage-file-preview-shell.tsx` ~24; contrast with image viewer pointer pan |
| **H3** | **Desktop/tablet users expect drag-to-pan without enabling hand tool**; only scrollbars/wheel work unless hand tool + mouse | **Medium** | Pan gated on `handToolActive` + mouse events only ~379–401 |
| **H4** | Sheet-marks overlay blocks pan | **Low / ruled out in view mode** | `pointer-events-none` when `tool === 'view'` |
| **H5** | Cloud vs plans use different viewers | **False** | Same `PdfJsViewer` import paths |

---

## Affected surfaces (three-surface parity)

| Surface | PDF entry | Overlay |
|---------|-----------|---------|
| Main app | Company / project storage preview, internal `DrawingRevisionPdfWorkspace` | Optional sheet marks |
| Contractor app | `PortalDrawingDetail` → `AuthorizedFilePreviewDialog` | None |
| Employee app | Same storage/plan patterns where `PdfJsViewer` is used | Same as main when marks enabled |

Regression is **shared**; not isolated to cloud storage or plans module wrappers.

---

## Gesture / control matrix (as implemented)

| Gesture | Zoom | Pan | Notes |
|---------|------|-----|-------|
| Pinch (2 finger) | Yes → transform, then commit to `zoomFactor` | Scroll only if layout grew | `isPinching` → `touch-none` |
| One-finger drag (touch) | — | Native scroll only | No pointer pan |
| Mouse drag | — | Only if hand tool ON | No touch equivalent |
| Toolbar +/- | `zoomFactor` | Native scroll / hand tool | `gestureScale` reset to 1 |
| Fit width / fit page | Resets zoom | — | ~477–501 |
| Rotate 90° | Re-layout | Scroll extents change with rotation | ~537–585 |
| Wheel | **Not implemented** on PDF (contrast: image `onWheel` zoom) | Browser may scroll | — |

---

## Proposed fix (do not implement in this audit)

1. **Unify zoom model:** Stop using layout-independent `transform: scale` for committed zoom; update `pageWidth`/`zoomFactor` synchronously on pinch end (or continuously with throttled re-render). Alternatively pan with explicit `scrollLeft`/`scrollTop` + translate like `ZoomablePreviewImage`.
2. **Pointer pan parity:** Add `onPointerDown`/`onPointerMove` pan on the scroll viewport for one-finger touch when not pinching and when sheet overlay is non-interactive (mirror image preview). Optionally enable without hand-tool toggle on touch devices.
3. **Hand tool:** Extend pan handlers to pointer events; consider default “pan mode” for plan PDFs or auto-enable hand tool after zoom > 100%.
4. **Body scroll lock:** Replace `body { touchAction: 'none' }` with overflow/position lock only, or set `touch-action: pan-x pan-y` on the PDF scroll root with explicit `overscroll-behavior: contain`.
5. **Pinch + pan:** After pinch, reset scroll position toward pinch focal point so users are not left at (0,0) on a large sheet.
6. **Tests:** Vitest/Playwright asserting `scrollWidth > clientWidth` after zoom and simulating pointer pan / touch scroll under open `StorageFilePreviewShell`.

---

## Files for implementer

| Priority | Path |
|----------|------|
| P0 | `src/modules/external-storage/ui/pdf-js-viewer.tsx` |
| P1 | `src/modules/external-storage/ui/storage-file-preview-shell.tsx` |
| Reference | `src/modules/external-storage/ui/zoomable-preview-image.tsx` |
| Overlay | `src/modules/project-plans/ui/drawing-sheet-marks-overlay.tsx` (view mode only) |
| Utils | `src/modules/external-storage/ui/pdf-viewer-utils.ts` |

---

## Evidence artifacts in this folder

- `code-excerpts.md` — line-anchored snippets
- `consumer-map.md` — all `PdfJsViewer` call sites
- `git-commits.txt` — `git log` for viewer files
