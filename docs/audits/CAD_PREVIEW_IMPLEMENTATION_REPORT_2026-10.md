# ProjectFlow — דוח מימוש תצוגת CAD (2026-10-15)

**סטטוס:** מימוש מקומי. **לא** בוצעו commit, push, deploy או SQL.  
**בסיס:** דוחות `CAD_DWG_DWF_PREVIEW_FEASIBILITY_2026-10`, `CAD_FREE_OPTIONS_CODECAD_APS_DWF_2026-10`, `CAD_CADCRAFT_DWG_EVALUATION_2026-10`.

---

## 1. מה נוסף

- ענף **CAD** ב-`StorageFilePreviewDialog` — אותו מסלול `browser-download`, אותן הרשאות, טעינה עצלה של מנועים (`dynamic import`, `ssr: false`).
- **DWG:** CodeCAD v0.1.0 (WASM מקומי ב-`public/cad/codecad-v0.1.0/`), זום/גרירה במנוע, שכבות, התאמה לעמוד, מסך מלא, הודעת DWG חלקי, זיהוי שרטוט ריק (0 ישויות).
- **DWF / DWFX:** Autodesk Viewer SDK v7.130.0, `env: 'Local'`, קובץ נטען מ-bytes מ-ProjectFlow; טלמטריה מושבתת (`disableForPage`, `useADP: false`); כלי Sheets/מדידה/מסך מלא של ה-Viewer.
- **DXF:** `@mlightcad/cad-simple-viewer` + UI מצומצם (זום + פאנל שכבות), מצב `AcEdOpenMode.Read`, ללא המרה.
- **העלאה:** `normalizeUploadMime` / `file-rules` מאפשרים `.dwg`, `.dxf`, `.dwf`, `.dwfx` (זיהוי לפי סיומת כש-MIME גנéricי).
- **Build:** `npm run copy-cad-assets` — מוריד CodeCAD embed מ-GitHub Pages ומעתיק worker של mlightcad ל-`public/cad-workers/`.
- **רישוי:** `public/cad/codecad-v0.1.0/NOTICE` (MIT + הפניה ל-MPL/acadrust).

---

## 2. פורמטים — מה עובד בפועל (לפי דוחות + לוגיקת קוד)

| פורמט | מנוע | צפוי לעבוד | הערות |
|--------|------|------------|--------|
| **DWG** | CodeCAD | R2000–R2018 עם גאומטריה (לפי POC) | R14 / Paper Space / XREF — מגבלות ידועות; עברית לא נדרשה ב-v1 |
| **DWF** | APS Local | כן (POC) | תלות CDN Autodesk; הרחבת DWF «ישנה» |
| **DWFX** | APS Local | כן (POC) | Sheets, קבצים גדולים איטיים |
| **DXF** | mlightcad | כן (MIT, DXF מובנה) | לא CADCraft (אין DWG ב-web + UI עריכה מלא) |

**לא בוצעה בדיקת דפדפן מלאה בסession מחובר** במסגרת המימוש; יש להריץ ידנית מול קבצים אמיתיים בתיקיית פרויקט.

---

## 3. יכולות לפי מנוע

### CodeCAD (DWG)
- קווים, צורות, מידות, מספרים (לatin) — לפי POC  
- זום, גרירה, `fitView`, מסך מלא (מעטפת ProjectFlow)  
- שכבות: רשימה מישויות + `setLayerVisible`  
- **לא:** Layouts/Paper Space, XREF, עברית, R14 עם 0 ישויות  

### APS Viewer Local (DWF/DWFX)
- זום, pan, מסך מלא, Sheets, מדida (UI מובנה)  
- קובץ לא נשלח ל-Autodesk (רק JS מה-CDN)  
- **לא נבדק:** עברית ב-DWF, מגע נייד אמיתי  

### mlightcad (DXF)
- זום/pan (Toolbar), שכבות (Dock), קריאה בלבד  
- Layouts / מדידה — לפי יכולות הספרייה; toolbar מצומצם במכוון  
- **לא:** DWG (לא רשום converter בתשלום/GPL)  

---

## 4. מגבלות ומה לא עובד

- **אין** המרה ל-PDF, **אין** אחסון נוסף, **אין** שינוי הרשאות/DB.
- DWG: תצוגה **חלקית** — חובה לא להציג הצלחה על שרטוט ריק.
- DXF: CADCraft **לא** שולב (אין DWG בדפדפן; ממשק עריכה מלא).
- DWF: תלות ברשת ל-`developer.api.autodesk.com`; כשל CDN → «פתח במכשיר».
- גודל קובץ: מגבלת העלאה 25MB קיימת; CAD טוען **קובץ מלא** דרך Function.

---

## 5. קבצים ששונו / נוספו

**קוד**
- `src/modules/documents/domain/cad-file-rules.ts` (חדש)
- `src/modules/documents/domain/file-rules.ts`
- `src/modules/external-storage/ui/storage-file-preview-dialog.tsx`
- `src/modules/external-storage/ui/cad/*` (viewers, runtime, chrome)
- `src/locales/*/externalStorage.json` (he, en, ar, ru)
- `scripts/copy-cad-assets.mjs`
- `package.json`, `vercel.json`
- `tests/unit/documents/cad-file-rules.test.ts`, `file-rules.test.ts`

**נכסים סטטיים** (נוצרים ב-`copy-cad-assets`)
- `public/cad/codecad-v0.1.0/` (JS + WASM + NOTICE + version.json)
- `public/cad-workers/mtext-renderer-worker.js`

---

## 6. בדיקות נקודתיות שבוצעו

| בדיקה | תוצאה |
|--------|--------|
| Unit: `cad-file-rules`, הרחבת `normalizeUploadMime` ל-CAD | **11/11 pass** |
| `tsc --noEmit` (לאחר תיקוני CAD) | **pass** |
| `copy-cad-assets` (הורדת CodeCAD + worker) | **pass** |
| פתיחת DWG/DWF/DXF בדפדפן עם session | **לא בוצע** (נדרש smoke ידני) |
| PDF preview regression | **לא שונה** (אין diff ב-`PdfJsViewer`) |

---

## 7. מוכן לייצור?

**מ_conditional — לא לפני:**

1. **חשבון Autodesk / APS** (חינם) לכיסוי חוזי לשימוש ב-Viewer SDK.  
2. Smoke על 3–5 קבצי DWG/DWF/DXF אמיתיים (מחשב + viewport מובייל).  
3. אימות שאין העלאת קובץ CAD ל-Autodesk (Network tab) ומה נשלח ל-Mixpanel אחרי `disableForPage`.  
4. החלטה האם לכלול ב-git את WASM ~24MB או להסתמך על `copy-cad-assets` ב-CI (רשת ב-build).

**אחרי smoke ירוק:** ניתן לשחרר עם הצהרת «תצוגה חלקית» ל-DWG ותלות CDN ל-DWF.

---

## 8. בדיקה ידנית מומלצת (checklist)

1. התחברות → מנהל קבצי פרויקט → העלאת `.dxf` / `.dwg` / `.dwf` (אם יש).  
2. פתיחת כל סוג — טעינה, זום, מסך מלא.  
3. DWG ישן / R14 — ציפייה לשגיאה או «אין תוכן», לא מסך ריק.  
4. כשל רשת / CDN — כפתור «פתח במכשיר».  
5. PDF קיים — ללא שינוי.  
6. הרשאות — משתמש ללא `DOCUMENTS_READ` לא ניגש ל-bytes.
