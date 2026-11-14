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
| Touch 2-finger | Pinch → `gestureScale` preview, then sync `commitGestureZoom` into layout | Cancels one-finger pan; disabled when `handToolActive` |
| Mouse drag | Pointer-capture pan via `applyPdfScrollPan` | Touch/pen pointer path skipped to avoid double-scroll |
| Wheel | Browser default scroll | No PDF-specific wheel zoom |

## Horizontal one-direction stuck (2026-11-14)

**Cause:** he-IL RTL shell + `items-center` / `w-full` on a page wider than the viewport made `scrollLeft` asymmetric after zoom. Vertical worked; one horizontal edge was unreachable.

**Fix:** scrollport `dir="ltr"`; page stack width = `pageWidth` (not centered flex fill); pan clamped with `applyPdfScrollPan`; after zoom, `scrollLeft` recentered so both edges are reachable.

**SW:** shell cache `projectflow-shell-v9` (SW never cached PDF/API bytes).

## Shell interaction

`storage-file-preview-shell.tsx` no longer sets `body.style.touchAction = 'none'` (overflow + `position: fixed` still lock background). Device QA on iOS/Android still recommended.
