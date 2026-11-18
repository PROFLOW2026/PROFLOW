# XREF — דוח מימוש מקומי (19.11.2026)

תוכנית: `.cursor/plans/xref_resolution_fix.plan.md`  
מצב: **מימוש קוד מלא + בדיקות מקומיות** (גל 3 — 19.11). דוח אימות: `docs/audits/XREF_LOCAL_VERIFICATION_2026-11-19.md`. אין Commit, Push, Deploy, SQL, או החלפת קונטיינר. **אין אישור פריסה** — OneDrive חי + Docker worker חסרים.

---

## 1. מה יושם

### ליבת פתרון XREF

| רכיב | נתיב | הערה |
|---|---|---|
| פתרון דו-שלבי (נתיב שמור → חיפוש לפי שם) | `src/modules/external-storage/domain/xref-resolve.ts` | גבולות עומק/זמן, `ambiguous`, `incomplete`, NFC, `.dwg` עם/בלי |
| שיפור הליכה בנתיב שמור | `src/modules/external-storage/domain/xref-folder-walk.ts` | התאמת שמות עם/בלי `.dwg` |
| שכבת אפליקציה | `src/modules/external-storage/application/resolve-storage-xref.ts` | תוצאות מובנות, שער אסינכרוני, קודי HTTP |
| עימוד OneDrive | `src/modules/external-storage/providers/onedrive.ts` | `@odata.nextLink`, עד 25 עמודים |

### הרשאות קבלן (חלופה מחמירה)

| רכיב | נתיב |
|---|---|
| פרדיקט טהור | `src/modules/project-plans/domain/contractor-xref-access.ts` |
| שער פר קובץ + מטמון בקשה | `src/modules/project-plans/application/contractor-xref-gate.ts` |
| פתרון קבלן + שורש סמנטי | `src/modules/contractor-portal/application/contractor-folder-files.ts` |
| תשובות 404/409/422 | `src/app/api/contractor/dg-files/resolve-xref/route.ts` |

### כתב כמויות ו-Worker (אכיפה בשרת)

| רכיב | נתיב |
|---|---|
| רקע אדריכלי / worker xref | `src/modules/electrical-takeoff/application/takeoff-architectural-background.ts` |
| `requestActor` בבקשת עבודה | `src/modules/electrical-takeoff/application/use-cases.ts` |
| fail-closed לעבודות בלי שחקן | `src/modules/electrical-takeoff/application/takeoff-worker-xref-access.ts` |
| מסלול worker xref | `src/modules/electrical-takeoff/routes.ts` (`handleWorkerXref`) |
| healthz + protocol/capabilities | `takeoff-worker/takeoff_worker/server.py` |
| בדיקת protocol לפני dispatch | `src/modules/electrical-takeoff/domain/worker-health.ts`, `use-cases.ts` |
| תווית build ב-Dockerfile | `takeoff-worker/Dockerfile` (`TAKEOFF_WORKER_BUILD`) |

### מנוע WASM (מחוץ ל-repo, מקומי)

| רכיב | מיקום |
|---|---|
| תיקון קריאת `xref_path` מ-`BlockRecord` | `projectflow-cad-engine/crates/pf-cad-wasm/src/xref.rs`, `entity.rs` |
| בנייה מקומית | `scripts/build-wasm.ps1` במנוע |
| העתקה ל-ProjectFlow | `public/pf-cad/v2/wasm`, `public/pf-cad/v3/wasm`, `public/pf-cad/wasm` + `version.json` |
| **לא נגע** | `public/pf-cad/v1/wasm` (גרסה 3 קפואה) |

---

## 2. בדיקות מקומיות שרצו

| בדיקה | תוצאה |
|---|---|
| `npx tsc --noEmit -p .` | **עבר** |
| `vitest` — `xref-folder-walk`, `xref-resolve`, `contractor-xref-access` | **12/12 עבר** |

לא הורצו: E2E, lint מלא על כל העץ, בדיקת WASM על DWG אמיתי ב-Node, בדיקת OneDrive חיה.

---

## 3. פערים שנותרו לפני קבלה סופית

**סוכם בגל 2:**

| נושא | סטטוס |
|---|---|
| POST `resolve-xrefs` + `BatchingLookup` בקליינט | **יושם** — `org-storage`, `contractor`, `dg-files` (revision) |
| GET `org-storage/resolve-xref` מלא (`found`…`error`) | **יושם** |
| מהדורות שרטוט | **יושם** — `revision-storage-xref.ts`, routes, ענף ב-`resolve-storage-xref-client.ts` |
| סקריפטי worker STALE/SHA | **יושם** — `takeoff-boq-engine.ps1`, `takeoff-worker-prod.ps1` |
| סינון נתיבי XREF לקבלן בניתוח | **יושם** — `takeoff-analysis-xref-view.ts` |
| מטריצת parity | **עודכנה** |

**עדיין פתוח:**

1. **בדיקת WASM על DWG אמיתי** (3643 / 1545) — לא הורצה מול קבצים חיים.
2. **בדיקת קבלה (שער 12ב)** — OneDrive Graph חי בכל משטח.
3. **החלפת קונטיינר worker** בפרודקשן + אימות `workerBuild` על tunnel ציבורי.
4. **eslint / רגרסיה רחבה** — רק בדיקות ממוקדות ו-`tsc` הורצו בגל זה.

---

## 4. הוכחות מקומיות (לא סופיות)

- יחידה: חיפוש בתת-תיקייה מדומה, שם כפול → `ambiguous`, שער מסתיר קבצים לפני ספירה.
- יחידה: קבלן — קובץ לא רשום / `internal` נדחים בפרדיקט.
- WASM: בנייה מקומית הצליחה; SHA חדש ב-`version.json` ל-v2/v3 (לא ל-v1).

**אין הוכחה** שהאדריכלות נטענת מ-OneDrive בפרודקשן או בסביבה מחוברת.

---

## 5. שלבים הבאים (דורשים אישור נפרד)

1. השלמת הפערים בסעיף 3.
2. **Commit / Push** (לא בוצע).
3. פריסת אתר (Linux/Docker prebuilt).
4. בניית והחלפת קונטיינר worker.
5. בדיקת קבלה חיה עם בעלים מחובר ל-OneDrive.

---

## 6. קבצים שנגעו בהם (סיכום)

ראו `git status` / `git diff` לרשימה מדויקת. עיקריים:

- `src/modules/external-storage/domain/xref-resolve.ts` (חדש)
- `src/modules/external-storage/domain/xref-folder-walk.ts`
- `src/modules/external-storage/application/resolve-storage-xref.ts`
- `src/modules/external-storage/providers/onedrive.ts`
- `src/modules/project-plans/domain/contractor-xref-access.ts` (חדש)
- `src/modules/project-plans/application/contractor-xref-gate.ts` (חדש)
- `src/modules/contractor-portal/application/contractor-folder-files.ts`
- `src/modules/electrical-takeoff/**` (רקע, worker, health)
- `takeoff-worker/**`
- `public/pf-cad/{v2,v3,wasm}/wasm/*` (בינארי WASM מעודכן)
- `projectflow-cad-engine/crates/pf-cad-wasm/src/{xref.rs,entity.rs}`
- `tests/unit/external-storage/xref-resolve.test.ts`, `tests/unit/project-plans/contractor-xref-access.test.ts`