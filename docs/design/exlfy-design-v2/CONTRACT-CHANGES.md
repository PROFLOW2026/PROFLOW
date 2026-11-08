# CONTRACT-CHANGES — EXLFY Design V2

Base SHA: `93e827c4cfb368c9f81b44465bf3cb6720113649`
Branch: `design/exlfy-v2`
The Owner waived the audit Freeze. This branch does not wait on another project.

## Locked visuals

- V1 Premium primary is mineral teal (`#0b665f` / `#36b8a8`), not graphite.
- V2 Premium rail is light in Light and the defined dark rail in Dark.
- V3 Modern active nav is a 3px inline-start bar plus tint. Tabs and date-range chips use an underline.
- V4 Premium KPI cards stay separate.
- FAB geometry is unchanged. Classic token selectors also match `[data-pf-quick-create='fab']`.

## Extra inert marker

`data-pf-kpi-value` was not added. KPI value size targets `.text-lg`, `.text-2xl`, and `.text-3xl` inside `[data-pf-slot='kpi-card']`.

Employee project hub cards stay cards. They are not tab bars.

## Out of this commit

Raw-palette codemod of leak files is not applied. Classic Proof P2/P4 must show an unchanged Classic display before that swap. Route-wide Playwright gates need the isolated PGlite harness and are not a production database run.