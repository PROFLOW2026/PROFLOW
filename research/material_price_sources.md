# Israel Construction Material Price Data — Source Inventory

**Mode:** Research only · **Generated:** 2026-09-26  
**Scope:** Free, public, preferably official sources · No paid data · No scraping beyond discovery sampling

---

## Executive finding

Israel has a **strong free government index layer** (CBS monthly API with trade-specific sub-indices) and **excellent free global commodity drivers** (FRED, Bank of Israel). **Supplier-level public price lists are the bottleneck**: they exist for some trades (notably **plumbing/Pexgol**, **partial concrete/Readymix**) but are **missing or quote-only** for aluminium, waterproofing, gypsum, and most steel/electrical wire pricing.

**Do not confuse:**
- **A. Product price data** — supplier/manufacturer unit prices (SKU lists, invoices)
- **B. Commodity/driver data** — copper, FX, scrap, oil (FRED/BOI)
- **C. Government indices** — CBS construction input sub-indices (trend, not unit price)

---

## Source summary by category

| Category | Verdict | Best examples |
|----------|---------|---------------|
| Government indices | **EXCELLENT** | CBS 200010, 201230 rebar, 201340 conductors, 201380 plumbing |
| Global drivers | **EXCELLENT** | FRED copper/aluminium/oil/scrap; BOI USD/ILS SDMX |
| Official supplier price lists | **SPARSE** | Golan/Pexgol PDFs; Readymix catalog; Meitav-Tec (narrow) |
| Catalog without prices | **COMMON** | Klil, Extal, Knauf, Gilar/Sika, Plasson, Nesher, Ytong |
| Quote-only / paid | **COMMON** | Steel mills, Dekel (paid), most aluminium fabricators |

---

## Notable sources (sampled)

### ELECTRICAL
- **ERCO** — B2C web prices with SKU (current only); PDF catalogs are technical, not price lists
- **Meitav-Tec** — Official 2024 PDF price list (HVAC controls only)
- **CBS 201320/201330/201340** — Monthly electrical sub-indices via free API
- **Owner ERCO invoices** — Private purchase history (not a public feed; useful internally)

### PLUMBING
- **Golan/Pexgol** — Official PDF price lists; **2022, 2024, 2025** versions found on public URLs
- **Palgal** — Archived 2012 PDF; current list not verified
- **Plasson** — Product PDFs, no prices
- **CBS 201380/201400** — Plumbing and plastic pipe indices

### STEEL / REBAR
- **No public mill price list** verified
- **CBS 201230/201260/201210** — Strong monthly history
- **PRIKO (industry.org.il)** — Monthly metal commodity review PDF (not SKU list)

### CONCRETE / CEMENT
- **Readymix (CEMEX Israel)** — Public 2023 & 2025 web catalogs with regional transport pricing
- **Nesher** — Product specs; quote-only
- **CBS 201140/201160** — Cement and ready-mix indices

### ALUMINIUM
- **Klil / Extal** — Technical catalogs only; **no public price lists verified**

### BLOCKS
- **Ytong** — Catalog/specs; no official public price list
- **CBS 201130** — Ytong/cement products index

### WATERPROOFING / GYPSUM
- **Gilar (Sika Israel)** — 2026 catalog, no prices
- **Knauf** — SKU catalog PDF, no public prices

---

## Historical discovery notes

Search patterns used (Hebrew + English):
- `site:golanisrael.com מחירון filetype:pdf`
- `site:readymix.co.il catalogs`
- `site:erco.co.il מחירון`
- `site:meitavtec.co.il מחירון`
- CBS API verification for series 201340, 201230

**Confirmed historical continuity (sampled, not bulk-downloaded):**
- Golan residential: **Mar-2022 → Jan-2024**
- Readymix catalog: **2023 → 2025**
- Palgal: **2012** archive only

---

## Legal / practical access (non-legal advice)

| Source | Classification |
|--------|------------------|
| CBS API, FRED, BOI SDMX | PUBLIC_FREE |
| Golan/Readymix/Meitav public PDFs | PUBLIC_FREE |
| ERCO web shop automation | UNCLEAR — terms not reviewed |
| CivilEng / architect reference tables | PUBLIC_WITH_USAGE_LIMITS |
| PRIKO industry review | PUBLIC_WITH_USAGE_LIMITS |
| Dekel price book | PAID_LICENSE — excluded from V1 |

---

## Machine-readable outputs

- `material_price_sources.csv` — full source registry
- `official_price_lists.csv` — confirmed price list documents
- `government_indices.csv` — CBS series
- `global_driver_sources.csv` — FRED/BOI drivers
- `trade_feasibility_matrix.csv` — scored trades
- `material_data_feasibility_report.json` — structured summary
