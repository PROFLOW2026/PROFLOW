# ProjectFlow — היתכנות לצפייה בקובצי DWG / DWF / DWFX / DXF

**תאריך:** 2026-10-15
**סוג:** מחקר ומיפוי בלבד. לא בוצעו שינויי קוד, SQL, migrations, commit, push או deploy.
**בסיס:** קוד המקור הנוכחי ב־workspace + תיעוד ספקים ציבורי (נבדק ב־2026-10-15).

מקרא אמינות:
- **[קוד]** — אומת בקריאת הקוד הנוכחי.
- **[תיעוד]** — מוצהר בתיעוד הספק, לא הוכח בפועל אצלנו.
- **[לא אומת]** — מידע סותר או חסר; דורש בדיקה לפני החלטה.

---

## 0. תקציר מנהלים

1. **תשתית התצוגה הקיימת מתאימה להרחבה.** יש דיאלוג תצוגה משותף אחד לכל מנהלי הקבצים (`StorageFilePreviewDialog`), שמחליט לפי MIME בין תמונה, PDF או "לא נתמך". הוספת ענף CAD נוספת לצד ה־PDF, בלי לגעת בו.
2. **הקובץ כבר עובר דרך שרת ProjectFlow** (`/api/org-storage/browser-download`) עם בדיקת session, ארגון, תחום פרויקט והרשאות תיקייה. מנוע CAD שרץ בדפדפן יכול להשתמש באותו נתיב בדיוק, כך שאין עקיפת הרשאות ואין אחסון נוסף.
3. **DWG/DXF:** הפתרון המועדף הוא **מנוע מקומי בדפדפן (mlightcad `cad-simple-viewer`)**. DXF זמין ברישיון MIT ללא עלות. ל־DWG בשימוש מסחרי סגור צריך **מפענח מסחרי בתשלום חד־פעמי של $3,000** (עדכונים אחרי השנה הראשונה: $1,500 לשנה, אופציונלי). החלופה החינמית (LibreDWG) היא GPL-3.0, ואינה מומלצת למוצר SaaS סגור בלי ייעוץ משפטי.
4. **DWF/DWFX:** **אין כיום פתרון בדפדפן שהוא גם חינמי וגם חוקי לשימוש מסחרי סגור.** הרכיב הפתוח היחיד שנמצא (`dwf-viewer`) הוא AGPL-3.0 וחדש מאוד. תמיכה אמינה ב־DWF מצריכה Autodesk APS (שליחת הקובץ לענן Autodesk ועלות לפי המרה) או ODA (מ־$7,500 בשנה הראשונה).
5. **המלצה:** גרסה ראשונה ל־DXF + DWG במנוע מקומי. DWF/DWFX נשארים בגרסה ראשונה עם כפתורי "פתח במכשיר / פתח אצל הספק" הקיימים, והחלטה עליהם תתקבל בהמשך לפי כמות קובצי DWF בפועל.
6. **מורכבות:** DXF בלבד — **נמוכה–בינונית**. DXF + DWG — **בינונית**. כולל DWF — **גבוהה**.
7. **בדיקה מעשית:** **לא בוצעה.** אין ב־workspace אף קובץ `.dwg/.dwf/.dwfx/.dxf`. כל טענות התאימות בדוח מבוססות תיעוד בלבד.

---

## 1. מיפוי המצב הקיים

### 1.1 המסלול מקצה לקצה

```
אחסון חיצוני (Google Drive / OneDrive / Dropbox / Box)
  → רשימת קבצים: StorageProviderAdapter.listFolder  (providers/*.ts)
  → UI: project-files-tab.tsx / company-files-tab.tsx / employee-project-files-browser.tsx
  → לחיצה: openFilePreview(file) → setPreviewFile
  → StorageFilePreviewDialog  (external-storage/ui/storage-file-preview-dialog.tsx)
  → URL: buildStorageFileDownloadUrl({ disposition: 'inline' })
        = /api/org-storage/browser-download?scope=&fileId=&projectId=&disposition=inline
  → Route (Node, dub1): requireSession → runInOrgContext
        → streamProjectStorageFileDownload / streamOrgStorageFileDownload
        → adapter.downloadFileStream (כולל Byte-Range)
  → דפדפן: PdfJsViewer (react-pdf + pdfjs-dist) או ZoomablePreviewImage
```

### 1.2 קבצים ופונקציות מדויקים **[קוד]**

| רכיב | קובץ | תפקיד |
|---|---|---|
| דיאלוג תצוגה משותף | `src/modules/external-storage/ui/storage-file-preview-dialog.tsx` | `inferMimeType()`, בחירה בין `showImage`, `showPdf` ו־unsupported, ניווט בין קבצים, שיתוף |
| מעטפת מסך מלא | `src/modules/external-storage/ui/storage-file-preview-shell.tsx` | Portal, נעילת גלילה, Escape, כותרת. מסך מלא במובייל, 92vw/92vh בדסקטופ |
| מציג PDF | `src/modules/external-storage/ui/pdf-js-viewer.tsx` (+ `pdf-lazy-page.tsx`, `pdf-viewer-utils.ts`, `pdf-viewer-config.ts`) | זום, pinch, כלי יד, סיבוב, Fullscreen API, דפים עצלים, timeout |
| תמונה | `src/modules/external-storage/ui/zoomable-preview-image.tsx` | זום ו־pan לתמונות |
| חוקי קבצים | `src/modules/documents/domain/file-rules.ts` | `isBrowserPreviewableMime` / `...PdfMime` / `...ImageMime`, `normalizeUploadMime`, `MAX_DOCUMENT_SIZE_BYTES = 25MB` |
| בניית URL | `src/modules/external-storage/client/storage-file-urls.ts` | `buildStorageFileDownloadUrl`, `buildStorageProviderUrlRequest` |
| Route הורדה | `src/app/api/org-storage/browser-download/route.ts` | `Content-Type` מהספק, `Content-Disposition`, `Cache-Control: private, no-store`, תמיכת 206/416 |
| Range | `src/modules/external-storage/server/byte-range.ts` | `parseByteRangeHeader`, `buildContentRange`, `buildContentDisposition` |
| שירות פרויקט | `src/modules/external-storage/application/browser-service.ts` → `streamProjectStorageFileDownload` (שורה ~729), `getProjectStorageProviderWebUrl` (~832) | `assertPermission(DOCUMENTS_READ)`, `assertFileScope`, `assertSemanticFolderBrowseAccess` |
| שירות ארגון | `src/modules/external-storage/application/org-browser-service.ts` → `streamOrgStorageFileDownload` (~453) | כנ"ל ל־Company Files |
| ממשק ספק | `src/modules/external-storage/domain/provider-interface.ts` → `downloadFileStream`, `getProviderWebUrl` | |
| קישור לספק | `src/app/api/org-storage/browser-provider-url/route.ts` | "פתח ב־Drive/OneDrive" (חסום לעובדי employee-app) |
| Worker של PDF | `public/pdf.worker.min.mjs` + header ב־`vercel.json` | דפוס קיים להגשת worker/wasm סטטי באותו origin |

### 1.3 תשובות לשאלות

**כיצד מוצג PDF היום?** המציג הוא `react-pdf` v11 עם `pdfjs-dist` 6.3, וה־worker מוגש מאותו origin. ה־PDF נטען מה־route הפנימי עם `withCredentials`, ו־PDF.js מבקש טווחי בתים (Range) כך שהקובץ לא נטען כולו מראש. יש זום (presets, ‏+/−, pinch), התאמה לרוחב ולעמוד, כלי יד, סיבוב, מסך מלא, ניווט בין דפים ו־timeout עם Retry.

**תשתית Preview משותפת?** כן. `StorageFilePreviewDialog` משמש את שלושת מנהלי הקבצים (פרויקט, חברה, אפליקציית עובד). לצדו יש מסלול נפרד למסמכים (`documents/ui/document-preview-dialog.tsx`, `document-inline-preview.tsx`) ולראיות (`evidence/ui/evidence-inline-preview.tsx`). מסלולים אלה אינם מנהל הקבצים ואינם בתחום הבדיקה.

**אילו פורמטים מוצגים?** PDF, ותמונות JPEG/PNG/WebP/GIF. וידאו מוגדר ב־file-rules אבל לא מוצג בדיאלוג הזה. כל השאר (כולל Office ו־CAD) מוצג כ"לא נתמך" עם כפתורי שיתוף, "פתח במכשיר" ו"פתח אצל הספק".

**איך מתקבלת גישה לקובץ?** בשרת. הטוקן OAuth של הארגון נשמר בצד השרת, והשרת קורא ל־API של הספק (למשל `files/{id}?alt=media` ב־Google Drive). לדפדפן לא מגיע טוקן ולא קישור ציבורי.

**שרת או ישירות?** **דרך שרת ProjectFlow** (Vercel Function ‏Node, אזור `dub1`) כ־stream. אין signed URL ישיר מהספק לדפדפן.

**הרשאות, קישורים זמניים ו־MIME:** הרשאה נבדקת בכל בקשה (`requireSession`, ‏`runInOrgContext`, ‏`DOCUMENTS_READ`, תחום הקובץ בעץ הפרויקט, הרשאת תיקייה סמנטית). ה־URL אינו זמני אלא מוגן session, עם `private, no-store`. ה־MIME מגיע מהספק, ובדיאלוג `inferMimeType` משתמש בערך שהספק החזיר, ורק אם הוא ריק מנחש לפי סיומת (pdf/jpg/png/webp/gif בלבד).

**תמיכה קיימת ב־DWG/DWF?** **אין.** אין שום התייחסות לסיומות או ל־MIME של CAD בקוד. בפועל:
- קבצים שכבר נמצאים בתיקייה בענן **מופיעים ברשימה** ונפתחים כ"לא נתמך".
- **העלאת DWG ממנהל קבצי הפרויקט נחסמת**: `normalizeUploadMime` מחזיר `ok:false` כי `dwg` לא נמצא ב־`EXT_TO_MIME` / `ALLOWED_MIME_EXACT`, והמשתמש רואה `uploadFailed`. בנוסף קיימת מגבלה של 25MB.
- העלאה ב־Company Files (`/api/org-storage/org-browser-upload`) **אינה** בודקת MIME.
- מודול השרטוטים (`src/modules/project-plans/`) מקבל **PDF ותמונות בלבד** (`assertDrawingFile` ב־`manage-drawings.ts`, ‏`accept=".pdf,image/*"` ב־`revision-upload-form.tsx`).

**רכיבים לשימוש חוזר:** מעטפת הדיאלוג, ה־route וההרשאות כפי שהם, `StorageLoadingOverlay`, שיתוף, "פתח במכשיר / אצל הספק", ניווט בין קבצים, דפוס `dynamic(..., { ssr:false })` שקיים ל־PdfJsViewer, ודפוס הגשת worker ב־`public/` עם header ב־`vercel.json`. אין CSP שחוסם WASM או Workers (לא נמצא header כזה ב־`next.config`, ב־`proxy.ts` או ב־`vercel.json`).

### 1.4 נקודות שישפיעו על מימוש CAD

- `inferMimeType` מעדיף את ה־MIME מהספק. קובצי DWG מגיעים לעיתים כ־`application/octet-stream`, `image/vnd.dwg` או `application/acad`, משתנה לפי ספק **[לא אומת]**. לכן זיהוי CAD חייב להתבסס **על סיומת**.
- `isBrowserPreviewableMime` משמש גם את `document-attachments.tsx`. אין לשנות אותו. צריך פונקציה נפרדת ל־CAD כדי לא לשנות את התנהגות ה־PDF או את מסכים אחרים.
- מציג CAD צריך את **כל הקובץ**, ו־Range לא עוזר. לכן כל צפייה מזרימה את הקובץ המלא דרך ה־Function.

---

## 2. השוואת פתרונות

### A — Autodesk APS (Model Derivative + Viewer)

| נושא | ממצא |
|---|---|
| פורמטים | DWG, DWF, DWFX, DXF מופיעים כולם כמקור נתמך ל־SVF/SVF2 **[תיעוד]**. זו התמיכה הרחבה ביותר ב־DWF, כי מדובר בפורמט של Autodesk עצמה. |
| צפייה מהאחסון שלנו | **לא ישירות.** חובה להעלות את הקובץ ל־OSS (אחסון Autodesk), להריץ המרה (Model Derivative), ואז ה־Viewer טוען נגזרות (SVF2) מענן Autodesk **[תיעוד]**. |
| הקובץ נשלח ל־Autodesk? | **כן, תמיד.** המקור נשמר ב־bucket (במדיניות `transient` ‏24 שעות). **הנגזרות נשמרות בנפרד וללא הגבלת זמן** עד קריאה מפורשת ל־`DELETE /manifest` **[תיעוד]**. יש אזור EMEA. |
| עלויות | Viewer: חינם. המרת DWG/DXF/DWF נחשבת **simple job**. התמחור הרשמי סותר: עמוד Flex מציג "1 token per simple job", וסרטון רשמי מפברואר 2026 מציג "1 token per 3 simple jobs". Token ‏≈ $3 (מינימום 100 tokens = $300, תוקף שנה). הערכה: **כ־$1–$3 להמרה**, פעם אחת לכל גרסת קובץ **[לא אומת — לבדוק בחשבון Autodesk]**. Free tier כולל מכסה חודשית (נמצאו גם 20 וגם 60 simple jobs/חודש), ומוגדר "לניסויים ו־POC" **[לא אומת]**. יש דיווחים על 403 ב־Free tier בלי יתרת tokens. |
| רישוי מסחרי | מותר לפי Terms of Service של APS. ה־Viewer JS **חייב להיטען מ־CDN של Autodesk** ואסור לארח אותו עצמאית **[תיעוד]**. |
| Next.js / מובייל | ה־Viewer הוא ספריית JS שנטענת ב־client. תומך דפדפני מובייל, ויש מדידה, שכבות ו־Sheets מובנים **[תיעוד]**. |
| אבטחה | **סיכון בין־ארגוני:** טוקן Viewer (‏2-legged, `viewables:read`) מאפשר קריאה של כל הנגזרות של האפליקציה, לא רק של ארגון אחד. בידוד מלא מחייב proxy לנגזרות דרך השרת שלנו, או bucket לכל ארגון יחד עם URN בלתי צפוי. אלה תוספות מורכבות. |
| משאבי Vercel | העלאה ל־OSS: מעבר בתים אחד דרך השרת לכל גרסה. צפייה: ישירות מ־Autodesk. דורש job queue / polling למצב ההמרה (דקות), ומעקב בטבלת DB חדשה (שינוי סכמה). |

**מסקנה:** איכות התצוגה והתמיכה בפורמטים הכי טובות, אבל **סותר את עיקרון 3** (העברה ל־Autodesk), יוצר עלות שוטפת לפי המרה, תלות בספק, ומחייב סכמה ותור. מתאים רק כ־opt-in מפורש בעתיד.

### B — מנוע מקומי בדפדפן

#### B1 — mlightcad `cad-viewer` / `cad-simple-viewer` (מומלץ ל־DWG/DXF)

| נושא | ממצא |
|---|---|
| פורמטים | **DXF**: מפענח MIT מובנה. **DWG**: רק עם converter נוסף, אחד משניים: (1) `@mlightcad/libredwg-converter` ב־**GPL-3.0**, כ־13MB WASM, עם כיסוי ישויות מוגבל ו־OOM בקבצים גדולים, או (2) **מפענח קנייני** (`@mlightcad/dwg-converter`) בגודל ~437KB. **DWF/DWFX: לא נתמך.** **[תיעוד]** |
| ללא שירות חיצוני | כן. הפענוח והרינדור כולם בדפדפן (Three.js / WebGL + Workers). הקובץ לא יוצא מהדפדפן. |
| שרטוטים מורכבים | Batching, instancing ו־BVH. יש Layouts / Paper space. **חסר:** XREF (לא מוצג כלל), Viewports (בתכנון), טבלאות במסלול LibreDWG, ו־linetype scaling **[תיעוד]**. |
| גרסאות AutoCAD | LibreDWG: עד פורמט AutoCAD 2018. ככל הידוע זה גם הפורמט שבו שומרות גרסאות 2019 ואילך, אבל **[לא אומת]**. תאימות R12 עד הגרסה האחרונה מסומנת "בתהליך". |
| גופנים / עברית | יש טעינת SHX/TTF/OTF/WOFF, מיפוי גופן חסר לגופן חלופי ו־`defaultFonts`. **אין תיעוד לתמיכה ב־RTL.** קיימת סכנה שעברית תוצג הפוכה או ריקה בשרטוטים עם SHX עברי ישראלי **[לא אומת — חובה לבדוק על שרטוטים אמיתיים]**. |
| רישוי מסחרי | הליבה ב־MIT. **DWG חוקי בשימוש סגור רק עם המפענח הקנייני:** $3,000 חד־פעמי, רישיון תמידי, SaaS רב־ארגוני, ללא מגבלת משתמשים או קבצים. עדכונים אחרי השנה הראשונה: $1,500 לשנה, אופציונלי. מתוחזק על ידי מפתח יחיד ללא SLA. יש trial לחברות. GPL: הפצת JS/WASM ללקוחות היא "הפצה" ויוצרת חובות GPL, ולכן לא מומלץ בלי ייעוץ משפטי. |
| גודל ובצועים | Three.js + viewer כמה MB, ונטען רק בפתיחת CAD (dynamic import), כך שאין השפעה על שאר האפליקציה. זיכרון: גופן CJK יחיד יכול לתפוס 40MB, וגופן עברי קטן בהרבה. |
| UI | `cad-simple-viewer` בלי תלות ב־framework, ו־`cad-simple-ui-plugin` ב־DOM נקי (שכבות, מדידה, toolbar). ה־UI המלא מבוסס Vue, ולכן לא מומלץ. אין דוגמת React רשמית, אבל יש דוגמת Next.js. |
| מובייל | Pinch zoom, pan באצבע אחת ו־UI רספונסיבי מובנים **[תיעוד]**. |
| מהאחסון הקיים | כן. ה־viewer מקבל ArrayBuffer או URL, וה־route הקיים מספק את הבתים עם אותן הרשאות. |

#### B2 — `dwf-viewer` / `@flyfish-dev/cad-viewer` (DWF/DWFX)

- היחיד שנמצא שמפענח DWF, DWFx/XPS ו־W2D בדפדפן. `@flyfish-dev/cad-viewer` 0.8.3 משלב DWG/DXF (LibreDWG) עם DWF **[תיעוד]**.
- **רישיון AGPL-3.0-only.** במוצר SaaS סגור AGPL מחייב להציע את קוד המקור לכל משתמש. **לא מתאים ל־ProjectFlow.** לא נמצא רישיון מסחרי חלופי.
- הפרויקט חדש מאוד (נוצר ביוני 2026) וכיסוי W2D חלקי.

### C — המרה לתצוגה מקדימה (PDF/SVG/PNG)

| תת־גישה | ממצא |
|---|---|
| **המרה בשרת (Vercel)** | אין ספרייה חוקית וזולה שרצה ב־Function: LibreDWG הוא GPL, ו־ODA מתחיל ב־$7,500 בשנה הראשונה לשימוש Web/SaaS. בנוסף יש מגבלות זיכרון (2–4GB), זמן ריצה, גודל bundle ועלות CPU לכל המרה. **לא מומלץ.** |
| **המרה בדפדפן** | mlightcad כולל plugins ל־PDF/SVG. זה אותו מנוע של B1 ולא פתרון נפרד, ושימושי רק ל"ייצוא ל־PDF" כפיצ'ר עתידי. |
| **שירות חיצוני (CloudConvert)** | תומך DWG→PDF/SVG/PNG ו־DWF כמקור **[תיעוד]**. עלות לפי credits: בסיס של 1 credit ועוד credit לכל דקה. קבצים נמחקים עד 24 שעות. **הקובץ נשלח לצד שלישי** (סותר עיקרון 3). השמירה של ה־PDF שנוצר דורשת אחסון (חדש, או כתיבה לתיקיית הלקוח), כך שצריך החלטה. |
| **ODA SDK** | תמיכה מלאה ב־DWG/DWF/DGN, כולל Web. Commercial: $3,000 בשנה הראשונה, **ללא Web/SaaS**. Sustaining (כולל Web/SaaS): **$7,500 בשנה הראשונה, אחר כך $4,500 לשנה**. מנוי: בהפסקתו נשללת זכות ההפצה **[תיעוד]**. |

---

## 3. טבלת השוואה

| קריטריון | A: APS | B1: mlightcad + מפענח קנייני | B1': mlightcad + LibreDWG | B2: dwf-viewer | C: CloudConvert | ODA |
|---|---|---|---|---|---|---|
| DWG | ✅ מלא | ✅ טוב **[תיעוד]** | ⚠️ חלקי | ⚠️ (דרך LibreDWG) | ✅ | ✅ מלא |
| DXF | ✅ | ✅ (MIT) | ✅ (MIT) | ✅ | ✅ | ✅ |
| DWF / DWFX | ✅ מלא | ❌ | ❌ | ⚠️ חלקי | ✅ (ל־PDF) | ✅ |
| הקובץ נשאר אצלנו | ❌ נשלח ל־Autodesk | ✅ | ✅ | ✅ | ❌ צד שלישי | ✅ |
| עלות | ~$1–3 להמרה **[לא אומת]** | $3,000 חד־פעמי | $0 | $0 | לפי credit | $7,500 + $4,500/שנה |
| רישוי ל־SaaS סגור | ✅ | ✅ | ⚠️ GPL | ❌ AGPL | ✅ | ✅ |
| שירות מתמשך | כן (Autodesk) | לא | לא | לא | כן | לא (אבל SDK כבד) |
| שינוי סכמת DB | כן (מעקב URN/המרה) | לא | לא | לא | כנראה | לא |
| זום / pan / מסך מלא | ✅ | ✅ | ✅ | ✅ | דרך PdfJsViewer | ✅ |
| שכבות | ✅ | ✅ | ✅ | חלקי | ❌ (PDF שטוח) | ✅ |
| Layouts / Sheets | ✅ | ✅ | ✅ | ✅ (Sheets) | עמודי PDF | ✅ |
| מדידה | ✅ | ✅ | ✅ | ? | ❌ | ✅ |
| מובייל | ✅ | ✅ | ⚠️ זיכרון | ? | ✅ | ? |
| עברית | **[לא אומת]** | **[לא אומת]** (מיפוי גופנים, RTL לא מתועד) | כנ"ל | **[לא אומת]** | **[לא אומת]** | **[לא אומת]** |
| XREF | ✅ (רק אם הועלו יחד, כ־zip) | ❌ | ❌ | — | ? | ✅ |
| מורכבות פיתוח | גבוהה | בינונית | בינונית | בינונית + סיכון משפטי | בינונית | גבוהה מאוד |

---

## 4. יכולות צפייה מול הדרישות (לפתרון המועדף B1)

| יכולת | דרישה | B1 | הערה |
|---|---|---|---|
| פתיחה מתוך תיקיית הפרויקט | חובה | ✅ | אותו דיאלוג ואותו route |
| צפייה ללא הורדה | חובה | ✅ | הבתים נטענים לזיכרון הדפדפן ולא נשמרים כקובץ. כמו ב־PDF, משתמש מורשה עדיין יכול לשמור את הקובץ דרך הדפדפן |
| זום והזזה | חובה | ✅ | wheel, pinch, pan |
| מסך מלא | חובה | ✅ | אותו דפוס `requestFullscreen` של PdfJsViewer |
| עברית בשרטוט | חשובה מאוד | ⚠️ | **הסיכון המרכזי.** צריך חבילת גופן עברי (למשל Noto Sans Hebrew, OFL) עם מיפוי ל־SHX עבריים נפוצים. כיוון הטקסט לא מתועד |
| Layers | רצויה | ✅ | `cad-simple-ui-plugin` |
| Layouts / Sheets | רצויה | ✅ | Paper space נתמך, Viewports עדיין לא |
| מדידת מרחקים | רצויה | ✅ | מרחק, שטח, זווית. דיוק תלוי ב־INSUNITS של השרטוט |
| מובייל וטאבלט | חובה | ✅ / ⚠️ | נתמך, אבל קבצים גדולים עלולים לחרוג מזיכרון במכשירים חלשים |
| שמירה על המקור | חובה | ✅ | קריאה בלבד. אין שום כתיבה חזרה לספק |
| עריכה | לא נדרשת | — | ה־viewer כולל עריכה, ויש להשבית את פקודות העריכה והשמירה |

**סיכונים טכניים ספציפיים:**
- **SHX חסרים:** גופני SHX מותאמים של משרדים ישראליים לא יהיו זמינים, ויוצג גופן חלופי. אפשר לבנות חבילת גופנים ארגונית בעתיד.
- **XREF:** לא נתמך. שרטוט שמבוסס על XREF יוצג חלקי. צריך להציג הודעה למשתמש.
- **קנה מידה:** מדידה נכונה רק אם יחידות השרטוט מוגדרות.
- **קבצים גדולים:** אין Range. כל צפייה מורידה את הקובץ המלא דרך Vercel. מומלץ גבול (למשל 50MB) ומעבר מעליו ל"פתח במכשיר".

---

## 5. אבטחה, אחסון ועלויות

| שאלה | B1 (מומלץ) | A (APS) |
|---|---|---|
| הקבצים נשארים אצל הספק המקורי? | ✅ כן | ❌ עותק ב־Autodesk |
| שירות חיצוני שומר עותק? | לא | כן. נגזרות ללא הגבלת זמן עד מחיקה |
| מפתחות API | לא. המפענח הקנייני מותקן מ־GitHub Packages הפרטי בזמן build (טוקן CI) | כן (Client ID/Secret) |
| שימוש מסחרי חוקי | ✅ עם המפענח הקנייני. DXF בלבד חוקי גם בלעדיו | ✅ |
| שירות עיבוד מתמשך | לא | כן |
| עקיפת הרשאות | **לא.** משתמש באותו route ובאותן בדיקות (`DOCUMENTS_READ`, scope, תיקייה סמנטית) | סיכון. טוקן Viewer אינו מבודד לארגון |
| השפעה על Vercel | כל פתיחה מזרימה את הקובץ המלא דרך Function ב־dub1. זיכרון stream נמוך, ותעבורה (Fast Origin Transfer) כגודל הקובץ לכל צפייה. Function יכולה להחזיר יותר מ־4.5MB רק ב־streaming, וכך ה־route עובד היום | העלאה אחת ל־OSS לכל גרסה, ותור/polling |
| עלות לפי קבצים/צפיות | $0 לצפייה. רק תעבורת Vercel | ~$1–3 לגרסת קובץ **[לא אומת]**. צפייה חינם |

**לא ניתן להציג אף פתרון DWG כ"חינמי" בלי סייג:** המסלול החינמי ל־DWG (LibreDWG) הוא GPL-3.0. DXF בלבד הוא חינמי ומסחרי (MIT) באופן מאומת.

---

## 6. בדיקה טכנית בפועל

- **לא נמצאו קובצי CAD ב־workspace** (חיפוש `**/*.{dwg,dwf,dwfx,dxf}` החזיר 0 תוצאות).
- **לא בוצעה בדיקה מעשית** של אף ספרייה, ולא הותקנו חבילות.
- **כל טענות התאימות בדוח הן לפי תיעוד הספקים**, למעט מיפוי הקוד שאומת בקריאה ישירה.
- מומלץ להריץ POC ממוקד לפני החלטת רכישה: 10–20 שרטוטים אמיתיים של החברה (עברית, SHX, XREF, Layouts, קבצים גדולים, גרסאות AutoCAD שונות), בדמו הציבורי של mlightcad ובגרסת ה־trial של המפענח הקנייני, במחשב ובטלפון.

---

## 7. המלצה

### המלצה ראשית: B1 — mlightcad `cad-simple-viewer` בדפדפן

- **DXF:** מיד, ברישיון MIT וללא עלות.
- **DWG:** עם **המפענח הקנייני** ($3,000 חד־פעמי). ההחלטה תתקבל רק אחרי POC על שרטוטים אמיתיים בגרסת ה־trial. **לא** להשתמש ב־LibreDWG (GPL) בלי חוות דעת משפטית.
- **DWF/DWFX:** בגרסה הראשונה **ללא viewer**. ההודעה הקיימת "לא נתמך" תוצג עם "פתח במכשיר" ו"פתח אצל הספק". שלב שני ייבחר לפי נתוני שימוש:
  - אם DWF נדיר: להשאיר כך.
  - אם DWF נפוץ: APS כ־**opt-in לכל ארגון** (הארגון מאשר במפורש שליחה ל־Autodesk, ועם proxy לנגזרות), או CloudConvert להמרה ל־PDF.

**נימוק:** עומד בכל העקרונות המחייבים (אין אחסון נוסף, הקובץ לא נשלח לצד שלישי, ההרשאות הקיימות נשמרות, אין SQL, PDF לא משתנה). עלות חד־פעמית וידועה. ואין שירות שוטף.

---

## 8. רכיבים וקבצים שישתנו בעתיד (לא לבצע כעת)

**חובה לגרסה ראשונה:**
1. `src/modules/documents/domain/file-rules.ts`: פונקציה **חדשה** `isBrowserPreviewableCadFile(filename)` / `cadPreviewKind()` לפי סיומת. **לא** לשנות את `isBrowserPreviewableMime`.
2. `src/modules/external-storage/ui/storage-file-preview-dialog.tsx`: זיהוי CAD לפי סיומת לפני `inferMimeType`, ענף `showCad` עם `dynamic(() => import('./cad-viewer'), { ssr:false })`, וצירוף CAD ל־`previewableSiblings`.
3. **חדש:** `src/modules/external-storage/ui/cad-viewer.tsx` (+ `cad-viewer-utils.ts`): טעינת הבתים מ־`buildStorageFileDownloadUrl`, toolbar (התאמה למסך, זום, מסך מלא, שכבות, Layouts, מדידה), timeout, Retry, ומגבלת גודל.
4. `public/`: worker ו־wasm של mlightcad (`mtext-renderer-worker.js`, worker של המפענח), וחבילת גופנים עבריים (רישיון OFL).
5. `vercel.json`: header של cache לקבצי worker/wasm/fonts (כמו `pdf.worker.min.mjs`).
6. `package.json`: `@mlightcad/cad-simple-viewer`, `@mlightcad/data-model`, `@mlightcad/cad-simple-ui-plugin`, `three`, ובשלב DWG גם `@mlightcad/dwg-converter`, כולל הגדרת registry פרטי ב־CI.
7. `src/locales/{he-IL,en,ar,ru}/externalStorage.json`: מפתחות `preview.cad.*` (שכבות, Layouts, מדידה, "XREF לא מוצג", "גופן חסר", "קובץ גדול מדי").
8. בדיקות unit לפונקציית הזיהוי החדשה.

**אופציונלי / החלטה נפרדת:**
- `file-rules.ts` → `EXT_TO_MIME` / `ALLOWED_MIME_EXACT`: לאפשר **העלאה** של dwg/dxf/dwf ממנהל קבצי הפרויקט (היום נחסם), כולל החלטה על מגבלת 25MB.
- `src/modules/project-plans/application/manage-drawings.ts` (`assertDrawingFile`) + `ui/revision-upload-form.tsx`: לאפשר DWG ברישום השרטוטים.
- אייקון קובץ CAD ברשימות (`project-files-tab.tsx`, `company-files-tab.tsx`, `employee-project-files-browser.tsx`).

**ללא שינוי:** `browser-download/route.ts`, שירותי ה־browser, ה־adapters, DB, הרשאות, `PdfJsViewer`.

---

## 9. הערכת מורכבות ותכולת גרסאות

| שלב | תכולה | מורכבות |
|---|---|---|
| **POC (לפני פיתוח)** | בדיקת שרטוטים אמיתיים בדמו ובגרסת ה־trial. ספירת קובצי DWF בפועל | נמוכה |
| **גרסה 1** | DXF + DWG (מפענח קנייני), זום, pan, מסך מלא, שכבות, מעבר Layouts, מובייל, גופן עברי חלופי, מגבלת גודל, הודעות XREF וגופן חסר | **בינונית** |
| **גרסה 1 (DXF בלבד, אם אין רכישה)** | אותו דבר בלי DWG | נמוכה–בינונית |
| **גרסה 2** | מדידה עם יחידות, חבילת SHX ארגונית, העלאת CAD למנהל הקבצים ולרישום השרטוטים, תמונות ממוזערות | בינונית |
| **גרסה 3 (אם נדרש)** | DWF/DWFX דרך APS כ־opt-in לארגון, או המרה ל־PDF | **גבוהה** |

**להשאיר להמשך:** DWF/DWFX, XREF, ייצוא ל־PDF, הערות וסימונים על שרטוט, השוואת גרסאות.

---

## 10. החלטות נדרשות מהבעלים

1. אישור POC עם שרטוטים אמיתיים (ובקשת trial של המפענח הקנייני בשם החברה).
2. אחרי ה־POC: האם לרכוש את המפענח הקנייני ל־DWG ($3,000), או להתחיל ב־DXF בלבד.
3. האם DWF/DWFX נפוצים מספיק כדי להצדיק בהמשך שליחה ל־Autodesk (APS) כ־opt-in.
4. האם לאפשר העלאת קובצי CAD ממנהל הקבצים (היום חסום).

---

## מקורות (נבדקו 2026-10-15)

- mlightcad/cad-viewer — README, FAQ, PROPRIETARY-PARSER (github.com/mlightcad/cad-viewer, cad-viewer.readthedocs.io)
- mlightcad/mtext-renderer — font loading / fallback
- flyfish-dev/dwf-viewer, flyfish-dev/cad-viewer — AGPL-3.0-only
- Autodesk Flex (autodesk.com/buying/flex), APS Business Model Evolution (aps.autodesk.com/blog), APS DevCon 2026 workshop (OSS retention), APS Terms of Service
- Open Design Alliance pricing 2026 (opendesign.com/pricing)
- CloudConvert pricing / privacy
- Vercel Functions limits (vercel.com/docs/functions/limitations)
