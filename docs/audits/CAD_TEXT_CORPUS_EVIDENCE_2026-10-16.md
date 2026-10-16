# CAD text corpus evidence — 2026-10-16

Model-space scene JSON for `3096-EL`, `3031-SW`, and `3621-EL`. This file records stored strings and style-table fields. It does not record pixels.

## Source

Read-only package `CAD_FULL_DIAGNOSTIC_PACKAGE/07_TEXT_AND_SCENE_JSON/`, `index.json` `generatedAt` `2026-10-16T13:07:22.598Z`.

Files used:

- `3096-EL/model-normal.json`, `3096-EL/model-plot.json`
- `3031-SW/model-normal.json`, `3031-SW/model-plot.json`
- `3621-EL/model-normal.json`, `3621-EL/model-plot.json`

The dump script `dump-scene-diagnostics.mjs` was not re-run. Re-running it writes scene files into the package. The existing JSON is the packaged WASM output with `set_p8_gpu_text_handoff(1)`, xref DWGs attached where the package has them, and no SHX/TTF bytes loaded. `textGpuJson` is null. `gpu` is a boolean on some `texts[]` records. `scene.gpuTexts` matches the `gpu: true` count.

`tmp-3096-el/` in the ProjectFlow repo exists and is empty. No scene JSON was taken from there.

Primary counts below are `*Model_Space`. Paper-space files are a separate note. They repeat model text through layouts, so they are not added into the model totals.

`textStyleTable` rows have `name`, `font`, and sometimes `ttf`. No row has `big` or `bigfont`. Bigfont was not measurable because the field is absent.

## Family counts (model space)

A record can sit in more than one row when the row says so. Mojibake means: at least one character reverses to a CP862 Hebrew letter byte (`0x80`–`0x9A`), either as a Windows-1252 character or as a leftover C1 control (`U+0080`–`U+009F`).

| Family | 3096-EL | 3031-SW | 3621-EL |
| --- | ---: | ---: | ---: |
| Text records | 3,266 | 6,078 | 3,919 |
| CP1252-of-CP862 mojibake | 374 | 0 | 0 |
| Mojibake that contains U+02DC, U+2026, U+2030, or U+2122 | 275 | 0 | 0 |
| C1 controls U+0080–U+009F (subset of the 3096 mojibake path) | 219 | 0 | 0 |
| U+FFFD, U+25A0, U+25A1, U+25AF | 0 | 0 | 0 |
| Unicode Hebrew with no mojibake bytes | 439 | 0 | 1,235 |
| `gpu: true` | 1,756 | 137 | 3,778 |
| `gpu: true` and mojibake | 141 | 0 | 0 |
| Empty `t` | 293 | 48 | 0 |
| `bx: true` | 230 | 1,924 | 69 |
| `by: true` | 0 | 0 | 0 |
| Latin letters with `bx` or `by`, no Hebrew, no mojibake | 230 | 1,669 | 69 |
| Digit-only strings with `bx: true` | 0 | 255 | 0 |

Plot versus normal, index-aligned: `t`, `style`, `gpu`, `bx`, `by`, `r`, `wf`, `h`, `obl`, `x`, and `y` differ on **0** records in all three drawings. Packed color `c` differs on 3,203 / 3,266 (3096-EL), 6,078 / 6,078 (3031-SW), and 3,576 / 3,919 (3621-EL).

## Family 1 — squares / missing glyphs

Not measured on screen. The JSON has no `glyphStatus` and zero U+FFFD.

What the JSON does show on 3096-EL:

- **219** strings contain a C1 control. Those code points are the usual on-screen boxes when a Unicode font draws them. Style split: `TRHEBTXT` 74, `HEBTEXT` 68, `HANIT_TEXT` 44, `HEBTXT` 29, `CAES-L` 2, `HEB` 2.
- `TRHEBTXT` (813), `HANIT_TEXT` (228), `HEBTEXT` (116), `HEBTXT` (88), and `CAES-L` (2) are **not** rows in `textStyleTable`, so there is no font file and no bigfont for them. `TRHEBTXT` has `gpu: false` on all 813 records.
- `HEB` is in the table as `HEB.shx` (2 records, both mojibake).

3031-SW and 3621-EL have no C1 controls and no U+FFFD. A missing `sivan_m.shx` file can still draw Latin letters or empty SHX cells; that outcome is not in the JSON. The dump did not load customer SHX bytes.

## Family 2 — damaged Hebrew (CP1252-of-CP862)

Only 3096-EL. **374** records. Signature characters U+02DC U+2026 U+2030 U+2122 are present on **275** of them. Suspected encoding: CP862 Hebrew bytes interpreted as Windows-1252, with some bytes left as Latin-1 C1 controls (for example U+008E is CP862 mem, not the CP1252 `Ž`).

| Style | Records | Mojibake | Signature present | Font file in table | gpu true (style) | gpu true and mojibake |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| TRHEBTXT | 813 | 160 | 115 | none | 0 | 0 |
| HANIT_TEXT | 228 | 108 | 65 | none | 157 | 108 |
| HEBTEXT | 116 | 71 | 66 | none | 0 | 0 |
| HEBTXT | 88 | 31 | 26 | none | 52 | 31 |
| CAES-L | 2 | 2 | 2 | none | 2 | 2 |
| HEB | 2 | 2 | 1 | HEB.shx | 0 | 0 |

`bx` / `by` are false on these mojibake samples. `wf` is 1 except HANIT, where `wf` is `0.9999999999999999`. Rotation on the samples below is 0.

Examples (source `t`, then CP862 reading of those bytes; the reading is often visual order, rightmost letter first):

1. Style `TRHEBTXT`, `gpu: false`, `bx: false`, `by: false`, `r: 0`, `wf: 1`, no font row.  
   Source: U+02DC U+2026 U+008E U+2030 U+2122 (`˜…` + C1 + `‰™`).  
   Signature present. CP862 reading: רומיש (bytes of שימור stored visually).

2. Style `TRHEBTXT`, same flags.  
   Source: U+008D U+2026 U+2014 U+2030 U+008E.  
   Signature present (U+2026, U+2030). CP862 reading: םוקימ (bytes of מקום stored visually).

3. Style `HEBTEXT`, `gpu: false`, `bx: false`, `wf: 1`, no font row.  
   Source: U+201E U+0192 U+2030 U+008E U+0020 U+201E U+0090 U+2014.  
   Signature present (U+2030). CP862 reading: הדימ הנק (bytes of קנה מידה stored visually).  
   A second `HEBTEXT` sample is U+02DC U+02C6 U+008E. Signature present (U+02DC). CP862 reading: רטמ (bytes of מטר).

`TRHEBTXT` also has **185** empty strings and **468** other non-mojibake strings: **446** numeric ASCII such as `(55.79)`, `(57.44)`, `3.68`, and **21** short Latin tokens such as `2G`, `3G`. Those numbers are not mirrored (`bx: false`, `wf: 1`). They are not evidence of a width-factor bug. They are evidence that a Hebrew style name with no table font still carries plain ASCII numerals.

3031-SW and 3621-EL have **0** mojibake records. Their Hebrew, where present, is already Unicode (family 5).

## Family 3 — mirrored English on style S (`sivan_m.shx`)

Style `S` is a table row in all three drawings: `font: "sivan_m.shx"`, no `ttf`, no bigfont. `sivan_m.shx` is not `txt`, `simplex`, or `romans`.

| Drawing | Style S records | `bx: true` | Latin letters and `bx` | gpu |
| --- | ---: | ---: | ---: | ---: |
| 3096-EL | 207 | 207 | 207 | 0 |
| 3031-SW | 1,928 | 1,924 | 1,669 | 0 |
| 3621-EL | 69 | 69 | 69 | 0 |

Known lead check: 3031-SW style `S` is **1,928**. `bx: true` on that drawing is **1,924**, and all 1,924 are style `S`. The other four style `S` records are the string `f` with `bx: false`, `wf: 1`.

Stored text is ASCII keyboard Latin, not Unicode Hebrew and not CP1252 mojibake. `by: false`. Width factor is often 0.7 or 0.8. Rotation is often about `2π` (a full turn) or `π/2`.

Examples:

1. 3031-SW `t: "ndi"`, style `S`, font `sivan_m.shx`, `bx: true`, `by: false`, `r: 6.283185297245176`, `wf: 0.7`, `gpu: false`. Same shape: `"n,j"`, `"h,r"`.
2. 3096-EL `t: "trui"`, style `S`, font `sivan_m.shx`, `bx: true`, `by: false`, `r: 6.283185297245143`, `wf: 0.8`, `gpu: false`. Same shape: `"cze"`, `"rtah"`.
3. 3621-EL `t: "s/t"`, style `S`, font `sivan_m.shx`, `bx: true`, `by: false`, `r: 1.5707963267948966`, `wf: 0.8`, `gpu: false`. Also `"ngcr"` with `wf: 0.8` and `r` about `2π`.

3096-EL has **23** more mirrored-Latin records outside style S: `HTEXT` 17 (`htxt`, `bx: true`, `gpu: true`) and `TECHNO_M` 6 (`techno_m`, `bx: true`, `gpu: true`).

If a viewer treats style `S` as a Latin SHX, these strings draw as mirrored English. The JSON does not show that drawing. It shows the mirror flag and the Hebrew SHX file name together.

## Family 4 — mirrored / width-changed numbers

3031-SW style `S`: **255** digit-only strings, all with `bx: true`. They are the 1,924 mirrored style-S records that are not Latin letters (1,669 + 255). Unique samples include `0`, `321`, `011`, `012`, `013`, `421`, `032`. Font `sivan_m.shx`. `gpu: false`. Width factor on style S overall: `wf 0.7` × 1,272, `wf 1` × 486, `wf 1.2` × 154, `wf 0.8` × 14, `wf 0.9` × 2. One captured digit sample is `t: "0"`, `bx: true`, `r: 6.283185297245477`, `wf: 0.7`, `h: 8`.

Style `R` on 3031-SW is `TXT.shx`, **4,013** records, `bx: false`, `gpu: false`. **580** of its numeric strings have `wf` away from 1. Style R widths overall are `0.700` × 3,693, `0.800` × 254, `0.900` × 66. Those widths are identical in the plot dump. They are stored width factors on a Latin SHX, not a normal-versus-plot change.

3096-EL numeric `wf` away from 1: **23** records (examples `140/120/50` on Standard/`arial.ttf` `wf: 0.8`; `24` on `TXT` `wf: 0.7`; `+2.10` on `R`/`TXT.shx`). `bx: false`. Not classified as mojibake.

3621-EL: **0** digit-only mirrored records and **0** numeric records with `wf` more than 0.02 away from 1. Style S itself uses `wf: 0.8` on letter strings such as `s/t` and `ngcr`.

No oblique (`obl`) on numeric strings in any of the three model dumps.

## Family 5 — Unicode Hebrew already in the string

3096-EL: **439** strings with Hebrew letters and no CP862 mojibake bytes. **437** of them are `gpu: true`. They sit on `Arial_*` and `Standard` (`arial.ttf`), not on `TRHEBTXT`. The one Hebrew-containing `TRHEBTXT` string is the mixed mojibake record in family 2 (`ם י צ ע` plus CP1252 bytes). `HEBTEXT` has 2 clean Hebrew records, `gpu: false`.

3621-EL: **1,235** Hebrew strings, **all** `gpu: true`, **0** mojibake. Styles are `Arial`, `Arial_*`, `Arial_B*`, `Assistant SemiBold`, and `Standard`. Example: `t: "דוד"`, style `Arial`, font `arial.ttf`, `bx: false`, `r: -0.19941373749034527`, `wf: 1`, `gpu: true`.

3031-SW: **0** Unicode Hebrew in model space.

`gpu: true` on these Unicode strings is not evidence that glyphs painted. Customer fonts were not loaded. Arial rows name `arial.ttf`. Whether those glyphs are missing on screen was not measured.

## Family 6 — `gpu: true` on damaged text

3096-EL **141** records are `gpu: true` and mojibake:

- `HANIT_TEXT` 108
- `HEBTXT` 31
- `CAES-L` 2

Example: `t` is U+201A U+201A `.` U+201A (`‚‚.‚`), style `HANIT_TEXT`, no font row, `bx: false`, `by: false`, `r: 0`, `wf` about 1, `gpu: true`, `h: 40`. CP862 reading of the three U+201A characters is גג.ג. Signature quartet is absent on this string; the bytes are still CP1252-of-CP862 (U+201A is Windows-1252 for `0x82`).

`TRHEBTXT` mojibake is **not** marked `gpu: true`.

The dumps have no `glyphStatus` field. The contract fixture in `tests/unit/external-storage/cad-text-corpus-evidence.test.ts` pairs `gpu: true` with U+FFFD and `glyphStatus: "MISSING"` because the scene JSON never stored that field. The product must not treat that pair, or the captured HANIT `gpu: true` mojibake, as glyph success.

## Family 7 — normal versus plot

Non-color text fields match, as counted above.

Color-only changes:

- 3096-EL: 3,203 texts. The dump job had `electric color 50.ctb`.
- 3621-EL: 3,576 texts. The dump job had `electric black 50.ctb`.
- 3031-SW: all 6,078 texts, and the dump job had **no** CTB (`ctb: null`). Example pairs: `4294967040 → 4293783021` (2,809), `4294902015 → 4282992969` (2,506), `4278190335 → 4279374354` (465). Strings did not change.

Whether those plotted colors are the wrong colors was not measured. No screenshot and no AutoCAD plot compare.

## Paper space (not added to the totals)

| File | Texts | TRHEBTXT | Style S | Signature quartet | `bx: true` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3096-EL `*Paper_Space` | 5,700 | 1,626 | 93 | 548 | 143 |
| 3096-EL `*Paper_Space3` | 9,869 | 2,439 | 622 | 825 | 695 |
| 3031-SW `*Paper_Space` | 6,149 | 0 | 1,929 | 0 | 1,929 |
| 3621-EL `*Paper_Space` | 3,985 | 0 | 70 | 0 | 74 |

These are higher than model space where layouts repeat entities. They were not classified record by record.

## What was not measured

- On-screen squares, mirrored Latin, damaged Hebrew, or distorted digit outlines. No browser, no raster.
- Whether loading real `sivan_m.shx`, `HEBTXT.SHX`, `HEB.shx`, or `MIRYL` would change `t` or `gpu`. Those files are not in the package.
- `glyphStatus`. It is not in the JSON.
- Bigfont. The key is absent.
- Byte equality with an AutoCAD plot.
- A fresh WASM parse. The packaged JSON from 13:07 UTC was used as-is.
- `tmp-3096-el/` (empty).
- Full classification of every paper-space record.
- Which of the 3031-SW plot colors are wrong, given that the dump applied no CTB and still recolored every text.
