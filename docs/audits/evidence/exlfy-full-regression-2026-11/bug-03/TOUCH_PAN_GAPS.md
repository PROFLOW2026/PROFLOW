# BUG-03 — Touch / pan gaps (code evidence)

**Device QA:** Real **Android / iOS** pinch-after-pan behavior → **UNVERIFIED** in this wave (jsdom + source probes only).

## Transform vs layout scroll

| Phase | `gestureScale` | Layout `pageWidth` | `scrollWidth` grows? | User-visible zoom? |
|-------|----------------|--------------------|----------------------|-------------------|
| Pinch in progress | 1.25–4 | Unchanged until commit | **No** | Yes (`transform: scale`) |
| After `commitGestureZoom` | 1 | `zoomFactor` merged | **Yes** (if zoom > fit) | Yes (layout) |

Probe: `pdf-transform-scroll-probe.test.ts` (jsdom `scale(2)` on inner node).

## Input matrix (after BUG-03 Android follow-up in `pdf-js-viewer.tsx`)

| Input | Pan mechanism | Notes |
|-------|---------------|--------|
| Touch 1-finger | **TouchEvent** → `applyPdfScrollPan` (clamped LTR) | Android Chrome pointer-capture was unreliable on canvas; touch path owns pan |
| Touch 2-finger | Pinch → CSS `gestureScale` + origin at finger midpoint; commit layout zoom on finger-up | Live `zoomFactor` remounted PDF pages and froze Android (f1f22c73 regression); restored CSS preview |
| Mouse drag | Pointer-capture pan via `applyPdfScrollPan` | Touch/pen pointer path skipped to avoid double-scroll |
| Wheel | Browser default scroll | No PDF-specific wheel zoom |

## Horizontal one-direction stuck (2026-11-14)

**Cause:** he-IL RTL shell + `items-center` / `w-full` on a page wider than the viewport made `scrollLeft` asymmetric after zoom. Vertical worked; one horizontal edge was unreachable.

**Fix:** scrollport `dir="ltr"`; page stack width = `pageWidth` (not centered flex fill); pan clamped with `applyPdfScrollPan`; toolbar presets may still center horizontally.

## Pinch jumps to page top (2026-11-14)

**Cause:** CSS `transform-origin: top center` during pinch + auto-`scrollLeft` center on commit moved the view away from the finger midpoint.

**Failed fix (f1f22c73):** live `zoomFactor` on every touchmove remounted `PdfLazyPage` (key includes `pageWidth`) → pinch appeared dead on Android.

**Current fix:** restore CSS `gestureScale` preview with `transform-origin` at finger midpoint; commit `zoomFactor` once on finger-up with `scrollAfterScaleAtFocal` (no auto-center). Toolbar +/- zooms about viewport center; presets still center.

**SW:** shell cache `projectflow-shell-v9` (SW never cached PDF/API bytes).

**Device QA:** Real Android multi-touch on Production after next deploy — required. jsdom/unit cannot prove gesture feel.

## Shell interaction

`storage-file-preview-shell.tsx` no longer sets `body.style.touchAction = 'none'` (overflow + `position: fixed` still lock background). Device QA on iOS/Android still recommended.
