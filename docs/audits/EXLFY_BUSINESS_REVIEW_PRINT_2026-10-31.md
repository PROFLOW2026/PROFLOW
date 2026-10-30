# EXLFY — Business review print, period picker, Info (2026-10-31)

**Dashboard:** not touched.

## Print / PDF (full data)

Uses `renderReportHtmlDocument` + `ReportPrintButton` (iframe print), not screen capture.

| Report | Route |
|--------|--------|
| Business overview | `/financials/overview` |
| Recognized cost breakdown | `/financials/overview/recognized` |
| Cash paid breakdown | `/financials/overview/cash-paid` |
| Business profitability | `/financials/business-profitability` |

Payloads include org name, period (where applicable), KPI rows, methodology notices, and **all** detail lines from server data.

## Period picker

`DateRangeGetForm` + `DateRangeSelector.onRangeCommit`: week/month/year submit immediately; custom range uses inline apply when both dates set. Drill links preserve `fromDate`/`toDate`.

## Info deduplication

Breakdown pages: single PageHeader (i) with merged hints; removed floating and card duplicate infos. Business profitability: page-level infos merged into PageHeader; section-level (billing/forecast) and per-KPI infos kept.

## Mobile detail

Recognized and cash paid: `ResponsiveTable` card layout below `lg`, bottom padding for FAB/nav.
