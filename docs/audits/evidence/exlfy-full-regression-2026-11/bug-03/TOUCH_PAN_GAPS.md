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
| Touch 1-finger | **TouchEvent** non-passive `touchmove` → `scrollLeft` / `scrollTop` | Android Chrome pointer-capture was unreliable on canvas; touch path owns pan |
| Touch 2-finger | Pinch → `gestureScale` preview, then sync `commitGestureZoom` into layout | Cancels one-finger pan; disabled when `handToolActive` |
| Mouse drag | Pointer-capture pan (hand tool immediate; else threshold) | Touch/pen pointer path skipped to avoid double-scroll |
| Wheel | Browser default scroll | No PDF-specific wheel zoom |

**SW:** shell cache bumped `projectflow-shell-v8` → `v9` so installed PWA reclaims clients after deploy (SW never cached PDF/API bytes).

## Shell interaction

`storage-file-preview-shell.tsx` no longer sets `body.style.touchAction = 'none'` (overflow + `position: fixed` still lock background). Device QA on iOS/Android still recommended.
