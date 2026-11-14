# BUG-03 — Touch / pan gaps (code evidence)

**Device QA:** Real **Android / iOS** pinch-after-pan behavior → **UNVERIFIED** in this wave (jsdom + source probes only).

## Transform vs layout scroll

| Phase | `gestureScale` | Layout `pageWidth` | `scrollWidth` grows? | User-visible zoom? |
|-------|----------------|--------------------|----------------------|-------------------|
| Pinch in progress | 1.25–4 | Unchanged until commit | **No** | Yes (`transform: scale`) |
| After `commitGestureZoom` | 1 | `zoomFactor` merged | **Yes** (if zoom > fit) | Yes (layout) |

Probe: `pdf-transform-scroll-probe.test.ts` (jsdom `scale(2)` on inner node).

## Input matrix (after BUG-03 fix in `pdf-js-viewer.tsx`)

| Input | Pan mechanism | Notes |
|-------|---------------|--------|
| Touch 1-finger | Pointer-capture → `scrollLeft` / `scrollTop` | `touch-none` on scroll root; mirrors `ZoomablePreviewImage` |
| Touch 2-finger | Pinch → `gestureScale` preview, then sync `commitGestureZoom` into layout | Disabled when `handToolActive` |
| Mouse drag | Pointer-capture pan (threshold unless hand tool) | Annotate/measure `.cursor-crosshair` skipped |
| Wheel | Browser default scroll | No PDF-specific wheel zoom |

## Shell interaction

`storage-file-preview-shell.tsx` no longer sets `body.style.touchAction = 'none'` (overflow + `position: fixed` still lock background). Device QA on iOS/Android still recommended.
