# ProjectFlow — CAD Preview: בדיקת פתרונות חינמיים (CodeCAD ל־DWG, APS Viewer Local ל־DWF)

**תאריך:** 2026-10-15
**המשך של:** `docs/audits/CAD_DWG_DWF_PREVIEW_FEASIBILITY_2026-10.md`
**סוג:** מחקר וניסוי מבודד. **לא** שונו `package.json`, קוד מוצר או DB. לא בוצעו commit, push, deploy או SQL.

מקרא:
- **[נבדק בפועל]**: הורץ בדפדפן על קבצים ציבוריים, ויש צילום או פלט.
- **[קוד]**: אומת בקריאת קוד המקור של הספרייה או של קובץ ה־JS שהספק מגיש.
- **[תיעוד]**: לפי תיעוד או README בלבד.

---

## 0. תקציר

| | DWG — CodeCAD | DWF/DWFX — APS Viewer Local |
|---|---|---|
| עובד בפועל? | **חלקית.** גאומטריה תקינה ב־R2000 עד R2018. **עברית לא מוצגת**, רק Model Space, ו־R14 נכשל בשקט | **כן.** DWF ו־DWFX נטענו והוצגו, כולל מעבר בין Sheets |
| הקובץ נשאר אצלנו? | כן. נטען כ־bytes בדפדפן, ללא העלאה | **כן.** הקובץ נטען מהשרת שלנו ופוענח בדפדפן. מ־Autodesk נטען רק קוד ה־Viewer |
| עלות | $0 | $0 (ה־Viewer אינו API בתשלום. אין Model Derivative) |
| שימוש מסחרי | מותר (MIT + MPL-2.0) | מותר לפי תנאי APS, בתנאי שה־JS נטען מ־CDN של Autodesk |
| רישיון מסחרי נדרש? | לא | לא. חשבון Autodesk נדרש לפי התנאים, אבל טכנית לא נדרשו טוקן או מפתח |
| בשל לייצור? | **לא** | **כן, עם הסתייגויות** (ההרחבה "ישנה ולא מתעדכנת", יש טלמטריה, ויש תלות ב־CDN) |

**המלצה אחת:** לשלב **APS Viewer במצב Local (`Autodesk.DWF`) ל־DWF/DWFX בלבד**, בגרסה ראשונה ובלי עלות. **לא** לשלב את CodeCAD ל־DWG בשלב זה. החלטת DWG (מפענח mlightcad המסחרי, או המתנה) נשארת פתוחה, ותתקבל אחרי בדיקה על שרטוטים אמיתיים בעברית. פירוט בסעיף 5.

---

## 1. DWG — CodeCAD (`github.com/backkem/codecad`)

### 1.1 מה הפרויקט **[קוד]**
- Rust → WASM. ריפו נוצר ב־2026-06-03, release יחיד `v0.1.0` (2026-07-27), push אחרון 2026-10-13. 5 כוכבים, מפתח עיקרי אחד.
- **רישיון: MIT** (`Cargo.toml` → `license = "MIT"`).
- פענוח DWG דרך **`acadrust` ‏0.3** (crates.io: **MPL-2.0**). הגרסה העדכנית של acadrust היא 0.6.4, כלומר CodeCAD מפגר אחריה.
- רינדור: Vello (WebGPU) עם fallback ל־egui (CPU).
- **לא מפורסם ב־npm ולא ב־crates.io** (נבדק: 404). שילוב מחייב build מקוד מקור (Rust, ‏`wasm-bindgen-cli`, ‏pnpm, ‏just) והעתקת `cadview-web.js` ו־`cadview-web_bg.wasm` ל־`public/`.

### 1.2 התאמה ל־Next.js ול־ArrayBuffer **[קוד + נבדק בפועל]**
- יש build ייעודי להטמעה (`web/vite.embed.config.ts`): Web Component בשם `<codecad-viewer>` עם Shadow DOM.
- ה־API לטעינה: `session_load_dwg(sessionId, Uint8Array)` (ב־`web/src/embed.ts`), ובדמו `cad.sessions.loadDwgBytes(sid, bytes)`.
- **נבדק בפועל:** קובץ נמשך ב־`fetch` והוזן כ־`Uint8Array`, ונטען והוצג. כך בדיוק ייראה שילוב עם `/api/org-storage/browser-download`.
- הרכיב רץ רק ב־client, ובפועל נדרש `dynamic(..., { ssr:false })` או Web Component שנטען אחרי mount. אין דוגמת React או Next.js רשמית.
- **כל התהליך בדפדפן:** כן. ברשת נראו רק טעינת ה־WASM ומשיכת הקובץ, בלי שום העלאה **[נבדק בפועל]**.

### 1.3 רישוי **[קוד + תיעוד]**
- **MIT** (CodeCAD): מותר לשימוש מסחרי סגור, בתנאי שמירת הודעת זכויות היוצרים.
- **MPL-2.0** (acadrust): copyleft ברמת הקובץ. שימוש כתלות בלי שינוי מותר במוצר סגור. בהפצה (ה־WASM נשלח לדפדפן) צריך לציין היכן זמין קוד המקור של קובצי ה־MPL, וקישור ל־upstream מספיק. **אם משנים קבצים של acadrust, חובה לפרסם את השינויים באותם קבצים.**
- תלויות נוספות בבינארי: vello, wgpu, egui (MIT/Apache-2.0), וגופן RobotoMono (OFL). לא נמצאו GPL או AGPL בתלויות הישירות. **לא בוצע audit מלא של עץ התלויות.**

### 1.4 ניסוי מעשי **[נבדק בפועל]**

**סביבה:** הדמו הסטטי הרשמי של הפרויקט (`backkem.github.io/codecad/app/`), שמריץ אותו קוד WASM. ניסיון להריץ את בינארי Windows ‏v0.1.0 (SHA256 אומת) נכשל, כי פורט 8765 תפוס במחשב על ידי אפליקציה אחרת ואין לבינארי אפשרות לשנות פורט. הבינארי נמחק בסיום.

**קבצים:** קובצי בדיקה ציבוריים מ־`LibreDWG/libredwg/test/test-data` (שרטוטי דוגמה, לא קבצי לקוחות).

| קובץ | גרסת פורמט | גודל | זמן פענוח | ישויות | תוצאה |
|---|---|---|---|---|---|
| example_r14.dwg | AC1014 (R14) | 430KB | 60ms | **0** | **נכשל בשקט**: אין שגיאה ואין תוכן, למרות שה־README מצהיר על R13+ |
| example_2000.dwg | AC1015 | 569KB | 31ms | 390 | ✅ |
| example_2007.dwg | AC1021 | 445KB | 13ms | 390 | ✅ |
| example_2013.dwg | AC1027 | 143KB | 26ms | 390 | ✅ |
| example_2018.dwg | AC1032 | 146KB | 27ms | 390 | ✅ הוצג: קווים, אליפסה, קשתות, פוליגונים, hatch, טקסט |
| sample_2018.dwg | AC1032 | 19KB | 2ms | 6 | ✅ (2 שכבות) |

**בדיקת עברית:** הוספתי טקסט דרך ה־API של הרינדור (`cad.addText`):
- `ABC 123 English`: הוצג.
- `שלום עולם - תוכנית קומה`: **רק "-" הוצג. כל האותיות העבריות נעלמו.**
- `קומה 2 / Floor 2`: הוצג רק `2 / Floor 2`.

**הסיבה [קוד]:** `crates/cadview-core/src/text.rs` משתמש בגופן יחיד מוטמע (`RobotoMono.ttf`), שאין בו גליפים עבריים. אין fallback, אין shaping ואין BiDi/RTL, ואין טעינת SHX או TTF חיצוניים. זה אותו מסלול שממיר טקסט מתוך DWG לגאומטריה (README: "MText/Text → skrifa glyph outlines"). **לכן כל טקסט עברי בשרטוט DWG יוצג ריק.** ההסקה מבוססת קוד ובדיקת ה־API, כי לא נמצא קובץ DWG ציבורי עם עברית לבדיקה ישירה.

**גודל:** WASM של 8.2MB בהעברה (gzip) ו־23MB אחרי פריסה, בכל פתיחה ראשונה של המציג.

### 1.5 יכולות מול הדרישות

| יכולת | מצב | מקור |
|---|---|---|
| זום והזזה | ✅ | נבדק בפועל |
| שכבות (הצגה והסתרה) | ✅ כפתור Layers ו־`setLayerVisible` | נבדק בפועל (UI) + קוד |
| **עברית** | ❌ לא מוצגת | נבדק בפועל + קוד |
| **Layouts / Paper Space** | ❌ רק Model Space. ב־`build_document` נלקחים רק `*Model_Space` ובלוקים רגילים, ובלוקים שמתחילים ב־`*` (כולל `*Paper_Space`) מסוננים | קוד (`dwg.rs`) |
| XREF | ❌ אין טיפול | קוד |
| מדידה | ⚠️ רק דרך API (`cad.distance`), בלי כלי UI בדמו | קוד + דמו |
| גרסאות AutoCAD | R2000 עד R2018 עבדו. R14 נכשל. לא נבדקו קבצים שנשמרו ב־AutoCAD 2019 ומעלה (אותו פורמט AC1032) | נבדק בפועל |
| מסך מלא | אפשרי דרך מעטפת ProjectFlow | — |
| מובייל | WebGPU או fallback ל־CPU. לא נבדק במובייל | לא נבדק |

### 1.6 מורכבות ותחזוקה
- **גבוהה.** אין חבילה מוכנה, וצריך build של Rust/WASM ב־CI (Vercel build לא כולל Rust כברירת מחדל). אחר כך עטיפה של Web Component ב־React, UI משלנו לשכבות ולמסך מלא, ומעקב ידני אחרי פרויקט בשלב 0.1 עם מפתח אחד.
- תיקון עברית, Paper Space ו־R14 יחייב **fork ופיתוח ב־Rust** (גופן fallback עברי, BiDi, ייבוא Layouts). זו עבודה משמעותית מחוץ ל־stack של ProjectFlow.

**מסקנה ל־DWG:** CodeCAD **לא מתאים לייצור** כרגע, בגלל עברית חסרה (קריטי לשוק הישראלי), היעדר Layouts, בשלות נמוכה ושילוב כבד. כדאי לעקוב אחריו לעתיד.

---

## 2. DWF / DWFX — APS Viewer במצב Local (`Autodesk.DWF`)

### 2.1 האם ההרחבה עדיין זמינה? **[קוד — נבדק על הקבצים שהספק מגיש היום]**
- `viewer3D.min.js` הנוכחי הוא **LMV v7.130.0, ‏Copyright 2026**.
- בקוד קיימת טבלת מיפוי: `{pdf:"Autodesk.PDF", dwf:"Autodesk.DWF", dwfx:"Autodesk.DWF", rcp:..., gltf:..., glb:...}`. **DWFX ממופה לאותה הרחבה. DWG ו־DXF לא קיימים במצב Local.**
- `extensions/DWF/DWF.min.js` (כ־0.9MB, v7.130.0) זמין ב־CDN.

### 2.2 טעינה בלי העלאה לענן **[נבדק בפועל]**
דף בדיקה מבודד (`.tmp/cad-poc/dwf-test/index.html`, תיקייה ב־`.gitignore`) עם `Autodesk.Viewing.Initializer({ env: 'Local' })`, בלי טוקן, בלי Client ID ובלי חשבון. הקובץ נמשך ב־`fetch` משרת מקומי, הומר ל־Blob URL ונטען עם `loadModel`. זה בדיוק המסלול שיעבוד מול `browser-download`.

| קובץ (דוגמאות Autodesk ציבוריות) | גודל | תוצאה |
|---|---|---|
| blocks-and-tables.dwf (DWF 2D) | 99KB | ✅ הוצג במלואו (תוכניות קומה, טבלאות, כותרות) בכ־2.3–4.8 שניות כולל טעינת ה־Viewer |
| autodesk-floor-plans.dwfx (DWFX, ‏2 תצוגות 3D ו־20+ Sheets דו־ממדיים) | 17MB | ✅ נטען בכ־15 שניות (תצוגת 3D ראשונה). **מעבר ל־Sheet "A03 – FIRST FLOOR PLAN"** דרך `loadDocumentNode` עבד (כ־14 שניות) |
| מצב טלפון (אמולציה של 390px) | — | ✅ השרטוט הוצג. מגע במכשיר אמיתי לא נבדק |

**כלים שהופיעו ב־toolbar המובנה:** מדידה, הגדרות, מאפיינים, מסך מלא, עץ מודל, ו־Camera/Orbit בתלת־ממד.

### 2.3 תעבורת רשת בזמן הבדיקה **[נבדק בפועל, דרך Resource Timing]**

| דומיין | מה נטען |
|---|---|
| `127.0.0.1` (השרת שלנו) | **קובץ ה־DWFX עצמו בלבד** (16.9MB) |
| `developer.api.autodesk.com` | `viewer3D.min.js`, ‏`lmvworker.min.js`, CSS, מחרוזות, תמונות UI (קוד ה־Viewer בלבד) |
| `fonts.autodesk.com` | גופני UI |
| `api-js.mixpanel.com` | **3 קריאות `/track`**: טלמטריית שימוש של Autodesk |

- **לא נצפתה העלאה של הקובץ** לשום דומיין חיצוני.
- **טלמטריה:** ה־Viewer שולח אירועי שימוש ל־Mixpanel כברירת מחדל. ב־API קיימים `Autodesk.Viewing.Private.analytics.disableForPage()` ו־`optOut()` **[קוד]**. האם כיבוי הטלמטריה מותר ומה בדיוק נשלח (שם קובץ? מטא־דאטה?) **לא נבדק**, וצריך לבדוק לפני ייצור.

### 2.4 שימוש מסחרי ותנאים **[קוד + תיעוד]**
- **הסתירה בין התיעוד הישן לעדכני נבדקה, והיא קיימת:**
  - כותרת הרישיון ב־Viewer v7.6 עד v7.39 (2019–2021): *"The Autodesk Forge viewer can only be used to view files generated by Autodesk Forge services. The Autodesk Forge Viewer JavaScript must be delivered from an Autodesk hosted URL."* כלומר, לכאורה אסור לצפות בקבצים מקומיים.
  - כותרת הרישיון ב־**v7.130.0 (2026, הגרסה המוגשת היום):** *"Autodesk Viewer SDK Usage Limitations: The Autodesk Viewer SDK JavaScript must be delivered from an Autodesk-hosted URL."* **סעיף "רק קבצים שנוצרו בשירותי Autodesk" הוסר.**
  - הבלוג מ־2021 (Viewer 7.36) מתאר טעינה מקומית של DWF ו־PDF, והוא תואם לרישיון הנוכחי.
- **APS Developer Terms (סעיף 6.1):** מעניקים זכות "to internally develop Your Applications ... and to distribute, test, evaluate, operate and support Your Applications". מסחרי מותר. **אסור** לארח את ה־SDK עצמו, לשנות אותו, לבצע לו reverse engineering, או לבנות מוצר מתחרה ל־APS.
- **חשבון:** סעיף 3 בתנאים: "To access Developer Offerings, You will need to create an Autodesk account". **טכנית** מצב Local עבד בלי טוקן או מפתח. ההמלצה היא לפתוח חשבון Autodesk ו־APS (Free tier) כדי להיות מכוסים חוזית. **לא נדרש תשלום**: ה־Viewer אינו API מתומחר, ורק Model Derivative מתומחר.
- **הסתייגות רשמית של Autodesk:** תשובת צוות APS ב־Stack Overflow (2023): *"The DWF Extension is an older tool and is not being updated. The best approach is to use the Model Derivative API where DWF is fully supported."* ההרחבה זמינה ועובדת, אבל **אין התחייבות לתחזוקה**. דוגמה: הערות (annotations) תלת־ממדיות ב־DWF לא מוצגות.

### 2.5 יכולות מול הדרישות

| יכולת | מצב | מקור |
|---|---|---|
| פתיחה מתיקיית הפרויקט (bytes מה־route הקיים) | ✅ | נבדק בפועל (Blob) |
| צפייה ללא הורדה | ✅ | נבדק בפועל |
| זום והזזה | ✅ | נבדק בפועל |
| מסך מלא | ✅ (כפתור מובנה) | נבדק בפועל (UI) |
| Sheets / Layouts | ✅ רשימה מלאה ומעבר בין Sheets | נבדק בפועל |
| מדידה | ✅ (כלי מובנה, כפתור במסך) | נבדק בפועל (UI). דיוק לא נבדק |
| Layers | ⚠️ תלוי בתוכן ה־DWF. לא נבדק | לא נבדק |
| עברית | ❓ אין קובץ DWF ציבורי עם עברית. ב־DWF הטקסט נשמר לרוב כגאומטריה או עם גופן מוטמע, ולכן הסיכון נמוך יותר מ־DWG, **אבל לא הוכח** | לא נבדק |
| מובייל | ✅ הוצג באמולציה. מגע לא נבדק | חלקי |
| קבצים גדולים | 17MB → כ־15 שניות. מעבר Sheet מפענח מחדש (כ־14 שניות) | נבדק בפועל |

### 2.6 משמעות ל־ProjectFlow
- הקובץ עובר כמו היום: ספק האחסון → `browser-download` (הרשאות קיימות) → הדפדפן. **אין אחסון נוסף ואין העברה ל־Autodesk.**
- תלות חיצונית: הדפדפן טוען כ־4.3MB JS מ־CDN של Autodesk (`viewer3D.min.js` כ־3.4MB ו־DWF כ־0.9MB) בפתיחה הראשונה. אם ה־CDN לא זמין, תצוגת DWF לא תעבוד, ויש להציג "פתח במכשיר" כ־fallback.
- אין כיום CSP במערכת, ולכן טעינת סקריפט חיצוני אפשרית. אם יוגדר CSP בעתיד, יהיה צורך לאשר את `developer.api.autodesk.com`, ‏`fonts.autodesk.com`, ‏`api-js.mixpanel.com` (או לכבות טלמטריה) ו־`blob:`.

---

## 3. מה נבדק בפועל ומה מגובה בתיעוד בלבד

| טענה | נבדק בפועל | קוד | תיעוד בלבד |
|---|---|---|---|
| CodeCAD פותח DWG ‏R2000–R2018 מ־ArrayBuffer בדפדפן | ✅ | | |
| CodeCAD נכשל בשקט על R14 | ✅ | | |
| CodeCAD לא מציג עברית | ✅ (API) | ✅ | |
| CodeCAD מציג רק Model Space | | ✅ | |
| CodeCAD ללא XREF | | ✅ | |
| רישוי MIT / MPL-2.0 | | ✅ (Cargo, crates.io) | |
| APS Local פותח DWF מ־Blob ללא טוקן | ✅ | | |
| APS Local פותח DWFX ומעבר Sheets | ✅ | | |
| הקובץ לא נשלח ל־Autodesk | ✅ (Resource Timing) | | |
| טלמטריית Mixpanel פעילה כברירת מחדל | ✅ | ✅ | |
| רישיון ה־Viewer הנוכחי מסיר את מגבלת "קבצים מ־Autodesk" | | ✅ (כותרת v7.130.0) | |
| שימוש מסחרי מותר | | | ✅ (Developer Terms 6.1) |
| חשבון Autodesk נדרש חוזית | | | ✅ (סעיף 3) |
| ההרחבה לא מתעדכנת | | | ✅ (תשובת צוות APS) |
| עברית ב־DWF | ❌ לא נבדק | | |
| מגע במכשיר נייד אמיתי | ❌ לא נבדק | | |

---

## 4. ריכוז התשובות

| שאלה | DWG (CodeCAD) | DWF/DWFX (APS Local) |
|---|---|---|
| עובד בפועל? | גאומטריה כן. עברית, Layouts ו־R14 לא | כן, כולל DWFX ו־Sheets |
| מגבלות | עברית ריקה, Model Space בלבד, ללא XREF, ‏23MB WASM, אין npm, פרויקט 0.1 | הרחבה ללא תחזוקה פעילה, תלות ב־CDN, טלמטריה, עברית לא נבדקה, קבצים גדולים איטיים |
| שימוש מסחרי | מותר | מותר, עם JS מ־CDN של Autodesk ובכפוף ל־Developer Terms |
| הקבצים נשארים באחסון החברה? | כן | כן |
| עלויות | $0 (אבל עלות פיתוח ב־Rust גבוהה) | $0 |
| רישיון מסחרי נדרש? | לא | לא. חשבון Autodesk (חינמי) מומלץ ונדרש חוזית |

---

## 5. המלצה

**לשלב בגרסה ראשונה: APS Viewer במצב Local עם `Autodesk.DWF`, ל־DWF ו־DWFX בלבד.**
- עובד בפועל, בלי עלות, בלי העברת קבצים, ועם ה־route וההרשאות הקיימים. נותן זום, מסך מלא, Sheets ומדידה.
- תנאים לפני מימוש:
  1. פתיחת חשבון Autodesk ו־APS (Free tier) על שם החברה. אין עלות.
  2. בדיקה מה נשלח ל־Mixpanel, והחלטה אם לכבות טלמטריה (`disableForPage`).
  3. בדיקה על 3–5 קובצי DWF אמיתיים עם עברית, באישור מפורש.
  4. fallback של "פתח במכשיר" אם ה־CDN לא זמין או אם הטעינה נכשלת.
- מורכבות: **נמוכה–בינונית**. רכיב client חדש לצד `PdfJsViewer`, עם טעינת script דינמית, וענף בדיאלוג `StorageFilePreviewDialog` לפי סיומת. PDF לא משתנה.

**DWG — לא לשלב את CodeCAD.** ההחלטה על DWG נשארת מהדוח הקודם: בדיקה של mlightcad עם המפענח המסחרי ($3,000) בגרסת trial על שרטוטים אמיתיים בעברית, או דחייה של DWG והשארת "פתח במכשיר / אצל הספק". DXF אפשר להוסיף בחינם דרך mlightcad (MIT), גם אם DWG נדחה.

**אין להתחיל פיתוח לפני אישור הבעלים.**

---

## 6. נספח — ניסוי

- תיקייה מבודדת: `.tmp/cad-poc/` (כלולה ב־`.gitignore`). נשארו `dwf-test/index.html` ו־`samples/` (קובצי דוגמה ציבוריים). בינארי CodeCAD נמחק.
- מקורות הדוגמאות: `LibreDWG/libredwg/test/test-data/*.dwg` (קובצי בדיקה ציבוריים), ‏`flyfish-dev/dwf-viewer/examples/*.dwf(x)` (דוגמאות Autodesk שפורסמו בריפו ציבורי). לא נעשה שימוש בקבצי לקוחות.
- שרתים מקומיים הופעלו ונסגרו בסיום. לא נגעתי באפליקציה האחרת שרצה על פורט 8765.
- `git status`: אין שינוי בקבצי מוצר. נוספו רק קובצי הדוחות תחת `docs/audits/`.
