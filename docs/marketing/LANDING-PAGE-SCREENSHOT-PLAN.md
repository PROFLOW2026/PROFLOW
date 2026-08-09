# ProjectFlow — Landing Page Screenshot Plan

**Purpose:** Exact capture list for marketing. Routes from `CURRENT-SITE-MAP.md` (omit locale prefix; use `/he-IL/...` when capturing).  
**Rule:** Do **not** use FOUNDATION ONLY screens as hero selling shots (OCR review, portal, API).  
**Privacy:** Demo / fixture org only. No real customer names, phones, IDs, invoices, or addresses.

---

## Capture standards

| Rule | Detail |
|------|--------|
| Locale | `he-IL`, RTL |
| Browser | Chrome latest; device toolbar for mobile |
| Desktop viewport | 1440×900 (capture content ~1280 wide) |
| Mobile viewport | 390×844 (iPhone-class) |
| Theme | Light mode, Deep Teal product UI |
| Data | Seeded demo: 2–3 projects, mixed expenses, 1 pending + 1 approved change, billing with partial payment |
| UI chrome | Hide personal email if sensitive; OK to show demo user |
| Highlight | Soft teal oval/arrow in post; or crop to focal panel |
| File naming | `pf-landing-sc-XX-{desktop\|mobile}.png` |

---

## Priority shots (required for launch)

### SC-01 — לוח בקרה · Dashboard

| | |
|---|---|
| **Route** | `/` (app home) |
| **Viewport** | both |
| **Visible data** | Summary cards / attention items; links to projects & expenses; demo project names |
| **Must NOT** | Real client PII; empty barren state (prefer lightly populated) |
| **Highlight** | Top summary / cash-ops glance area |
| **Caption** | לוח הבקרה — מה דורש תשומת לב היום |
| **Section use** | Tour · optional Hero alternate |

---

### SC-02 — כספי פרויקט · Project financials *(primary Hero)*

| | |
|---|---|
| **Route** | `/projects/[projectId]/financials` |
| **Viewport** | desktop primary; mobile optional |
| **Visible data** | Actual / Committed / Forecast / Commercial labels; contract vs cost vs billed/paid figures (demo numbers) |
| **Must NOT** | Vague “Revenue” as undefined hero metric; real bank data |
| **Highlight** | Financial summary blocks showing separation of concepts |
| **Caption** | כספי הפרויקט — חוזה, עלות, התחייבות וגבייה במבט אחד |
| **Section use** | Hero · S05 · Tour |

---

### SC-03 — סביבת פרויקט · Project workspace

| | |
|---|---|
| **Route** | `/projects/[projectId]` |
| **Viewport** | both |
| **Visible data** | Project name; overview; tabs for expenses/changes/billing/time/documents as enabled |
| **Must NOT** | Cluttered debug panels; English-only if capturing HE market |
| **Highlight** | Hub header + tab bar |
| **Caption** | סביבת הפרויקט — מרכז העבודה והכסף |
| **Section use** | S05 · Tour |

---

### SC-04 — הוצאות · Expenses list

| | |
|---|---|
| **Route** | `/expenses` |
| **Viewport** | both |
| **Visible data** | Several expenses with amounts, projects, statuses; filters visible |
| **Must NOT** | Real vendor tax IDs; OCR “auto-read” callouts as selling point |
| **Highlight** | List + “הוצאה חדשה” affordance (not OCR link as hero) |
| **Caption** | הוצאות — תיעוד עלות מהיר לכל הפרויקטים |
| **Section use** | S06 · Tour |

**Note:** Header may show «צילום קבלה לחילוץ» — do **not** crop that as a marketing promise of live OCR. Prefer framing amount/list UX.

---

### SC-05 — שינויים · Changes

| | |
|---|---|
| **Route** | `/changes` or project changes tab / `/changes/[id]` |
| **Viewport** | desktop; mobile optional |
| **Visible data** | At least one **pending** and one **approved** change; amounts |
| **Must NOT** | Imply pending already in current contract |
| **Highlight** | Status badges pending vs approved |
| **Caption** | שינויים — ממתין בנפרד עד לאישור |
| **Section use** | S07 · Tour |

---

### SC-06 — חיובים וגבייה · Billing

| | |
|---|---|
| **Route** | `/billing` and/or `/billing/[billingRecordId]` |
| **Viewport** | desktop; mobile optional |
| **Visible data** | Billing records; payment history or aging; clear invoiced vs paid |
| **Must NOT** | “Tax invoice authority filing” framing |
| **Highlight** | Outstanding / paid separation |
| **Caption** | חיובים ותשלומים — יודעים מה פתוח באמת |
| **Section use** | S07 · Tour |

---

### SC-07 — דוחות · Reports

| | |
|---|---|
| **Route** | `/reports` |
| **Viewport** | desktop primary |
| **Visible data** | Org analytics summaries; Actual/Committed/Forecast/Commercial; CSV export visible if possible |
| **Must NOT** | Claim AI predictions; VAT shown as profit |
| **Highlight** | Summary metrics row |
| **Caption** | דוחות — רווחיות בלי לערבב מע״מ עם רווח |
| **Section use** | S08 · Tour |

---

### SC-08 — מובייל · פרויקט

| | |
|---|---|
| **Route** | `/projects/[projectId]` |
| **Viewport** | **mobile only** |
| **Visible data** | Project hub with bottom nav (Dashboard / Projects / Expenses) |
| **Must NOT** | Desktop UI squeezed |
| **Highlight** | Bottom primary nav + project header |
| **Caption** | הפרויקט בטלפון — אותה מערכת מהשטח |
| **Section use** | Hero mobile · S11 · Tour |

---

### SC-09 — מובייל · הוצאה חדשה

| | |
|---|---|
| **Route** | `/expenses/new` |
| **Viewport** | **mobile only** |
| **Visible data** | Amount-first form; optional fields collapsed/secondary |
| **Must NOT** | Pretend OCR filled the form |
| **Highlight** | Amount field + save |
| **Caption** | הוצאה חדשה במובייל — סכום קודם, השאר אחר כך |
| **Section use** | S06 · S11 · Tour |

---

### SC-10 — התקנת אפליקציה · Install app

| | |
|---|---|
| **Route** | `/settings/app` (signed-in) **or** public install CTA on auth shell if visible |
| **Viewport** | both (mobile especially) |
| **Visible data** | Install instructions / install button state; Hebrew copy about browser install |
| **Must NOT** | App Store / Google Play badges; “works fully offline” |
| **Highlight** | Primary install action |
| **Caption** | התקינו את ProjectFlow כאפליקציה — מהדפדפן, לא מהחנות |
| **Section use** | S11 |

---

## Optional (nice-to-have)

### SC-11 — אנשים ותפקידים

| | |
|---|---|
| **Route** | `/settings/people` |
| **Viewport** | desktop |
| **Caption** | צוות עם הרשאות — כל אחד רואה מה שמותר לו |
| **Section** | S12 |

### SC-12 — רשימת פרויקטים

| | |
|---|---|
| **Route** | `/projects` |
| **Viewport** | both |
| **Caption** | כל הפרויקטים במקום אחד |
| **Section** | Tour alternate |

### SC-13 — רכש (מתקדם בלבד)

| | |
|---|---|
| **Route** | `/procurement` |
| **Viewport** | desktop |
| **Caption** | הזמנות רכש כהתחייבות — לא כהוצאה |
| **Section** | S10 only — never Hero |

---

## Do NOT capture for marketing hero / tour primary

| Screen | Route | Why |
|--------|-------|-----|
| OCR review | `/documents/ocr-review` | FOUNDATION ONLY |
| Portal | `/settings/portal` | FOUNDATION ONLY |
| API/webhooks | `/settings/api` | FOUNDATION ONLY |
| Offline drafts as “full offline” | `/settings/offline-drafts` | PARTIAL — misleading |

---

## Demo data checklist (before shoot)

- [ ] Org name: fictional (e.g. «דמו בנייה בע״מ»)  
- [ ] Clients: fictional Hebrew names  
- [ ] One project with contract + approved change + pending change  
- [ ] Expenses linked to project  
- [ ] One billing record partially paid  
- [ ] At least one time entry (optional for workforce story)  
- [ ] Features: core modules on; advanced optional for SC-13 only  

---

## Shot count summary

| Priority | IDs | Count |
|----------|-----|-------|
| Required | SC-01 … SC-10 | **10** |
| Optional | SC-11 … SC-13 | 3 |
| Excluded from sell | OCR / Portal / API | — |
