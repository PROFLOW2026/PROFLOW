# ABSOLUTE PRE-0021 — זהות מיגרציה + שערי הוכחה

**תאריך:** 2026-08-10  
**Commit / push / db:migrate / apply 0021:** לא בוצעו

```
ABSOLUTE PRE-0021 STATUS = READY TO APPLY
```

---

## 1) קובץ קנוני אחד

| | |
|--|--|
| Canonical migration path | `drizzle/migrations/0021_workforce_contacts_and_allocations.sql` |
| Absolute path | `C:\Users\ERAN YOSEF\Desktop\final projects\FINAL-WEB\projectflow\drizzle\migrations\0021_workforce_contacts_and_allocations.sql` |
| File size | **49405** bytes (על דיסק, CRLF) |
| Line count | **1298** (כל השורות, כולל ריקות) |
| SHA256 (on-disk / Windows CRLF) | `1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1` |
| SHA256 (LF-normalized, תוכן זהה) | `E0674A6AC6F68B8623D84B361B5A2AA759AFD6D4BB29EBA7D54F8DECF77DCEF9` |

### Previous hash mismatch explanation

אין שני קבצי 0021 שונים בעץ העבודה. זה **אותו קובץ קנוני אחד**.

1. **האשים** — `1F958…` הוא SHA256 של הבתים על הדיסק (CRLF). `E0674…` הוא SHA256 של **אותו תוכן** אחרי נרמול `\r\n` → `\n`. בדיקת בעלים שקיבלה `E0674…` + 1298 שורות תואמת LF-normalized; הדוח הקודם דיווח את on-disk `1F958…`.
2. **ספירת שורות** — `1146` בדוח הקודם הגיע מ־PowerShell `Measure-Object -Line` (מונה **רק שורות לא-ריקות**). ספירה מלאה = **1298**.

**האם המיגרציה השתנתה אחרי הדוח הקודם?** לא. אותו on-disk SHA256 `1F958…` לפני ואחרי כל הבדיקות בגל הזה. לא נוצר עותק שני של 0021.

---

## 2–3) Journal + היסטוריה

| | |
|--|--|
| Journal | **PASS** — רשומת 0021 יחידה: `0021_workforce_contacts_and_allocations` (idx 20); `db:check-journal` ok (21 files, last 0021) |
| 0000–0020 modified | **NO** |
| 0020 modified | **NO** |

---

## 4) SHA לפני / אחרי בדיקות מיגרציה

| | |
|--|--|
| Migration SHA before tests (on-disk) | `1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1` |
| Migration SHA after tests (on-disk) | `1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1` |
| Identical | **YES** |
| LF twin (stable content id) | `E0674A6AC6F68B8623D84B361B5A2AA759AFD6D4BB29EBA7D54F8DECF77DCEF9` (לפני=אחרי) |

Disposable PostgreSQL (PGlite; לא owner Supabase):

| בדיקה | תוצאה |
|-------|--------|
| Clean start 0000→0021 | **PASS** (`createTestDatabase` + סוויטות 0021/pre0021/integration) |
| Upgrade 0020→0021 | **PASS** (`0021 disposable upgrade from 0020`) |
| pre-0021 integrity/adversarial | **PASS** (29 tests ב־`tests/integration/pre0021` + `0021-contacts-team-integrity`) |
| Concurrent two-connection (vendor over-alloc + assignment overlap) | **PASS** |

---

## 5) SQL assertions (מהקובץ הקנוני + בדיקות)

| טענה | סטטוס |
|------|--------|
| Employee month immutability | **PASS** |
| Currency integrity | **PASS** |
| Labor conservation | **PASS** |
| Vendor conservation (NET; לא payment) | **PASS** |
| Vendor concurrency | **PASS** |
| Vendor history (applied immutable / supersede) | **PASS** |
| Assignment concurrency (overlap blocked; multi-project OK; repeat later OK) | **PASS** |
| Contact integrity (project-specific; delete clears contact id only; org לא נפגם) | **PASS** |
| Worker compensation read | **NO** (נדרש `workforce.cost.read`) |
| Worker compensation write | **NO** (נדרש `workforce.cost.manage`) |

---

## 6) Feature gates

| | |
|--|--|
| EMPLOYEE_MONTH_COSTS_READY | **false** |
| AP_BILL_PROJECT_ALLOCATIONS_READY | **false** |

החלת 0021 **אינה** מפעילה את הפיצ׳רים האלה אוטומטית.

---

## 7) FULL GATE (עץ עבודה נוכחי)

| שלב | תוצאה |
|-----|--------|
| TypeScript | **PASS** |
| Lint | **PASS** |
| Unit | **PASS** (1074) |
| UI | **PASS** (86) |
| Integration | **PASS** (161) |
| Build | **PASS** |
| Playwright desktop | **PASS** (כולל public + authenticated) |
| Playwright mobile | **PASS** |
| Worker permissions | **PASS** (`desktop-he-worker`) |
| db:check-journal | **PASS** |

במהלך השער תוקנו שני כשלי E2E לא-מיגרציה (FAQ מקלדת; locator תיאור הוצאה) — ואז **77/77 Playwright PASS** בריצה מלאה אחת.

---

## 8) Performance (מדידות קיימות — לא חוסם apply)

מקור: `docs/performance/_PRE0021-AGENT4-PERF.md` / דוח Pre-0021 קודם.

| מדד | ערך |
|-----|-----|
| Dashboard warm | **756ms** (יעד &lt;1000 — PASS) |
| Open project repeated | **1021ms** (יעד &lt;700 — MISS / HIGH מוצר) |
| Warm project tabs | **~160–501ms** (PASS) |

הערה: `docs/performance/LIVE-VERIFICATION.json` מכיל צילום נפרד (A2≈832ms, C≈1055ms). לא הורצה מדידה חדשה בגל הזה.

---

## 9) סיכום בעלים

```
ABSOLUTE PRE-0021 STATUS = READY TO APPLY

Canonical migration path = drizzle/migrations/0021_workforce_contacts_and_allocations.sql
SHA256 (on-disk CRLF) = 1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1
SHA256 (LF twin) = E0674A6AC6F68B8623D84B361B5A2AA759AFD6D4BB29EBA7D54F8DECF77DCEF9
Line count = 1298
Previous hash mismatch explanation = אותו קובץ; CRLF vs LF + Measure-Object דילג על שורות ריקות (1146)

Migration SHA before tests = 1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1
Migration SHA after tests = 1F95823DB94EB266F0002DDB9CE0D22FCB2F8921B3BD064A62AF31123FFAD1A1
Identical = YES

Journal = PASS
0000–0020 modified = NO
0020 modified = NO

Clean start 0000→0021 = PASS
Upgrade 0020→0021 = PASS
Concurrent PostgreSQL tests = PASS

Employee month immutability = PASS
Currency integrity = PASS
Labor conservation = PASS
Vendor conservation = PASS
Vendor concurrency = PASS
Vendor history = PASS
Assignment concurrency = PASS
Contact integrity = PASS
Worker compensation protection = PASS (read=NO write=NO without workforce.cost.*)

EMPLOYEE_MONTH_COSTS_READY = false
AP_BILL_PROJECT_ALLOCATIONS_READY = false

FULL GATE:
TypeScript = PASS
Lint = PASS
Unit = PASS
UI = PASS
Integration = PASS
Build = PASS
Playwright desktop = PASS
Playwright mobile = PASS
Worker permissions = PASS
db:check-journal = PASS

Performance:
Dashboard warm = 756ms
Open project repeated = 1021ms
Warm tabs = ~160–501ms

BLOCKER = אין ל־apply עם gates כבויים מעבר לסכמה עצמה
HIGH = Open project repeated ≈1021ms (מוצר/perf; לא פוסל מיגרציה additive עם gates OFF)
MEDIUM = Displacement חודשי ל־rollup לפני flip של EMPLOYEE_MONTH_COSTS_READY

0021 applied = NO
```

**לפני apply בעלים:** גיבוי; השארת gates כבויים; הבנה שעלות חודשית / הקצאת ספקים מחכים ל־wiring אחרי apply.
