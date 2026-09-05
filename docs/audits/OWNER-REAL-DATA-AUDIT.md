# PROJECTFLOW OWNER REAL-DATA AUDIT = COMPLETE

**Owner:** 18eran@gmail.com  
**Organization:** מתח ח.י הנדסת חשמל בע"מ  
**Production SHA:** `7407311d6216b876586d2c358bb434b8ae0732cf`  
**DB migration baseline:** 69 applied migrations in `drizzle.__drizzle_migrations` (latest journal id `75`); true-cost schema present (`0069_true_cost_profitability.sql` era).  
**Audit mode:** READ-ONLY (no data mutation, no commit, no push, no deploy, no fix).  
**Evidence dumps (in-repo):** `docs/audits/_owner-audit-*.json`  
**Password:** used only for ephemeral authenticated UI scrape; not stored in code/docs.

---

## 1. OWNER / ORGANIZATION MAP

| Layer | Value |
|-------|--------|
| Auth user | `1abea18f-3d08-44ab-a42a-4509900e6117` — **1 only**, created 2026-08-27 |
| Profile | same id — display **ערן יוסף**, locale `he-IL` |
| Membership | **1** active — org `8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec` |
| Role | **Owner** (rank 1), org-scoped |
| Org members | **1** (owner only) |
| Other orgs for this user | **none** |
| Duplicate auth/profile/membership | **none** |
| Currency / TZ / country | ILS / Asia/Jerusalem / IL |
| Default locale | he-IL |
| Business profile | `ELECTRICAL` |
| Experience complexity | **`simple`** |
| Work mix | `projects` |
| Profitability mode setting | **not set** (defaults apply) |
| Labor defaults | workWeekdays Sun–Thu; **`workingDaysPerMonth: "5"`**; 8h/day; burden via rate versions 15% |
| Branding / company profile | present (org created today with electrical templates) |
| Modules first-used | clients, vendors, workforce, billing, overhead (visited), materials/procurement enabled |
| Month-close module | disabled / unused — **0 closed periods** |
| Project access grants | none (owner sees all) |

**Integrity:** No orphan membership. No second org. No cross-org financial bleed found for this user. Account was created **today** and then loaded with Jan–Aug 2026 history.

---

## 2. WHAT DATA EXISTS

| Domain | Rows | Lifecycle / notes | First–Last | Money (ILS, when relevant) |
|--------|------|-------------------|------------|----------------------------|
| Clients | 3 | active | today | — |
| Client contacts | 0 | — | — | — |
| Projects | 3 | all active | today | contracts 380k / 990k / 470k |
| Work packages | 0 | — | — | — |
| Contracts | 3 | primary | today | Σ original **1,840,000** |
| Change orders | 0 | — | — | — |
| Budgets / BOQ | 0 | — | — | — |
| Employees | 3 | active, monthly | hire Jan/May 2026 | rates 7,500×2 + 6,000; burden 15% |
| Rate versions | 3 | open; **WDM=5** | — | employer ≈ 8,625 / 8,625 / 6,900 |
| Employee month costs | 20 | all **applied**, quality **estimated** | 2026-01…08 | known Σ **165,600** |
| Labor allocation runs/lines | applied; 100% to projects | unallocated labor **0** | — | project labor **165,600** |
| Time entries | 426 approved project | cost_amount **0** (monthly displacement) | — | 3,408 hours |
| Attendance | present | — | — | — |
| Vendors | 17 | — | — | — |
| AP bills | **0** | — | — | — |
| AP payments / credits / allocations | 0 | — | — | — |
| Subcontract agreements | 0 | — | — | — |
| Expenses | 57 | finalized 54, void 3, draft 0 | 2026-01-01…08-27 | finalized net **374,217.58** |
| Expense allocations | 0 | — | — | — |
| Installment schedule lines | yes (8 installment expenses) | scheduled | multi-month | recog thru Aug **27,879.82** of full **40,664.41** |
| Recurring drafts | **0** | — | — | — |
| General cost months | **8** (Jan–Aug) | all **open**, none frozen | — | pool Σ **37,709.20** (fully allocated) |
| GCM sources | expense_unallocated only | — | — | matches stored pools (stale vs live engine — see §15) |
| Inventory items / layers / consume | 0 | — | — | — |
| Assets / fleet | 0 | — | — | — |
| POs / receipts | 0 | — | — | — |
| Billing records | 8 | finalized 7, void 1 | — | finalized subtotal **381,463.50** |
| Customer payments | 8 | — | — | Σ **480,470.50** (includes voided bill amount) |
| Month-close periods/adjustments | 0 | — | — | — |

---

## 3. MONEY I HAVE ACTUALLY ENTERED (עברית פשוטה)

בחשבון נוצרו היום ארגון + נתונים היסטוריים לינואר–אוגוסט 2026.

**לקוחות / פרויקטים / חוזים**
- 3 לקוחות, 3 פרויקטים פעילים.
- חוזים נטו: ברנדייס 380,000 · חורגין 990,000 · פינס 470,000 → **סה״כ 1,840,000 ₪**.

**עובדים**
- 3 עובדים חודשיים עם עלות מעביד (~שכר×1.15).
- המערכת הכירה **165,600 ₪** עלות עבודה דרך Workforce (חודשים 1–8).
- **בנוסף** הוזנו הוצאות בשם «עובדים» על פרויקטים (~200,530 ₪ נטו) — רובן מסווגות כ־**Subcontractor**, לא Labor.

**הוצאות**
- 54 הוצאות סופיות נטו **374,217.58 ₪** (ברוטו ~441,577).
- מתוכן לפרויקט ~318,281 נטו; כלליות ללא פרויקט ~55,937 נטו (לפני פריסת תשלומים).
- יש הוצאות מחולקות לתשלומים (ביטוח, רכב, מחסן, דלק, סלולר וכו').

**ספקים / AP / קבלני משנה כהתחייבות**
- יש ספקים ברשימה, **אין חשבוניות AP**, אין הסכמי קבלנות במודול Subcontracts.
- עלויות «קבלן/ספק» נכנסו כהוצאות (למשל התותחים, חומרים).

**חיובים / תשלומים**
- חויב ללקוח (סופי): **381,463.50 ₪**.
- תשלומים שנרשמו: **480,470.50 ₪** (כולל סכום שקשור לחיוב שבוטל — ראה ממצאים).

**מלאי / ציוד / PO**
- לא הוזן.

---

## 4. COMPANY ACTUAL

Canonical domain identity:

`Company Actual = Σ Direct Project Actual + General Cost Pool`

| Scope | Amount (ILS) | Basis |
|-------|--------------|-------|
| **All-time (correct domain)** | **500,939.20** | Direct **463,230.00** + stored pool **37,709.20** |
| **What UI Reports shows as «עלות בפועל של העסק»** | **463,230.00** | Equals Direct only — **understates by 37,709.20** |
| Current year 2026 | same as all-time (all data is 2026) | |
| Current month Aug 2026 (approx by date+labor+pool) | ~33,361 | labor 24,150 + project expenses by date 6,000 + pool 3,210.79 (installment timing differs) |
| Home «עלויות החודש נטו» | **25,149.15** | **Not** Company Actual — narrower expense monthly KPI |

### Populated months (approx Company Actual by calendar expense date + labor month + stored GCM pool)

| Month | Labor | Project expenses (by date) | GCM pool stored | Approx total |
|-------|-------|----------------------------|-----------------|--------------|
| 2026-01 | 17,250 | 42,004.58 | 3,518.56 | 62,773.14 |
| 2026-02 | 17,250 | 33,674.58 | 5,009.81 | 55,934.39 |
| 2026-03 | 17,250 | 46,649.15 | 4,802.96 | 68,702.11 |
| 2026-04 | 17,250 | 41,617.80 | 1,274.58 | 60,142.38 |
| 2026-05 | 24,150 | 42,186.44 | 4,151.33 | 70,487.77 |
| 2026-06 | 24,150 | 45,771.19 | 4,642.86 | 74,564.05 |
| 2026-07 | 24,150 | 60,377.12 | 11,098.31 | 95,625.43 |
| 2026-08 | 24,150 | 6,000.00 | 3,210.79 | 33,360.79 |

> Month rows above are **date-bucket approximations**. Installments move recognition across months; use all-time domain total as the authoritative Company Actual.

---

## 5. COMPANY ACTUAL BREAKDOWN (no overlap)

Using **engine sources that actually feed Actual** (not cash, not commitments):

| Source | Amount (ILS) | Notes |
|--------|--------------|-------|
| Workforce monthly labor (applied) | 165,600.00 | Project-allocated; unallocated labor 0 |
| Project expenses excl. `labor` category | 297,630.00 | Includes materials, subcontractors, «עובדים» miscategorized as subcontractor, etc. |
| Expense category `labor` excluded (Mode C) | (20,650.85) | «גילוי אש» wrongly keyed as labor — excluded from Actual |
| AP recognized | 0 | |
| Inventory consume / writeoff | 0 | |
| Month-close cost adjustments | 0 | |
| **Σ Direct Project Actual** | **463,230.00** | Matches Reports «עלות בפועל» |
| General pool (stored GCM) | 37,709.20 | All from `expense_unallocated`; fully allocated to projects |
| **Σ Company Actual (correct)** | **500,939.20** | |

**Does not include:** VAT as profit/cost, customer payments, AP payments, POs, remaining inventory stock, recurring drafts (none), commitments.

---

## 6. GENERAL BUSINESS COSTS

| Fact | Value |
|------|-------|
| Raw finalized expenses with null project | 26 rows · **55,936.73** net |
| Engine installment-aware unallocated (Jan–Aug) | **43,152.14** |
| Stored GCM pool (Jan–Aug) | **37,709.20** |
| **Gap stored vs live engine** | **−5,442.95** (pool understates) |
| Allocated to projects | **37,709.20** (100% of stored pool) |
| Unallocatable residual | **0** |
| Still in Company Actual? | Yes, via pool (domain). UI Company Actual currently **drops** it when pool=allocated (wiring bug). |

**Source kinds present:** only `expense_unallocated`.  
**Not present:** labor_monthly_unallocated, labor_non_project, ap_bill_*, inventory_writeoff.

**Examples of general costs entered:** מחסן, דלק, ביטוח רכב, טיפולי רכב/צמיגים, סלולר, מחשוב, רישיון, הזמנות מחול, חנייה, «כללי» ארכה, כלים חשמליים — חלקם בפריסת תשלומים.

**Office employees / non-project time:** none — all labor allocated 100% to projects.

---

## 7. PROJECT-BY-PROJECT ACTUAL

| Project | Contract | Billed | Direct Actual | Allocated General | Full Actual | Direct Profit | Full Profit |
|---------|----------|--------|---------------|-------------------|-------------|---------------|-------------|
| ברנדייס 6 תל אביב | 380,000 | 99,745 | **196,224.07** | 15,972.88 | 212,196.95 | 183,775.93 | 167,803.05 |
| חורגין 36 רמת גן | 990,000 | 96,718.50 | **92,593.64** | 7,538.48 | 100,132.12 | 897,406.36 | 889,867.88 |
| פינס 16 פתח תקוה | 470,000 | 185,000 | **174,412.29** | 14,197.84 | 188,610.13 | 295,587.71 | 281,389.87 |
| **Σ** | **1,840,000** | **381,463.50** | **463,230.00** | **37,709.20** | **500,939.20** | | |

**Direct breakdown (org):**
- Employees (workforce): 165,600
- Expenses after labor-cat exclusion: 297,630 (of which «עובדים» expenses still inside ≈ **200,530**)
- Vendors/AP module: 0
- Materials: inside expenses (~66,300 materials category)
- Inventory: 0

**Reconciliation per project:**  
`expense(ex labor-cat) + workforce labor = Direct` ✓  
`Direct + allocated general = Full` ✓  
`Σ Full = Company Actual (with unallocatable 0)` ✓ on stored pool numbers.

Reports UI profit-by-project matches **Direct** profit (not Full).

---

## 8. LABOR

| Item | Finding |
|------|---------|
| Open month Aug 2026 | `known_amount` = **full month** for all 3 employees (24,150) |
| Why | `working_days_per_month = 5` on every rate version **and** org labor defaults. With W=5, after ~5 workdays the engine correctly recognizes 100% of monthly pool. |
| Code intent | Accrue by working day; do **not** apply full month early — **but W=5 makes “full” happen almost immediately** |
| known_quality | `estimated` for all months |
| Month close | none — all EMC `applied`, months economically mutable |
| Time entries | 426 approved; cost 0; displaced by monthly runs |
| Non-project labor | 0 |
| Double economics | Workforce **165,600** + expense lines «עובדים» **~200,530** both in Actual (expenses not `labor` key) |

**What you see now:** August looks like a finished payroll month because of W=5, not because August calendar ended.

---

## 9. VENDORS / AP

- Vendors exist (17).
- **AP bills = 0** → no AP Actual, no AP remainder, no AP double-count with payments.
- Vendor-like spend is via **Expenses**.

---

## 10. SUBCONTRACTORS

- No `subcontract_agreements`.
- Subcontractor **category expenses** exist (including mislabeled «עובדים»).
- Reports groups ~227,980 under «קבלני משנה וחשבוניות ספק» from expense classification — **not** AP.

---

## 11. MATERIALS / INVENTORY

- Materials via expenses (~66,300 net).
- No FIFO layers / consumptions / opening inventory.
- No inventory stock-purchase flags.

---

## 12. EXPENSES / RECURRING / INSTALLMENTS

- Recurring drafts: **0** (no draft↔expense duplicate).
- Installments: 8 expenses; schedules exist; recognition is month-sliced for General Pool.
- Void: 3 void expenses; reversals present for «כללי» edits — net handled, but list UX is noisy.
- Installment full net still appears on expense list (gross/list UX) while Actual uses schedule — owner can feel “double” visually.

---

## 13. ASSETS / EQUIPMENT

- None financially recognized.

---

## 14. BILLING / PAYMENTS (Revenue/Cash ≠ Cost)

| Metric | Amount | Nature |
|--------|--------|--------|
| Contract value | 1,840,000 | Commercial |
| Billed finalized | 381,463.50 | AR / cash disclosure |
| Paid recorded | 480,470.50 | Cash — **> billed** because void bill 99,007 still has payment sum |
| Outstanding (UI) | 0 | |
| Company Actual | 500,939.20 (correct) / 463,230 (UI) | Cost |

Home shows expected profit **1,376,770** = contract − Direct Actual (not Full; not Company).

---

## 15. RECONCILIATION

### A. Domain identity on **stored** GCM

| Side | Amount |
|------|--------|
| A = Direct + Pool | 463,230.00 + 37,709.20 = **500,939.20** |
| B = Σ Direct | **463,230.00** |
| C = General Pool | **37,709.20** |
| Σ Full + Unallocatable | 500,939.20 + 0 |
| **Difference** | **0.00** on stored numbers |

### B. Live engine unallocated vs stored pool

| | Amount |
|--|--------|
| Engine Σ unallocated expenses (installment-aware) | 43,152.14 |
| Stored GCM expense sources | 37,709.20 |
| **Difference** | **5,442.95** (MISSING from stored pool / Company Actual) |

Cause: historical GCM months remain `open` but surfaces only refresh **current** month (`refreshCurrentOpenGeneralCostMonthForSurfaces`). Installment schedules created later left prior months stale (e.g. Apr pool 1,274.58 vs engine 5,400.42).

### C. UI Company Actual wiring

`composeCompanyActualFromOrgTotals` expects **Full** Project Actual, but home/reports pass **Direct** (`cost.actual`).  
When pool ≈ allocated: displayed Company Actual collapses to Direct → **understates 37,709.20**.

### Exact differences to report

| Check | Difference |
|-------|------------|
| Stored Company identity | **0.00** |
| Stored pool vs live engine unalloc | **5,442.95** understatement |
| UI Company Actual vs correct domain | **37,709.20** understatement |
| Combined “true live Company Actual” if GCM refreshed | ≈ **506,382.15** (463,230 + 43,152.14) |

**RECONCILIATION DIFFERENCE (authoritative stored identity): 0.00**  
**RECONCILIATION DIFFERENCE (live sources vs stored pool): 5,442.95**  
**UI vs correct Company Actual: 37,709.20**

---

## 16. DUPLICATES FOUND

1. **CRITICAL — Labor economics double count:** Workforce monthly Actual **165,600** + expense lines «עובדים» (~**200,530** net) both inside Direct Actual, because expenses are categorized `subcontractor` / uncategorized — **not** excluded by Mode B/C rule (only `key=labor`).
2. **Visual/installment confusion:** installment expenses show full amount on expense list while pool recognizes monthly slices.
3. **Reversal pairs** on «כללי» (create / reverse / recreate) — not double in net finalized math, but noisy.
4. **No** Expense+AP duplicate (AP empty).
5. **No** AP payment as Actual.
6. **No** PO/receiving as Actual.
7. **No** inventory purchase+consume double.
8. **Payment vs void billing:** payments total includes voided billing amount → cash rollup confusion (not Company Actual, but AR/cash integrity).

**DOUBLE COUNT FOUND = 1 critical economic + several UX/noise duplicates**

---

## 17. MISSING COSTS FOUND

1. **GCM stale historical months:** **5,442.95** not in stored pool.
2. **UI omits general pool from Company Actual display:** **37,709.20** (wiring).
3. Reports «הוצאות כלליות שהוקצו לפרויקט» shows **0** while GCM allocations are **37,709.20** (wrong metric / old overhead path).

**MISSING COST FOUND = 3** (1 data freshness, 2 presentation)

---

## 18. WRONG ATTRIBUTIONS FOUND

1. «עובדים» expenses → category **Subcontractor** (should be labor or removed if Workforce is source of truth).
2. «גילוי אש» → category **Labor** (excluded from Actual due to workforce; likely should be other direct / permits).
3. Reports buckets “קבלני משנה” inflated by mislabeled payroll expenses.
4. Home/Reports profit uses Direct, while Full/Company story is incomplete in primary UI.

**WRONG ATTRIBUTION FOUND = 4**

---

## 19. DATA THAT EXISTS BUT IS NOT VISIBLE IN UI

- GCM month sources/allocations (no owner primary screen).
- Installment schedule recognition vs list amount.
- Company Actual correct total (domain exists; primary surfaces wrong/absent).
- `workingDaysPerMonth=5` implication (not explained in UI).
- Mode C exclusion of `labor` category expense («גילוי אש»).
- Full Project Actual vs Direct (advanced only; home profit is Direct-based).

---

## 20. UI THAT SHOWS A NUMBER DIFFERENTLY FROM DB

| UI | Shows | DB/Domain |
|----|-------|-----------|
| Reports «עלות בפועל של העסק» | 463,230 | should be 500,939.20 (stored) / ~506,382 if GCM refreshed |
| Reports «הוצאות כלליות שהוקצו» | 0 | GCM allocations 37,709.20 |
| Reports «הוצאות כלליות שלא הוקצו» | 55,936.73 | raw null-project expenses; not GCM unallocatable (0) / not engine 43,152 |
| Home Company Actual label | **absent** (electrical/simple persona, no forecast card) | domain computable |
| Home «עלויות החודש נטו» | 25,149.15 | not Company Actual |
| Direct Actual | 463,230 | matches engine Direct ✓ |

**UI/DB DIFFERENCE = 5** material mismatches

---

## 21. WHY "TOTAL BUSINESS EXPENSES" IS NOT OBVIOUS TODAY

1. Canonical number exists in code as **Company Actual** (`composeCompanyActual`) = Direct + General Pool.
2. Hebrew product copy closest: **«עלות בפועל של העסק»** — not «סה״כ הוצאות העסק».
3. Home does **not** put it as a hero KPI for this org’s persona (`ELECTRICAL` + `simple`); forecast card gated.
4. Reports shows the label but **computes it wrong** (Direct fed into Full helper) → equals project Actual.
5. Parallel competing totals: expense-layer unallocated (55,936), GCM pool (37,709), Direct (463,230), «סך עלות בפועל» management tile (463,230), monthly costs KPI.
6. Owner must understand Actual / allocation / overhead to interpret — fails the “few seconds” test.

**Recommended product name (recommendation only):**  
**«סה״כ עלויות העסק»** = Company Actual  
**Includes:** finalized/recognized operating costs (labor, expenses, AP recognized, inventory consume/writeoff, month-close cost) — Direct projects + general.  
**Excludes:** VAT-as-profit, payments/cash, PO commitments, stock remaining, drafts, voided.

---

## 22. UX COMPLEXITY FINDINGS

- Nav groups: לוח בקרה / היום / פרויקטים / כסף / דוחות / מתקדם — many money concepts split.
- Home emphasizes contract, billing, expected profit — **not** total business cost.
- Reports is dense: commercial + cash + cost + profitability + PDF packs; technical footnotes.
- Expenses list mixes project direct, shared, overhead, reversals, installments.
- Overhead route exists but module mostly unused; auto GCM is invisible.
- Terminology: בפועל / כלליות / הוקצו / התחייבויות / תחזית appear before owner has a single “what did I spend” answer.
- Experience complexity `simple` still surfaces enough chrome to feel heavy; persona switcher on every page adds noise.

**UX FINDINGS = 12+** (see findings table)

---

## 23. TOP 10 OWNER QUESTIONS THE CURRENT UI CANNOT ANSWER SIMPLY

1. כמה העסק הוציא בסך הכול? (wrong/missing Company Actual)
2. ממה מורכב סה״כ עלויות העסק? (no org source breakdown)
3. כמה הוצאות כלליות באמת נכנסו לעלות? (55,936 vs 37,709 vs 43,152)
4. כמה עלה כל פרויקט כולל כלליות? (Full Actual not primary)
5. כמה באמת עלה לי על עובדים? (Workforce vs «עובדים» expenses conflict)
6. כמה על ספקים/קבלנים בלי לערבב שכר? (bucket polluted)
7. כמה הוצאתי החודש בעלות עסק אמיתית? (home month KPI ≠ Company Actual)
8. כמה הוצאתי השנה? (no clear YTD Company Actual)
9. מה דורש תשומת לב היום מבחינת עלות? (attention ≠ cost integrity)
10. האם המספרים סוגרים עד אגורה? (reconciliation not owner-visible)

---

## 24. RECOMMENDED SIMPLIFIED OWNER INFORMATION ARCHITECTURE

**(Recommendation only — do not implement yet)**

1. **Home hero (Owner):** one number — **סה״כ עלויות העסק** (Company Actual) + period toggle (חודש / שנה / הכל).
2. Under it: 4 plain chips — עובדים · ספקים/קבלנים · חומרים · הוצאות כלליות (mutually exclusive taxonomy).
3. Second row: כמה בפרויקטים / כמה כלליות; drill to projects.
4. Project page: «כמה עלה הפרויקט?» = Full by default; optional “ישיר בלבד”.
5. Hide Direct/Full/Pool/Recognition from primary chrome; keep in Advanced / explainability.
6. Single glossary link — not inline jargon walls.
7. Fix data entry guidance: payroll either Workforce **or** expense — not both; category validation.
8. Money nav: הוצאות (entry) · ספקים (AP when used) · דוח עלויות העסק (read model) — collapse overlapping reports tiles.

---

## 25. FINDINGS TABLE

| ID | Severity | Area | Finding | Evidence | Financial impact | UX impact | Recommended fix |
|----|----------|------|---------|----------|------------------|-----------|-----------------|
| F01 | CRITICAL | Labor / Actual | «עובדים» expenses (~200,530 net) counted in Actual **plus** workforce 165,600 | DB categories=`subcontractor`/null; UI Direct 463,230 | ~**+200,530** inflated Direct/Company | Owner cannot know true payroll cost | Choose one source; recategorize/exclude; UI warning |
| F02 | CRITICAL | Company Actual UI | Home/Reports pass Direct into helper expecting Full → Company Actual = Direct when fully allocated | `get-home-dashboard.ts` / `get-organization-reports-analytics.ts`; UI 463,230 vs 500,939 | **−37,709** shown | No trustworthy total business cost | Pass Full or compose from Direct+pool |
| F03 | HIGH | GCM freshness | Historical open GCM months stale after installment schedules | Apr/Feb/May/Jun source gaps; Σ **5,442.95** | Company Actual understated **5,442.95** until refresh | Silent miss | Recompute all open months on schedule change / surface read |
| F04 | HIGH | Labor config | `workingDaysPerMonth=5` forces full-month recognition early | rate_versions + org settings; Aug known=full | Aug looks closed early | Misleading open-month cost | Correct WDM (~21–23); explain accrual |
| F05 | HIGH | Reports KPI | «הוצאות כלליות שהוקצו» = 0 while GCM alloc = 37,709 | UI scrape vs `general_cost_month_allocations` | Misstates Full composition | Confusing | Wire GCM allocations into KPI |
| F06 | HIGH | Reports KPI | Unallocated shows raw 55,936 not pool/engine | UI vs GCM/engine | Wrong general remainder story | Confusing | Show pool unallocatable + recognized general |
| F07 | MEDIUM | Attribution | «גילוי אש» categorized Labor → excluded from Actual | cost_category key=labor; −20,650.85 from expenses | Cost missing from that project’s expense layer (workforce still present) | Silent drop | Recategorize |
| F08 | MEDIUM | Cash/AR | Payments Σ includes void billing 99,007 | billing void + payments 480,470.5 | Cash totals misleading | Trust | Exclude voided applications |
| F09 | MEDIUM | UX IA | No primary «סה״כ עלויות העסק» hero | Home scrape; persona cards | — | Owner fails 16-question test | IA redesign §24 |
| F10 | MEDIUM | UX jargon | Actual/allocation/overhead required to interpret | Reports footnotes | — | Cognitive load | Plain Hebrew primary labels |
| F11 | MEDIUM | Month close | All GCM months open; history mutable | gcm.status=open; no month_close rows | Soft history | Risk | Close months / freeze |
| F12 | LOW | Expense UX | Reversal noise for «כללי» | multiple reverse rows | Net ok | Clutter | Soft-edit instead of reverse spam |
| F13 | LOW | Contract display | One contract `display_original_net_amount` 1,240,000 vs original 380,000 | contracts row ברנדייס | Display anomaly | Confusion | Validate display net fields |
| F14 | LOW | Identity | Account created today with backdated economics | auth/org created_at | — | Context | Document as rebuild-after-reset |

---

## VERDICT FLAGS

| Flag | Value |
|------|-------|
| OWNER DATA VERIFIED | **YES** |
| COMPANY ACTUAL VERIFIED | **YES** (domain math on stored pool); **UI NO** |
| PROJECT ACTUAL VERIFIED | **YES** (Direct matches UI 463,230; Full = Direct+GCM) |
| GENERAL COSTS VERIFIED | **PARTIAL** (stored identity 0.00; live engine gap 5,442.95) |
| LABOR VERIFIED | **YES with CRITICAL double-count caveat** |
| AP VERIFIED | **YES** (empty) |
| SUBCONTRACTORS VERIFIED | **YES** (expense-classified only) |
| INVENTORY VERIFIED | **YES** (empty) |
| DOUBLE COUNT FOUND | **1 critical** (+ noise) |
| MISSING COST FOUND | **3** |
| WRONG ATTRIBUTION FOUND | **4** |
| RECONCILIATION DIFFERENCE | **0.00** stored identity; **5,442.95** live vs stored pool; **37,709.20** UI vs correct Company Actual |
| UI/DB DIFFERENCE | **5** |
| UX FINDINGS | **12+** |

| Total | Amount (ILS) |
|-------|--------------|
| **TOTAL BUSINESS COST TODAY (correct Company Actual, stored)** | **500,939.20** |
| **CURRENT MONTH BUSINESS COST (approx Aug)** | **~33,361** (not the home 25,149.15) |
| **CURRENT YEAR BUSINESS COST** | **500,939.20** |

---

## MOST IMPORTANT CONCLUSION

המנוע הכלכלי **קיים** ויודע לחשב «עלות בפועל של העסק» = עלות ישירה של פרויקטים + בריכת הוצאות כלליות, ובמספרים השמורים הזהות נסגרת.  
אבל כבעל העסק **אין לך היום מספר ראשי אמין**: המסך מציג ~463 אלף כאילו זה סה״כ העסק, בזמן שהסה״כ הנכון הוא ~501 אלף (ועם רענון GCM ~506 אלף). בנוסף, עלות העובדים **כפולה בפועל** כי גם Workforce וגם הוצאות «עובדים» נכנסות ל־Actual, ו־`workingDaysPerMonth=5` גורם לאוגוסט להיראות כחודש מלא מוקדם מדי.  
לפני פישוט UX — צריך להחליט מה מקור האמת לשכר, לתקן את הצגת Company Actual, ולסנכרן את בריכת ההוצאות הכלליות. **לא תוקן כלום בביקורת הזו.**

---

*Audit stopped after report, as requested.*
