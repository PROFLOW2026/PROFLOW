# Israel Construction Material Price Data — Feasibility Report

**Research only** · No product built · No ProjectFlow changes · No paid data  
**Generated:** 2026-09-26

---

## 1. Business question

Can we eventually build **market trend monitoring**, **price pressure indicators**, **historical price indices**, and **30/60/90-day forecast research** across Israeli construction trades using **free public data**?

**Answer:** **Partially yes today** for **market pressure and index tracking**; **not yet** for reliable multi-trade **supplier-level buy/wait forecasting**.

---

## 2. Three data layers (keep separate)

| Layer | What it is | V1 viability |
|-------|------------|--------------|
| **A. Product prices** | Supplier SKU/unit lists, invoices | Sparse publicly; strong for Pexgol; internal ERCO invoices |
| **B. Commodity drivers** | Copper, FX, scrap, oil | Excellent via FRED + BOI |
| **C. Government indices** | CBS construction input sub-indices | Excellent via free API |

---

## 3. Trade feasibility matrix

| Trade | Score /25 | Tier | Buildable level |
|-------|-----------|------|-----------------|
| STEEL/REBAR | **18** | GOOD | LEVEL 2 — historical index + pressure |
| PLUMBING | **17** | GOOD | LEVEL 3 — supplier PDF index possible |
| ELECTRICAL | **16** | GOOD | LEVEL 3 — CBS + invoices + drivers |
| CONCRETE/CEMENT | **14** | PARTIAL | LEVEL 2 |
| ALUMINIUM | **13** | PARTIAL | LEVEL 1 — pressure only |
| BLOCKS/MASONRY | **11** | PARTIAL | LEVEL 2 — CBS only |
| GYPSUM/INSULATION | **10** | WEAK | LEVEL 1 |
| WATERPROOFING/CHEMICALS | **8** | WEAK | LEVEL 1 |

Scoring: LOCAL_PRICE (0–5) + HISTORICAL_DEPTH (0–5) + UPDATE_FREQUENCY (0–5) + AUTOMATION (0–5) + EXTERNAL_DRIVERS (0–5).

---

## 4. Final summary by trade

### ELECTRICAL
- **PUBLIC OFFICIAL PRICE LISTS** = PARTIAL (ERCO web current; Meitav-Tec narrow PDF; no broad wire/cable public archive)
- **HISTORICAL DEPTH** = MEDIUM (CBS 201340 conductors; private invoice history)
- **FREE AUTOMATION** = CBS+FRED HIGH; supplier scraping LOW/UNCLEAR
- **BEST LOCAL SOURCE** = CBS 201340 + owner ERCO invoice series
- **BEST EXTERNAL DRIVERS** = Copper, Aluminium, USD/ILS, Brent, CBS electrical group
- **FEASIBILITY SCORE** = **16/25**
- **BUILDABLE LEVEL** = **LEVEL 3** (supplier index only with private invoices; not public)

### PLUMBING
- **PUBLIC OFFICIAL PRICE LISTS** = **YES** (Golan/Pexgol PDF 2022–2025)
- **HISTORICAL DEPTH** = GOOD for residential Pexgol series
- **FREE AUTOMATION** = PDF parse MEDIUM; CBS HIGH
- **BEST LOCAL SOURCE** = Golan official PDF price lists
- **BEST EXTERNAL DRIVERS** = Brent, USD/ILS, polymer proxy, CBS 201380/201400
- **FEASIBILITY SCORE** = **17/25**
- **BUILDABLE LEVEL** = **LEVEL 3**

### ALUMINIUM
- **PUBLIC OFFICIAL PRICE LISTS** = **NO** (Klil/Extal quote-only)
- **HISTORICAL DEPTH** = LOW locally
- **FREE AUTOMATION** = FRED only
- **BEST LOCAL SOURCE** = None public
- **BEST EXTERNAL DRIVERS** = Aluminium USD, FX, energy
- **FEASIBILITY SCORE** = **13/25**
- **BUILDABLE LEVEL** = **LEVEL 1**

### STEEL/REBAR
- **PUBLIC OFFICIAL PRICE LISTS** = **NO** (mills quote-only; PRIKO review is commodity not SKU)
- **HISTORICAL DEPTH** = **HIGH** (CBS 201230)
- **FREE AUTOMATION** = CBS+FRED HIGH
- **BEST LOCAL SOURCE** = CBS rebar index + PRIKO metal review
- **BEST EXTERNAL DRIVERS** = Iron ore, scrap PPI, HRC PPI, USD/ILS
- **FEASIBILITY SCORE** = **18/25**
- **BUILDABLE LEVEL** = **LEVEL 2**

### CONCRETE/CEMENT
- **PUBLIC OFFICIAL PRICE LISTS** = PARTIAL (Readymix 2023/2025; Nesher quote-only)
- **HISTORICAL DEPTH** = MEDIUM (regional catalog + CBS)
- **FREE AUTOMATION** = CBS HIGH; Readymix HTML MEDIUM
- **BEST LOCAL SOURCE** = CBS 201140/201160 + Readymix catalog
- **BEST EXTERNAL DRIVERS** = Energy, CBS cement/concrete indices
- **FEASIBILITY SCORE** = **14/25**
- **BUILDABLE LEVEL** = **LEVEL 2**

### BLOCKS
- **PUBLIC OFFICIAL PRICE LISTS** = NO (Ytong catalog only)
- **HISTORICAL DEPTH** = LOW supplier; CBS 201130
- **FREE AUTOMATION** = CBS MEDIUM
- **BEST LOCAL SOURCE** = CBS ytong/cement products index
- **BEST EXTERNAL DRIVERS** = Cement/energy/CBS general
- **FEASIBILITY SCORE** = **11/25**
- **BUILDABLE LEVEL** = **LEVEL 2** (index only)

### WATERPROOFING/CHEMICALS
- **PUBLIC OFFICIAL PRICE LISTS** = NO
- **HISTORICAL DEPTH** = NONE public
- **FREE AUTOMATION** = LOW
- **BEST LOCAL SOURCE** = None verified
- **BEST EXTERNAL DRIVERS** = Oil/bitumen proxy (weak)
- **FEASIBILITY SCORE** = **8/25**
- **BUILDABLE LEVEL** = **LEVEL 1**

### GYPSUM/INSULATION
- **PUBLIC OFFICIAL PRICE LISTS** = NO
- **HISTORICAL DEPTH** = LOW
- **FREE AUTOMATION** = LOW
- **BEST LOCAL SOURCE** = Knauf SKU catalog (mapping only)
- **BEST EXTERNAL DRIVERS** = Weak proxies
- **FEASIBILITY SCORE** = **10/25**
- **BUILDABLE LEVEL** = **LEVEL 1**

---

## 5. Recommendations

### BEST 3 TRADES TO BUILD FIRST
1. **STEEL/REBAR** — CBS 201230 + FRED scrap/iron ore; best free historical depth
2. **PLUMBING** — Only strong **public official PDF price list series** found (Golan/Pexgol)
3. **ELECTRICAL** — CBS 201340 + commodity drivers; supplement with **private invoice index** if available

### TRADES NOT WORTH BUILDING YET
- Waterproofing/chemicals
- Gypsum/insulation
- Aluminium at **product/SKU** level (commodity pressure only)

### Totals (this research pass)
| Metric | Count |
|--------|-------|
| Official supplier sources found | **6** (price list or catalog-with-prices) |
| Historical price list series found | **6** document series (sampled versions) |
| Government series catalogued | **14** |
| Free global driver series | **11** |

### CAN WE BUILD A MULTI-TRADE MATERIAL MARKET MONITOR?
**YES** — anchored on **CBS sub-indices + FRED/BOI drivers**, with selective PDF indices (Pexgol, Readymix).

### CAN WE BUILD RELIABLE 30/60/90 FORECASTS TODAY?
**PARTIAL** — commodity/CBS pressure signals possible; **supplier buy/wait not reliable** without denser local price history (prior ERCO backtest: INCONCLUSIVE).

### WHAT EXACTLY IS MISSING?
- Public historical **SKU-level** electrical wire/cable price lists
- Official **steel mill** list prices
- **Continuous archived** supplier lists (most PDFs are current + a few past editions)
- Proof that external rules predict **paid invoice prices** out-of-sample

### RECOMMENDED V1 SCOPE
**Market pressure dashboard only:**
- CBS monthly sub-indices (electrical, plumbing, steel, cement, general)
- FRED copper/aluminium/oil/scrap + BOI USD/ILS
- Optional: Golan Pexgol PDF index parser (manual/semi-automated)
- Optional: internal ERCO invoice family index (private data)
- **No live buy/wait recommendations** until walk-forward supplier validation improves

---

## 6. Outputs

All files in `research/`:
- `material_price_sources.csv` / `.md`
- `official_price_lists.csv`
- `government_indices.csv`
- `global_driver_sources.csv`
- `trade_feasibility_matrix.csv`
- `material_data_feasibility_report.json`
