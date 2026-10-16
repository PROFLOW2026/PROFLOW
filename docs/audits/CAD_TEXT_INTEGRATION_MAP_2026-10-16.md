# CAD text integration map (2026-10-16)

Runtime path as of committed WASM `engineCommitSha` **`2d17b6a`**. No WASM rebuild. Worker was not edited: it has no Hebrew decode call, and Agent B owns the decode signature.

## Lead call-site list

Update these after Agents A / B / C land. Do not edit the owned files from this map.

| After | Function that will change | Call sites that must follow |
|---|---|---|
| A (`cad-shx-font.ts`) | `parseShxFont`, `parseShxBigfontFile`, `drawShxLine`, `resolveShxGlyphStroke`, `shxGlyphAdvance` | `cad-shx-registry.ts` `registerCadShxFonts`; `shx-text-segments.ts` `layoutShxText` / `appendShxGpuSegments`; `draw-cad-text.ts` `drawCadText` (via `drawShxLine` / `measureShxTextBlock`) |
| B (`hebrew-shx-decode.ts`) | `maybeDecodeHebrewShxText(text, style)` | **`shx-text-segments.ts` `textLines`**; **`draw-cad-text.ts` `drawCadText`**; **`cad-gpu-text-policy.ts` `shxTextRequiresCanvasFallback`**. Tests: `hebrew-shx-decode.test.ts`, `cad-text-regression-guards.test.ts`, `cad-text-anchor.test.ts` |
| B (`hebrew_shx.rs`) | `maybe_decode_hebrew_shx_text` | **Not called today.** Hook is `gpu_text_emit.rs` `shape_string_for_gpu` (percent-codes only). Do not re-export from `lib.rs` until C wires it |
| B (`font-resolver.ts`) | `cadFontNamesFromScene`, `resolveCadFontsFromStorage`, `fontLookupCandidates` | `pf-dwg-viewer.tsx` parse + space-switch font loads (three `resolveCadFontsFromStorage` sites) |
| B (`cad-entity-text-style.ts`) | `entityStyleFontNameCandidates`, `tableRowsEmbeddedInEntityStyle` | `cad-shx-registry.ts` `registerCadShxEntityStylePrefixBindings` / `registerCadShxTextStyleAliases` |
| C (`gpu_text_emit.rs`) | `push_text_gpu`, `push_mtext_gpu`, `push_attrib_gpu`, `push_mleader_gpu`, `style_uses_shx_font_file`, `mark_gpu_json` | `entity.rs` `EntityType::Text` / `MText` / `emit_attribute_entity` / `emit_multileader` → `push_text_json` |
| C (`pf-fonts`) | `place`, `shape_line`, `TextFont::resolve`, `layout_mtext_with` | only through `gpu_text_emit.rs` (and unused probe `text_gpu.rs`) |
| C (`cad-gpu-text-policy.ts`) | `shouldDrawTextOnCanvas`, `shxTextRequiresCanvasFallback`, `mayMarkTextGpu`, `P8_GPU_TEXT_HANDOFF_ENABLED` | worker `set_p8_gpu_text_handoff`; `pf-dwg-viewer.tsx` canvas loop; `shx-text-segments.ts` strip/sanitize; `apply-p8-text-handoff.ts` |
| C (`apply-p8-text-handoff.ts`) | `applyCadP8GpuTextHandoff` | `pf-dwg-viewer.tsx` after each successful parse (initial, space change, plot toggle) |
| C (`draw-cad-text.ts`) | `drawCadText`, `mirrorScale`, `applyTextMatrix` | viewer canvas slice; `shx-text-segments.ts` imports `mirrorScale`, `anchorOffset`, `attachmentToAlign` |

Worker patch (do **not** apply until B’s decode API is stable and a decode function exists in the worker — it does not today):

```ts
// cad-engine.worker.ts — NOT applied. Decode stays on the main thread.
// If B adds a font-file argument, pass it at the three TS call sites above,
// looking up scene.textStyleTable by tx.style → entry.font / entry.big.
// The worker only JSON-parses WASM output; it never sees SHX bytes.
```

## Runtime path

```
DWG entity
  entity.rs match
    Text      → resolve_text_display → emit_text → push_text_json(push_text_gpu)
    MText     → resolve_text_display → emit_mtext → push_text_json(push_mtext_gpu)
    Attrib    → emit_attribute_entity → emit_attrib → push_attrib_gpu
    MLeader   → resolve_explicit_text_display → emit_mleader_text → push_mleader_gpu
  build_from_doc JSON (schemaVersion 2) + segment buffer
  cad-engine.worker.ts build_dl → decodeJson → postMessage parse-ok
  main thread pf-dwg-viewer.tsx
    resolveCadFontsFromStorage (storage bytes, not WASM)
    registerCadShxFonts + style table + aliases + prefix bindings
    applyCadP8GpuTextHandoff
      stripUpstreamClientShxGpuFlags
      appendShxGpuSegments (maybeDecodeHebrewShxText + resolveShxDrawContext)
      sanitizeSceneGpuTextFlags
    WebGL draws segments
    canvas loop: shouldDrawTextOnCanvas → drawCadText
      maybeDecodeHebrewShxText
      resolveShxDrawContext / drawShxLine or TTF fillText
      cadTextCanvasPaint (ARGB → CSS, plot contrast)
```

Font bytes never enter the worker. XREF deps do (`add_xref_dep`). SHX/TTF load is main-thread only.

## JSON fields emitted for text

`text_emit.rs` `emit_core` (kinds `k`: `text` | `mtext` | `attrib`).

| Field | Meaning |
|---|---|
| `k` | record kind |
| `x`, `y` | world anchor (alignment point when not left/baseline; else insertion), after `Xf` |
| `h` | height × `xf.scale()` |
| `r` | rotation + `xf.rotation()` (**not** `rot`) |
| `c` | packed display color `0xAARRGGBB` |
| `layer` | layer index |
| `t` | string (`decode_percent_codes` for TEXT/ATTRIB; `clean_mtext` for MTEXT/MLEADER) |
| `ix`, `iy` | transformed insertion, when not left/baseline or an align point exists |
| `ax`, `ay` | transformed alignment point |
| `ha`, `va` | horizontal / vertical align enums as ints (MTEXT/MLEADER emit `0,0` and use `att`) |
| `wf`, `obl` | width factor, oblique (MTEXT/MLEADER hard-code `1` and `0`) |
| `bx` | bool backwards mirror (`effective_backwards_mirror`) |
| `by` | bool upside-down (`generation_flags & 4`). MTEXT emits `by: false` |
| `style` | DWG style name string, omitted when empty |
| `att`, `rw`, `lsf`, `lines` | MTEXT / MLeader only |
| `invisible` | ATTRIB extra (invisible attribs are dropped before emit) |
| `gpu` | added by `mark_gpu_json` only when the GPU push returns true |

There is **no** JSON `w`. Width is measured on the client (`measureShxTextBlock` / canvas measure). Scene-level companions: `gpuTexts`, `textStyleTable[]` (`name`, `font`, `big`, `ttf`), `report.fonts` (file name → use count).

## Normal vs Plot (text only)

Same entity walk and same text keys. Divergence is color and canvas contrast, not string content.

1. Worker sets `set_plot_mode` then optional `set_plot_ctb` **before** `build_dl` (`cad-engine.worker.ts`).
2. `color.rs` `aci_display_rgb(7)`: Normal white `0xffffff`, Plot black `0x000000`.
3. `resolve_entity_color` / `resolve_text_display` then `plot::map_plot_rgb`: Normal returns RGB unchanged; Plot uses CTB `map_rgb` or luminance greyscale (lum > 240 → black).
4. MLeader text uses `resolve_explicit_text_display` (same plot map). Leader geometry uses `resolve_entity_display` (skipped entirely when color is `None`; text is not).
5. Canvas `cadTextCanvasPaint`: when `plotView` is false, colors with contrast &lt; 3 against `#0a0e14` are lifted toward white. Plot leaves packed RGB alone. Opacity (`globalAlpha`) is the same in both modes.
6. `map_plot_lineweight` changes segment stroke weight in Plot, including GPU text polylines (`TEXT_LW` 13 then plot map inside `seg_world`). Canvas SHX/TTF width is screen pixels, not CTB weight.
7. Parity guard `tests/unit/external-storage/cad-normal-plot-text-parity.test.ts` expects equal text totals, `onlyNormal = 0`, `onlyPlot = 0`, `gpuMarkedNormal = 0` on 3096-EL via `docs/audits/local-tool-artifacts/cad-audit/p-text-normal-plot.mjs`.

Wipeout fill (`0xffffff` vs `0xf8f8f8`) is plot-sensitive and is not text.

## Font bytes

1. WASM `init_font_catalog` + `bump_fonts_for_style` → `report.fonts`. `text_style_table_json` → `textStyleTable`.
2. `font-resolver.ts` `cadFontNamesFromScene` unions `report.fonts` keys with table `font` and `big` (not `ttf`, not entity style strings).
3. `resolveCadFontsFromStorage` looks up storage index (`lookupFontAcrossSearchPaths`, host folder + XREF folders) and `hit.getBytes()`.
4. `pf-dwg-viewer.tsx` then `clearCadShxFonts` → `registerCadShxFonts` (`parseShxFont` / `parseShxBigfontFile`) → `registerCadShxStyleTable` → `registerCadShxTextStyleAliases` → `registerCadShxEntityStylePrefixBindings`.
5. Draw/GPU SHX uses `resolveShxDrawContext` / `lookupShxFont`. TTF overlay uses `registerCadOverlayFonts` (`cad-dynamic-font-faces.ts`).
6. Worker deps are DWG XREFs only.

## WASM version and copy

- Manifest: `public/pf-cad/wasm/version.json` → `"engineCommitSha": "2d17b6a"`.
- Copy script: `scripts/copy-pf-cad-wasm.mjs` (source `projectflow-cad-engine/apps/viewer/public/wasm`, or `PF_CAD_ENGINE_ROOT`). Writes `version.json` from `git rev-parse HEAD` in the engine repo. The committed value is the short sha `2d17b6a`.
- Build wrapper (do not run for this task): `scripts/build-pf-cad-wasm.ps1`.

`lib.rs` already `mod hebrew_shx` and `mod gpu_text_emit`. Neither is `pub use`’d. C exports used by the worker: `set_plot_mode`, `set_plot_ctb`, `set_p8_gpu_text_handoff`, `build_dl`, `json_ptr` / `json_len`.

`hebrew_shx.rs` `maybe_decode_hebrew_shx_text` is unused by emit and by `shape_string_for_gpu`. Hebrew decode is TypeScript-only.

## GPU vs canvas handoff

- `state::P8_GPU_TEXT_HANDOFF` defaults false; worker sets it from `P8_GPU_TEXT_HANDOFF_ENABLED` (`true`).
- `style_uses_shx_font_file`: style name or table `font_file` / `big_font_file` ending in `.shx` → GPU push returns false (canvas/SHX owns glyphs).
- Non-SHX: `pf_fonts::place` / `layout_mtext_with`. `gpu: true` only if `shaped_record_complete` / `mtext_record_complete` and at least one stroke was appended.
- Client SHX: `appendShxGpuSegments` may set `gpu` after `mayMarkTextGpu`. `shxTextRequiresCanvasFallback` forces canvas when raw or decoded text has a Hebrew block.
- `shouldDrawTextOnCanvas`: Hebrew fallback or missing `gpu` → canvas; `gpu: true` with handoff on → skip canvas (no double draw).

## Regression guards already present

### ARGB opacity

- Pack: `color.rs` `pack_display_color` stores opacity in the high byte (`pack_display_color_carries_opacity_in_high_byte`).
- Read: `segment-format.ts` `colorBitsToRgba01` — high byte `0` means opaque `1` (legacy RGB with no alpha). Non-zero high byte is `a/255`.
- Canvas: `cadTextCanvasPaint` uses that alpha as `globalAlpha` and builds `#rrggbb` from the low 24 bits only.
- Guard: `cad-text-regression-guards.test.ts` — packed yellow `(255<<24)|0xffff00` must be `#ffff00` at alpha 1, not `#ffffff00`. Same for opaque white.

### `bx` / `by` scale

- WASM emits JSON booleans, not scales (`gen_flags_json`).
- `mirrorScale`: `true` → −1; `false`, omitted, and numeric `1` → 1. Other finite non-zero numbers pass through.
- Applied in `draw-cad-text.ts` `applyTextMatrix` and `shx-text-segments.ts` `layoutShxText` before width/oblique.
- Guards: `cad-text-regression-guards.test.ts` (`mirrorScale(true|false|1)`), `cad-text-anchor.test.ts`, `cad-shx-glyph-coverage.test.ts` (segment X flip). History: `docs/audits/CAD_TEXT_REGRESSION_FIX_2026-10.md` (boolean coerced to 0 scale hid every label).

### Double mirror

- JSON `bx` uses `effective_backwards_mirror`: generation bit 2, then XOR when `det(xf) < 0` so a mirrored INSERT is not flipped twice on the canvas. Unit test `text_emit.rs` `toggles_backwards_on_negative_determinant_insert`. `by` is bit 4 only (no det XOR).
- GPU `push_text_gpu` / `push_attrib_gpu` set `TextParams.backwards` from the raw generation bit and do **not** call `effective_backwards_mirror`. Position is already `xf.apply`. SHX styles skip this path. If C later shapes SHX in WASM, it must use `effective_backwards_mirror` or glyphs inside mirrored blocks will flip twice relative to canvas.
- Canvas and GPU do not both draw the same record when `gpu: true` (`shouldDrawTextOnCanvas` returns false).
