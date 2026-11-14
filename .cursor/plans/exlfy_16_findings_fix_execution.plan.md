---
name: EXLFY 16 findings fix execution
overview: "EXECUTING (Owner approved code fixes). Parallel waves: payroll 001/002/010, PDF 003, UI 004/005, authz 011/013, shell 012/014, schema 007/008, goals 009/015/016. No Prod SQL/Push/Deploy until separate approval after final report."
todos:
  - id: bug001-owner-decisions
    content: "Owner decisions: (1) open-month owner accrual policy (2) approve repair of Eran Oct via recompute supersede not in-place UPDATE (3) month-boundary job for past estimated accruals including company_only"
    status: pending
  - id: bug001-repair-eran-oct
    content: "After approval: recomputeMonthlyEmployeeCostForOpenMonth Eran 2026-10 only; verify known/expected/labor_company_only=33000; preserve Jan–Sep actuals"
    status: pending
  - id: bug001-prevent-stale
    content: "Add month-boundary or daily roll-forward for past-month estimated accruals; include owner company_only outside project-freshness path"
    status: pending
  - id: bug002-repro-applied-shape
    content: "Optional focused repro: audit-only seed EMC status=applied + company_only run; or Owner one-shot Prod digest on Eran Oct deep-link"
    status: pending
  - id: bug002-fix-immutability-path
    content: "BUG-002: replace in-place updateAppliedEmployeeMonthCostAmounts with supersede/adjustment path; split payroll confirm CTA from month-cost correction"
    status: pending
  - id: bug010-error-surfaces
    content: "BUG-010: stop masking employee/time errors as notFound/generic; map AppError on workforce surfaces"
    status: pending
  - id: bug011-live-share-authz
    content: "BUG-011: enforce document need for internal Live Share host entry points"
    status: pending
  - id: bug003-pdf-pan
    content: "BUG-003: PdfJsViewer pan after zoom aligned with ZoomablePreviewImage; touch/desktop checks"
    status: pending
  - id: bug005-fab-hide
    content: "BUG-005: wire isFocusedComposerPath (or equivalent) to hide FAB on composer routes"
    status: pending
  - id: bug013-012-014-007
    content: "BUG-013 BOQ assert; BUG-012 multi-org counts; BUG-014 search allSettled; BUG-007 Drizzle schema TS for 0200 tables"
    status: pending
  - id: bug008-fk-migration-prepare
    content: "BUG-008: prepare composite FK migration only; stop for separate Owner SQL approval before apply"
    status: pending
  - id: polish-004-016-009-015
    content: "BUG-004 money display; BUG-016 Today lens label; BUG-009/015 goals policy per Owner decision"
    status: pending
  - id: predeploy-targeted-checks
    content: "Targeted tsc/eslint/unit/Playwright for touched paths only; no full CI sweep unless Owner asks"
    status: pending
isProject: true
---

# EXLFY — תוכנית ביצוע תיקונים (16 ממצאים)

**סטטוס:** **בביצוע** — Owner אישר תיקוני קוד מקומיים. סוכנים מקבילים רצים. אין Prod SQL/Push/Deploy.

**דוחות:**  
- [`docs/audits/EXLFY_FULL_REGRESSION_AUDIT_2026-11.md`](../../docs/audits/EXLFY_FULL_REGRESSION_AUDIT_2026-11.md)  
- [`docs/audits/evidence/exlfy-full-regression-2026-11/bug-01/IMPACT_AND_RECOMPUTE_ROOT_CAUSE.md`](../../docs/audits/evidence/exlfy-full-regression-2026-11/bug-01/IMPACT_AND_RECOMPUTE_ROOT_CAUSE.md)

## BUG-001 — סיכום כספי (מוכח)

| | |
|--|--|
| פער כולל לחודשים עברו | **₪7,857.14** |
| היקף | **1 עובד × 1 חודש** (ערן · 2026-10) |
| מושפע | EMC, company_only, payroll expected, general_cost `labor_company_only`, תחזית תזרים |
| לא מושפע | רווחיות פרויקט של ערן (0 הקצאה), מזומן ששולם, actuals ינו׳–ספט׳ |

**תיקון בטוח:** `recomputeMonthlyEmployeeCostForOpenMonth` (supersede) — לא UPDATE in-place.  
**מניעה:** roll-forward לגבול חודש + הכללת company_only.

## סדר גלים (אחרי אישור)

1. **דחוף:** BUG-002 (+010) → BUG-001 (החלטות+repair+prevention) → BUG-011  
2. **חשוב:** 003, 005, 013, 012, 014, 007, 008  
3. **שיפורים:** 004, 016, 009/015 · 006 = משמעת פריסה

## החלטות Owner

1. מדיניות צבירת בעלים בחודש פתוח  
2. אישור תיקון ערן אוק׳ דרך recompute  
3. Job מניעת stale  
4. BUG-002 correction path  
5. Live Share document  
6. Goals parity  
7. SQL/Push/Deploy בנפרד
