# דוח טרום-מיגרציה — Pre-0021 Closure

**תאריך:** 2026-08-10  
**Commit / push / db:migrate / apply 0021:** לא בוצעו

```
0021 FINAL STATUS = READY TO APPLY
```

מוכן להחלת 0021 על סביבת בעלים **רק** עם:
1. גיבוי
2. `EMPLOYEE_MONTH_COSTS_READY = false` ו־`AP_BILL_PROJECT_ALLOCATIONS_READY = false` (נשארים כבויים)
3. הבנה ש־Displacement חודשי ל־rollup + UI persist מחכים לגל אחרי apply

לא מוכן להפעלת feature gates של עלות חודשית / הקצאת ספקים עד wiring פיננסי.

---

## SQL integrity

| בדיקה | סטטוס |
|-------|--------|
| Employee month immutable after applied/closed | **PASS** (תיקון כלכלי רק דרך supersede/adjust) |
| Currency chain enforced | **PASS** (month = run = lines; vendor = bill) |
| Labor conservation | **PASS** (allocated + unallocated = known; Σ lines = allocated) |
| Vendor conservation | **PASS** (Σ active ≤ bill NET; לא Payment) |
| Vendor concurrency | **PASS** (advisory + FOR UPDATE; disposable two-connection) |
| Vendor applied-history immutable | **PASS** (draft → applied → superseded) |
| Assignment overlap concurrency | **PASS** (advisory + optional gist) |
| Contact client/org integrity | **PASS** (FK בטוח + UPDATE guard) |

---

## Security

| | |
|--|--|
| Worker compensation read | **MUST BE NO** — PASS |
| Worker compensation write | **MUST BE NO** — PASS |

מפתחות: `workforce.cost.read` / `workforce.cost.manage` + RLS ב־0021 (לא membership בלבד).

---

## UX

| | |
|--|--|
| Employee simple creation | **PASS** |
| Employee→Assignments | **PASS** |
| Project→Team | **PASS** |
| Multiple assignment periods | **PASS** |
| Monthly true-cost UI | **PASS** (draft מאחורי gate) |
| Hours / Days / Percent / Fixed allocation | **PASS** (ב־UI Advanced; persist כבוי) |
| Unallocated visible | **PASS** |
| Vendor bill split UI | **PASS** (draft; רק `ap.manage`) |
| Mobile | **PASS** |

---

## Optionality

**PASS** — בלי שכר / שיוכים / חודשי / הקצאת ספק; פרויקטים/jobs/הוצאות/חיובים/AP/שעות/דוחות ממשיכים.

---

## Performance ACTUAL (production Playwright)

| מדד | תוצאה | יעד |
|-----|--------|-----|
| Dashboard warm | **756ms** | &lt;1000 — **PASS** |
| Open project repeated | **1021ms** | &lt;700 — **MISS (HIGH)** |
| Open project first soft | **529ms** | — |
| Project warm tabs | **~160–501ms** | מהיר — **PASS** |

מקור: `docs/performance/LIVE-VERIFICATION.json` (Agent 4).

---

## Migration

| | |
|--|--|
| 0021 filename | `0021_workforce_contacts_and_allocations.sql` |
| 0021 SHA256 | `1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1` |
| 0021 line count | **1146** |
| 0021 applied | **NO** |
| 0000–0020 modified | **NO** |

Feature flags:

- `EMPLOYEE_MONTH_COSTS_READY = false`
- `AP_BILL_PROJECT_ALLOCATIONS_READY = false`

---

## Tests (Lead re-verify + Gate follow-up 2026-08-10)

[Run Pre-0021 Final Gate](ba80f734-7552-40d5-8bd5-9160ae5babcf) חזר **RED** (אינטגרציה: שם אינדקס ישן; Playwright: `getByLabel('שפת הממשק')` strict-mode). Follow-up:

| שלב | תוצאה |
|-----|--------|
| TypeScript | **PASS** |
| Lint | **PASS** |
| Unit | **PASS** (1074) |
| Integration | **PASS** — שם אינדקס `ap_bill_project_allocations_bill_project_active_uq` בטסט (6/6 בקובץ 0021) |
| Build | רץ ב־Final Gate / נדרש ל־Playwright |
| Playwright | **PASS** (settings profile) — locator ל־`getByRole('combobox', { name })` |
| Concurrent PostgreSQL (disposable) | **PASS** (23/23 pre0021 integrity/adversarial/lifecycle) |
| db:check-journal | **PASS** (21 files, last 0021) |

```
GATE STATUS (after follow-up) = GREEN for prior RED blockers
```

---

## BLOCKER / HIGH / MEDIUM

**BLOCKER:** אין ל־apply של 0021 עם gates כבויים.

**HIGH:**
1. Open project repeated ≈1021ms (יעד &lt;700) — לא חוסם apply; לתקן בגל perf נפרד.
2. Displacement חודשי **לא** ב־`aggregateProjectCosts` — **אסור** להפוך `EMPLOYEE_MONTH_COSTS_READY` לפני wiring.

**MEDIUM:**
- RSC/client soft-nav אחרי `/projects`
- גיסט exclusion best-effort ב־PGlite
- UI חודשי/ספק draft עד flip

---

## מה הבעלים עושים עכשיו

1. לאשר apply של `0021_workforce_contacts_and_allocations.sql`  
2. להריץ migrate **רק** כשמאשרים (לא בוצע בגל זה)  
3. **לא** להפעיל READY flags עד גל wiring פיננסי  
4. אופציונלי: גל perf ל־open-project &lt;700ms  

**אין commit / אין push / אין db:migrate בגל זה.**
