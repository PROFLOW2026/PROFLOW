# CAD text regression fix (2026-10)

## Root cause

WASM JSON schema v2 emits mirror flags as booleans:

```json
"bx": false,
"by": false
```

`draw-cad-text.ts` treated any non-null `bx`/`by` as numeric scale and ran:

`ctx.transform(false, 0, 0, false, 0, 0)` → **0 scale** → invisible glyphs.

On sample files **every** text record includes `bx`/`by`, so essentially all labels disappeared while WebGL geometry stayed correct.

## Fix

- `mirrorScale()`: only `true` → −1; `false` / omitted → 1; then apply width/oblique as before.
- Restored debounced `scheduleTextRedraw` during pan/zoom (avoids empty overlay while rAF slices catch up).
- Hebrew (and ar/ru/en) banner fallbacks when `next-intl` throws `MISSING_MESSAGE`; `useLocale()` passed into `formatCadDwgBannerLabel`.

## Paint audit (Node + committed WASM)

| File | Parsed texts | Paintable (content gates) | Would zero-scale (legacy bug) | After fix |
|------|-------------|---------------------------|-------------------------------|-----------|
| 3031-SW.dwg | 6078 | 6030 | 6078 | 0 |
| 3096-EL.dwg | 614 | 613 | 614 | 0 |

Script: `node scripts/pf-cad-text-paint-audit.mjs [file.dwg]`

## Manual visual gate (Owner)

After dev refresh, re-open Company Files preview for 3031-SW and 3096-EL:

- English labels and electrical numbers visible
- Pan/zoom keeps overlay synced
- he-IL fonts banner in Hebrew when shown
