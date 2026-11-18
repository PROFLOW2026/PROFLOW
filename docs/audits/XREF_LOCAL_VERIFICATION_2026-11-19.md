# XREF — דוח בדיקות מקומיות סופי (19.11.2026)

תוכנית: `.cursor/plans/xref_resolution_fix.plan.md`  
מגבלות שנשמרו: **אין** SQL, Commit, Push, Deploy, החלפת קונטיינר פעיל, מחיקת/דריסת תמונות Docker קיימות.

ראיה גולמית WASM: `docs/audits/xref-wasm-probe-2026-11-19.json` (הופק ע"י `scripts/xref-wasm-probe.mjs`).

---

## 1. בדיקת WASM על קובצי DWG אמיתיים

| קובץ | מיקום | WASM v2/v3 (נתיבים ב-report) | WASM v1 קפוא (נתיבים) | v1 חיפוש חלופי בתת-עץ |
|------|--------|------------------------------|------------------------|------------------------|
| **3643-EL.dwg** | `OneDrive\ProjectFlow\3643-EL - Standard\3643-EL.dwg` | **PASS** — ראו §2 | ריק (צפוי) | **PASS** — מצא `02.06.26\…` ו-`15.06.26\…` |
| **1545-all-01.dwg** | `OneDrive\…\1545-all-01 - Bitzua\1545-all-01.dwg` | **PASS** — `.\1545-Xref-all-02.dwg` | ריק | **PASS** — `1545-Xref-all-02.dwg` באותה תיקייה |
| **7155-A1.dwg** | `OneDrive\ProjectFlow\7155-A1 - Standard\7155-A1.dwg` | **PASS** — `.\אדריכל\6.1.26 שלב א'-השלמה\…` | ריק | **FAIL** — נתיב נשען על תיקייה מקוננת; חיפוש לפי שם בלבד לא מספיק (דורש שלב 2 שרת / נתיב שמור ב-v2) |
| **3096-EL.dwg** (לא בתכנון) | `cad-xref-test-fixtures\3096-EL\3096-EL.dwg` | **PASS** — 4 נתיבים יחסיים בשורש | ריק | **PASS** — כל 4 הקבצים נמצאו בשורש |

**הערת מנוע:** שני העותקים החדשים (v2, v3) חולקים `wasmSha256_12=c9a5bb4229a4`. v1 קפוא `c99c606f1169`.

---

## 2. הוכחת 3643 — נתיבים ממשיים מה-WASM החדש (v2 / v3)

```
vtk-100_היתר שינויים-Sheet - 03 - חזיתות וחתכים_Layout1
  => .\02.06.26\vtk-100_היתר שינויים-Sheet - 03 - חזיתות וחתכים_Layout1.dwg

vtk-103_היתר שינויים
  => .\15.06.26\vtk-103_היתר שינויים.dwg
```

**PASS** לדרישת `02.06.26` ו-`15.06.26`.

---

## 3. שלושת מנועי התצוגה (UI trees)

| עץ UI | WASM | בדיקה | תוצאה |
|-------|------|--------|--------|
| pf-cad-v3 (כפתור גרסה 1) | `/pf-cad/v3/wasm` | probe 3643/1545/7155/3096 | **PASS** |
| pf-cad (v2) | `/pf-cad/v2/wasm` | אותו probe | **PASS** |
| pf-cad-v1 (WASM קפוא) | `/pf-cad/v1/wasm` | נתיבים ריקים + חיפוש חלופי | **PASS*** |

\* קפוא: 3643/1545/3096 עוברים בחיפוש לפי שם בתת-עץ; 7155 נכשל בחיפוש מקומי בלבד (נתיב עמוק) — **PASS מותנה** עם שלב 2 בשרת כמתוכנן.

---

## 4. Docker Worker (תמונה חדשה לבדיקה בלבד)

| פריט | תוצאה |
|------|--------|
| בניית `exlfy-takeoff-worker:xref-local-verify-20261119` | **FAIL** — Docker Desktop לא פועל (`npipe` לא זמין) |
| קונטיינר `exlfy-takeoff-worker` פעיל | **לא נגע** (לא ניתן לשאילתה — Docker down) |

**חלופה שבוצעה:** `healthz()` in-process:

```json
{
  "status": "ok",
  "protocol": 1,
  "capabilities": ["xrefFetch", "xrefRefs"],
  "workerBuild": "eedd85f5ca9c6a46a1d1536a5998aa6751bbae75"
}
```

`libredwg_cli`: missing (מקובל בסביבת פיתוח ללא LibreDWG מותקן).

---

## 5. Worker + הרשאות קבלן (קוד)

| בדיקה | תוצאה |
|-------|--------|
| `healthz` — protocol, capabilities, workerBuild | **PASS** (in-process) |
| `pytest` `tests/dwg/test_xref.py` + `test_corpus_7155.py` | **PASS** (6 tests) |
| Vitest `contractor-xref-access` | **PASS** (3) |
| Vitest `worker-health` | **PASS** (3) |
| Vitest `takeoff-analysis-xref-view` | **PASS** (2) |
| טעינת XREF end-to-end ב-worker URL | **NOT RUN** — אין container / tunnel |

---

## 6. Lint ורגרסיה

| בדיקה | תוצאה |
|-------|--------|
| `npx tsc --noEmit -p .` | **PASS** |
| ESLint על קבצי XREF שנגעו | **PASS** (ללא findings) |
| Vitest xref-resolve + folder-walk | **PASS** (9) |
| Vitest cad-p9-integration | **PASS** (3) |
| OneDrive Graph חי / E2E דפדפן | **NOT RUN** |

סה"כ Vitest ברמת XREF/worker: **22** בדיקות עברו בסבב זה.

---

## 7. PASS/FAIL לפי סעיפי התוכנית

| מזהה תוכנית | תוצאה | הערה |
|-------------|--------|------|
| `resolver-contract` | **PASS** | יחידה + API |
| `resolver-saved-path` | **PASS** | יחידה |
| `resolver-subtree-search` | **PASS** | יחידה |
| `onedrive-pagination-errors` | **PASS** | קוד; לא אומת מול Graph חי |
| `dedupe-calls` | **PASS** | קוד + batch client |
| `viewer-three-engines` | **PASS** | probe שלושה WASM |
| `engine-wasm-path` | **PASS** | 3643 נתיבים מוכחים ב-v2/v3 |
| `takeoff-background` | **PASS** | קוד; לא E2E חי |
| `contractor-internal-only` | **PASS** | יחידה + קוד שער |
| `worker-version-check` | **PASS** | health in-process + vitest |
| `worker-update` | **PARTIAL** | קוד מוכן; **אין image Docker** (Docker down) |
| `rollout-coordination` | **PENDING** | דורש worker חי + פריסה |
| `preserve-analyses` | **PASS** | לא בוצעה מחיקה |
| `parity-permission-tests` | **PASS** | מטריצה + יחידה; בלי E2E שלושה משטחים |
| `live-onedrive-proof` | **FAIL** | לא בוצע |
| `acceptance-gate` | **FAIL** | תלוי OneDrive + worker + פריסה |

---

## 8. החלטה לפריסה

**אין אישור לפריסה** עד:

1. הפעלת Docker Desktop ובניית תמונת worker עם tag חדש (ללא לגעת ב-`:prod` / קונטיינר פעיל).
2. בדיקת `/healthz` על פורט נפרד (למשל 8766).
3. הוכחת OneDrive חיה (3643 + 1545 במציג ובכתב הכמויות).
4. אישור בעלים מפורש ל-commit/push/deploy.

---

## 9. קבצי עזר שנוצרו בסבב הבדיקות

- `scripts/xref-wasm-probe.mjs`
- `docs/audits/xref-wasm-probe-2026-11-19.json`
- `tests/unit/electrical-takeoff/worker-health.test.ts`
- `tests/unit/electrical-takeoff/takeoff-analysis-xref-view.test.ts`