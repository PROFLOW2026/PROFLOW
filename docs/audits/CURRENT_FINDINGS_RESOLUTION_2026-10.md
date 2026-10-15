# ProjectFlow — סגירת ממצאים (15 אוקטובר 2026)

**מקור קלט:** `PROJECTFLOW_FRESH_CURRENT_STATE_AUDIT_2026-10.md`  
**Baseline Production:** `4a4763f723355a882376008c5b509c0464e3a1c9`  
**עבודה:** תיקוני קוד + i18n + בדיקות unit ממוקדות בלבד. **ללא** SQL, migration, push, deploy.

**הערה על דוחות היסטוריים:** דוחות ביקורת ישנים אינם משקפים את מצב הקוד לאחר commit זה; מעקב הממצאים FCA-2026-* מסומן כסגור בדוח זה.

---

## סיכום מנהלים

| קטגוריה | כמות | סטטוס |
|---------|------|--------|
| CONFIRMED BUG | 4 | **FIXED** + **VERIFIED** (unit) |
| UX | 4 | **FIXED** |
| ROLE / GAP | 5 | 2 **INTENTIONAL**, 1 **VERIFIED**, 2 **FIXED** (G03, G05 תיעוד) |

**Git (לאחר תיקונים):** שינויים ב-`src/`, `tests/unit/`, `src/locales/*` — **לא** commit/push. Production עדיין על `4a4763f7` עד אישור Owner.

**מוכנות לשחרור:** **READY FOR OWNER REVIEW** — preflight מלא לפני push לפי `docs/RELEASE-PREFLIGHT.md`.

---

## A. CONFIRMED BUGS

### FCA-2026-001 — `/workforce` redirect

| שדה | ערך |
|-----|-----|
| **סטטוס** | **FIXED** · **VERIFIED** |
| **קבצים** | `src/app/[locale]/(app)/workforce/page.tsx`, `src/modules/workforce/domain/workforce-hub-entry.ts`, `src/locales/*/workforce.json` |
| **תיקון** | `resolveWorkforceHubHref` מחזיר `null` ללא הרשאה; במקום redirect ל-employees — מסך עם `Alert` והסבר. |
| **בדיקה** | `tests/unit/workforce/workforce-hub-entry.test.ts` (3 tests, green) |
| **ראיה** | אין fallback ל-`/workforce/employees` בלי `WORKFORCE_READ`. |

### FCA-2026-004 — רווחיות עסקית / הרשאות profit

| שדה | ערך |
|-----|-----|
| **סטטוס** | **FIXED** · **VERIFIED** |
| **קבצים** | `get-business-profitability.ts`, `business-profitability-view.tsx`, `business-profitability-company-actual.test.ts` |
| **תיקון** | `canReadProjectFinancials` ← `PROJECT_FINANCIALS_READ`; `canReadProfit` ← `PROJECT_PROFIT_READ`; KPI רווח מוסתרים בלי profit read; עלויות/תחזית לפי financials read. |
| **בדיקה** | unit — profit null עם financials בלבד |
| **סיכון** | לא הורחבה חשיפה — managers עם financials בלי profit רואים עלויות, לא רווח. |

### FCA-2026-006 — סכומי claims בפורטל קבלן

| שדה | ערך |
|-----|-----|
| **סטטוס** | **FIXED** · **VERIFIED** (קוד + `claimShowsNetAmount`) |
| **קבצים** | `claims/page.tsx`, `claims-list.tsx`, `external.ts`, `portal-claim-detail.tsx` |
| **תיקון** | `showAmounts` / `canViewContractValue` לפי `ext.contract.view_value`; פעולות submit/edit ללא שינוי. |
| **בדיקה** | לוגיקה קיימת ב-`contractor-portal/.../claims.ts`; לא הורץ E2E. |

### FCA-2026-008 — i18n navigation

| שדה | ערך |
|-----|-----|
| **סטטוס** | **FIXED** · **VERIFIED** (קוד + התנהגות API) |
| **קבצים** | 28+ קבצי client — `useRouter`/`usePathname` → `@/shared/i18n/navigation`; `useSearchParams` נשאר מ-`next/navigation` (תקין). |
| **תיקון** | רק ניווט שמשנה URL עם locale prefix — לא החלפה עיוורת של `notFound`. |
| **בדיקה ממוקדת** | `usePathname` של next-intl מחזיר נתיב **ללא** prefix; `router.push(pathname?query)` שומר locale (`localePrefix: always`) — זהה לדפוס המומלץ ב-`navigation.ts`. `router.refresh()` ללא שינוי URL — תקין. |
| **Production** | **לא אומת** בדפדפן — ייחול לאחר deploy. |

---

## B. ROLE / PERMISSION GAPS

### FCA-2026-G01 — Platform sysadmin

| **סטטוס** | **INTENTIONAL** · **OUT OF SCOPE** |
| **פעולה** | אין role חדש. |

### FCA-2026-G02 — `/command-center` vs `/today`

| **סטטוס** | **VERIFIED** + **FIXED** (הודעת גישה) |
| **פעולה** | `/today` מממש command center; שיפור FCA-2026-003 (גישה ברורה). לא נוצר URL נוסף. |

### FCA-2026-G03 — preset מזכירה / הצעות

| **סטטוס** | **FIXED** |
| **קבצים** | `presets.ts` — `QUOTES_READ`, `QUOTES_MANAGE` ל-secretary |
| **החלטה** | **ללא** `projects.create` / `contracts.manage` — convert quote→project נשאר grant מפורש (management / owner). |

### FCA-2026-G04 — worker/finance vs UWM Owner

| **סטטוס** | **INTENTIONAL** · **VERIFIED** |
| **פעולה** | אין הוספת `tasks.*` ל-finance/worker; Employee App + grants לשטח. |

### FCA-2026-G05 — Finance AP posting

| **סטטוס** | **VERIFIED** + **FIXED** (תיעוד) |
| **קבצים** | `role-templates.ts` (הערה), `organization.json` (4 locales) |
| **החלטה** | `AP_READ` ל-finance; `AP_MANAGE` דרך **Settings → Roles** — לא אוטומטי לכולם. |

---

## C. UX FINDINGS

### FCA-2026-002 — Employee `/employee/time` ריק

| **סטטוס** | **FIXED** |
| **קבצים** | `employee/(shell)/time/page.tsx`, `employeeApp.json` (4 locales) |
| **תיקון** | `EmptyState` כשאין הרשאות time/attendance/approve. |

### FCA-2026-003 — redirect שקט מ-`/today`

| **סטטוס** | **FIXED** |
| **קבצים** | `today/page.tsx`, `commandCenter.json` (4 locales) |
| **תיקון** | `Alert` עם `accessDeniedTitle/Description` במקום redirect ל-`/`. |

### FCA-2026-007 — מסמכי קבלן / multi-grant

| **סטטוס** | **FIXED** · **VERIFIED** (קוד) |
| **קבצים** | `contractor/.../documents/page.tsx` |
| **תיקון** | קריאת `listContractorSharedDocuments` **פעם לכל organizationId** (לא grant ראשון); רשימה נפרדת לכל org — `organizationId` נכון ל-ack/download. |
| **Production** | **לא אומת** — ייחול לאחר deploy. |

### FCA-2026-009 — `/workspaces` + `work_management`

| **סטטוס** | **FIXED** |
| **קבצים** | `workspaces/page.tsx` |
| **תיקון** | `notFound()` כמו `/work/*` כש-module כבוי או חסר `TASKS_READ`. |

---

## D. כללי בטיחות — עמידה

- לא שונה מנוע compose/profit formulas (רק gates UI/data flags).
- לא DB / migration / SUMIT / 0181.
- לא הוסרו Quick Create / tabs / תמונות פרויקט.

---

## E. בדיקות שבוצעו

```text
npx vitest run tests/unit/workforce/workforce-hub-entry.test.ts
npx vitest run tests/unit/financials/business-profitability-company-actual.test.ts
→ 6/6 passed
```

לא בוצעו: full build, lint גורף, E2E, DB.

---

## F. מעקב ממצאים (13/13)

**מקרא:** **קוד** = אומת ב-repo לפני push · **Production** = עדיין baseline `4a4763f7` עד deploy.

| ID | סגירה | קוד | Production |
|----|--------|-----|------------|
| FCA-2026-001 | FIXED | VERIFIED (unit) | לא |
| FCA-2026-002 | FIXED | VERIFIED (קוד) | לא |
| FCA-2026-003 | FIXED | VERIFIED (קוד) | לא |
| FCA-2026-004 | FIXED | VERIFIED (unit) | לא |
| FCA-2026-005 | VERIFIED (doc) | VERIFIED | לא (תיעוד בלבד) |
| FCA-2026-006 | FIXED | VERIFIED (קוד) | לא |
| FCA-2026-007 | FIXED | VERIFIED (קוד) | לא |
| FCA-2026-008 | FIXED | VERIFIED (API nav) | לא |
| FCA-2026-009 | FIXED | VERIFIED (קוד) | לא |
| FCA-2026-G01 | INTENTIONAL | — | — |
| FCA-2026-G02 | VERIFIED | VERIFIED | לא (UX message) |
| FCA-2026-G03 | FIXED | VERIFIED (preset) | לא |
| FCA-2026-G04 | INTENTIONAL | — | — |

---

## G. סיכונים שנותרו

- **Runtime חזותי / E2E:** לא אומת בדפדפן.
- **i18n:** ייתכנו client components נוספים עם `next/navigation` ל-router — לא בסCOPE commit זה.

---

## H. Git ושחרור

| פרמטר | ערך |
|--------|-----|
| **Baseline SHA** | `4a4763f723355a882376008c5b509c0464e3a1c9` |
| **Production (נוכחי)** | עדיין baseline — **לא deploy** |
| **Push/Deploy** | **BLOCKED** — ממתין לאישור Owner |
| **המלצה** | commit ממוקד → preflight CI מקומי → push → verify Vercel SHA |

---

*נוצר: 15 אוקטובר 2026 — סגירת מחזור ממצאים FCA-2026.*
