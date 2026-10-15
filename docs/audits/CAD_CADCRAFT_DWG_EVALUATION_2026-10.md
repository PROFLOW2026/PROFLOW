# ProjectFlow — בדיקת CADCraft כפתרון DWG חינמי

**תאריך:** 2026-10-15
**גרסה שנבדקה:** CADCraft **v0.7.0** (release רשמי מ־2026-10-14, הגרסה העדכנית). ‏`cadcraft-web-0.7.0.zip` ו־`cadcraft-0.7.0-windows-x64-portable.zip` נבדקו מול `SHA256SUMS.txt` ותאמו.
**המשך של:** `CAD_DWG_DWF_PREVIEW_FEASIBILITY_2026-10.md`, ‏`CAD_FREE_OPTIONS_CODECAD_APS_DWF_2026-10.md`
**סוג:** מחקר וניסוי מבודד ב־`.tmp/cad-poc/` (כלול ב־`.gitignore`). לא שונו קוד מוצר, DB או `package.json`. לא בוצעו commit, push, deploy או SQL. לא נעשה שימוש בקבצי לקוחות ולא נשלח דבר לשירות חיצוני.

מקרא: **[נבדק]** = הורץ בפועל, ויש צילום או פלט. **[קוד]** = נקרא בקוד המקור הרשמי. **[תיעוד]** = לפי README או docs בלבד.

---

## 0. תשובות ישירות

| שאלה | תשובה |
|---|---|
| **האם CADCraft מאפשר להציג DWG בחינם?** | **לא בדפדפן.** גרסת ה־WebAssembly **לא קוראת DWG בכלל** **[קוד + נבדק]**. היא מציגה DXF בלבד. הגרסה המקומית (desktop/CLI) כן קוראת DWG היטב ובחינם **[נבדק]**, אבל היא בינארי שרץ על מחשב או שרת, לא בדפדפן |
| **האם עברית עובדת?** | **ב־CLI/desktop כן**: אותיות תקינות וסדר BiDi תקין, כולל מספרים ואנגלית בתוך עברית **[נבדק]**. **בגרסת הדפדפן לא**: האותיות מוצגות כריבועים ריקים, כי אין בה גופן עברי **[נבדק]**. אפשר להוסיף גופן עברי לגרסת הדפדפן רק ב־build עצמי מקוד המקור **[קוד, לא נבדק]** |
| **האם הוא עדיף על CodeCAD?** | **כן, בבירור**, בכל פרמטר שנבדק: קריאת R14, ישויות אמיתיות (מידות, טבלאות, attributes), Layouts, עברית (ב־native), רישוי ובשלות. החיסרון היחיד: ב־CodeCAD ה־WASM כן קורא DWG (אבל בלי עברית) |
| **האם אפשר לשלב אותו בתצוגה הקיימת?** | **לא כמציג DWG בתוך הדפדפן.** כן, באחת משתי דרכים: (א) **DXF בלבד** דרך iframe (`?host=parent`), אבל בלי עברית ועם ממשק עריכה מלא. (ב) **המרת DWG ל־PDF בשרת** עם `cadcraft-cli` והצגה ב־`PdfJsViewer` הקיים. זה **עבד מקומית עם עברית תקינה** **[נבדק]**, אבל לא נבדק על Vercel/Linux |

**שורה תחתונה:** CADCraft לא נותן "מציג DWG בדפדפן בחינם". הוא כן נותן **מנוע המרה DWG→PDF חינמי ומתירני, עם עברית תקינה**, שאפשר להזין ממנו את ה־PDF Viewer הקיים. זה הכיוון החינמי היחיד עד כה שבו DWG ועברית עבדו בפועל.

---

## 1. מה זה CADCraft **[קוד + תיעוד]**

- `github.com/storytold/cadcraft` (צוות ArtCraft). **פרויקט שונה מ־CodeCAD.**
- נוצר ב־**2026-10-07** (8 ימים לפני הבדיקה). כ־5,000 כוכבים. releases כמעט יומיים (v0.3.0 ב־10-08 עד v0.7.0 ב־10-14). מוגדר בעצמו כ־"**early development**".
- Rust טהור. UI ב־egui. רינדור wgpu (WebGPU, ‏fallback ל־WebGL2 או CPU).
- **רישיון: MIT OR Apache-2.0** (קובצי `LICENSE-MIT`, ‏`LICENSE-APACHE`, ‏`NOTICE`).
- DWG נקרא דרך **acadrust 0.6.4 (MPL-2.0)**, כגשר DWG→DXF (`crates/dwg`).

---

## 2. ממצא מרכזי: גרסת הדפדפן לא קוראת DWG

**[קוד]**
- `crates/dwg/Cargo.toml`: ‏`[target.'cfg(not(target_arch = "wasm32"))'.dependencies] acadrust = "0.6.4"`. acadrust **לא נכלל כלל** ב־build של WASM.
- `crates/dwg/src/lib.rs` (wasm32): ‏`Err("DWG files can't be opened in the web build yet; save as DXF")`.
- `docs/gaps.md`: ‏"FF12 DWG in the web build" ו־"P1 Web build: … no DWG", כפריטים פתוחים.
- הסיבה בקוד: "Native targets only (it memory-maps files)".

**[נבדק]** שליחת `example_2018.dwg` ל־iframe הרשמי בפרוטוקול `cadcraft:open`: הקובץ לא נפתח, והאפליקציה נשארה במסך Start.

---

## 3. בדיקת הדרישות

### 3.1 טעינה מ־Blob/ArrayBuffer **[קוד + נבדק]**
- גרסת הדפדפן כוללת מצב הטמעה רשמי: `index.html?host=parent` בתוך iframe, עם פרוטוקול `postMessage` (`apps/cadcraft-web/src/host.rs`):
  - `cadcraft:ready` → הורה שולח `cadcraft:open { name, bytes: ArrayBuffer }`.
  - `cadcraft:save` (הקובץ חוזר להורה, ואפשר להתעלם), ‏`cadcraft:dirty`, ‏`cadcraft:failed`.
  - מאזין רק לחלון ההורה מאותו origin.
- **נבדק:** דף מארח בדיקתי עשה `fetch` → `ArrayBuffer` → `postMessage`, וה־DXF נפתח (ready תוך 336–600ms בשרת מקומי). זה תואם בדיוק את המסלול `browser-download` → bytes.

### 3.2 תצוגת ישויות

**קובץ ניסוי עברי** נבנה מחוץ לקוד המוצר עם `cadcraft-cli` (‏`heb/make_heb.py`). הוא כולל: שכבות WALLS, DOORS, DIMS ו־TEXT_HE; מלבנים; hatch ‏ANSI31; קו וקשת (דלת); עיגול שהוגדר כבלוק `COLUMN` עם 2 INSERT; 2 מידות; TEXT ו־MTEXT בעברית עם מספרים ואנגלית; style ‏Arial; ו־Layout בשם `SHEET_A1` עם viewport. הקובץ נשמר כ־DXF והומר ל־DWG.

| ישות | CLI/desktop (DWG) | דפדפן (DXF) |
|---|---|---|
| קווים, מעגלים, קשתות | ✅ | ✅ |
| בלוקים (INSERT) | ✅ (נשמרים כ־Block Reference) | ✅ |
| Hatch | ✅ | ✅ |
| שכבות וצבעים | ✅ | ✅ (פאנל Layers) |
| מידות | ✅ | ✅ |
| ספרות וטקסט לטיני | ✅ | ✅ |
| **טקסט עברי** | ✅ | ❌ ריבועים ריקים |

**קובצי LibreDWG ציבוריים, R14 עד 2018 [נבדק, CLI]:** כל הגרסאות נקראו, כולל **R14** (ב־CodeCAD נכשל). זוהו 70 ישויות מ־23 סוגים: Dimension ×9, Block Reference ×10, Table, Multileader, Attribute Definition, Wipeout, MLine, Spline, 3D Face ועוד. **5 ישויות Proxy** לא נתמכות. זמן `info`: ‏117–219ms.

**ליקוי שנצפה [נבדק]:** ב־`example_2018.dwg` ה־extents חושבו כ־±2.7 מיליון יחידות בגלל כמה ישויות רחוקות (Ray, Proxy, 3D Face ועוד), ולכן "התאם לשרטוט" הציג אזור ריק. עם חלון ידני השרטוט הוצג במלואו, ובפירוט רב יותר מ־CodeCAD (טקסטים של attributes, מילויים, splines).

### 3.3 עברית
| בדיקה | CLI/desktop (Windows) | דפדפן |
|---|---|---|
| האותיות מוצגות? | ✅ | ❌ (tofu) |
| סדר אותיות ו־BiDi | ✅ תקין: "תוכנית קומה 2", "חדר שינה 12.5 מר / Room A-3" | סדר ה־BiDi מיושם (המספר במקום הנכון), אבל אין גליפים |
| גופן עברי | נלקח מגופני המערכת (Arial וכו'), גם ל־style של stroke font (fallback אוטומטי) | **אין גופני מערכת בדפדפן.** ה־build הרשמי מכיל רק BIZ UDPGothic (יפנית) ו־Noto Sans Arabic |
| אפשר להוסיף גופן? | כן: התקנה במערכת או `CADCRAFT_FONTFALLBACK` | **רק ב־build עצמי**. `crates/fonts/build.rs` מטמיע ב־wasm רק BIZ UDPGothic ופונטים שמסומנים `Arab`. קיימת פונקציה `ttf::register(name, bytes)` ("web builds and tests"), אבל **היא לא חשופה ל־JS** (ה־bindings מייצאים רק `default` ו־`initSync`) **[קוד + נבדק]**. כלומר נדרשים fork ו־Rust build (Rust 1.95, trunk). לא נבדק |
| SHX | לא נקרא. מוחלף בגופן stroke פנימי או ב־FONTALT | אותו דבר |

הערה: הבדיקה נעשתה על טקסט שנוצר ב־CADCraft ונשמר ל־DWG על ידי acadrust. **לא נבדק DWG עברי שנוצר ב־AutoCAD**, כולל קידוד ישן (‏`$DWGCODEPAGE` ‏ANSI_1255) ו־SHX עבריים.

### 3.4 גאומטריה ומספרים בלבד (כשעברית לא עובדת)
**[נבדק]** בדפדפן, עם DXF, הגאומטריה, המידות, הספרות והטקסט הלטיני מוצגים תקין, והעברית בלבד מוחלפת בריבועים. **שימוש חלקי אפשרי טכנית רק ל־DXF.** ל־DWG זה לא רלוונטי בדפדפן, כי DWG לא נפתח בו בכלל.

### 3.5 Layouts ו־Paper Space
- **[נבדק, CLI]** `layout.list` על ה־DWG החזיר את `Layout1`, ‏`Layout2` ו־`SHEET_A1` (A4, viewport ‏`110`). `exportpdf` ל־`SHEET_A1` יצר PDF של Paper Space עם מסגרת viewport, עברית תקינה, hatch ומידות.
- **[תיעוד]** בדפדפן קיימים Layouts, viewports ו־MSPACE/PSPACE. בגרסת הדפדפן "clipped layout viewports stay in the layout's display list" (אין stencil).
- **[לא נבדק]** מעבר Layout בממשק הדפדפן לא הושלם, כי ה־UI מצויר על canvas ואין לו refs לאוטומציה.

### 3.6 מגבלות פענוח DWG **[תיעוד + נבדק]**
- **גרסאות:** R13–2018 (‏AC1012–AC1032). AC1032 הוא גם הפורמט של AutoCAD 2019 עד 2027. ‏`docs/file-format-parity.md`: ‏"2018–2027: via bridge; **untested on real files**". R14 עבד בבדיקה. לפני R13: לא נתמך.
- **הערכה עצמית בפרויקט:** "DWG ≈ 30% read". ‏"**No real-file test corpus**" ("All 36 file tests are synthetic") מוגדר כ־**alpha blocker**.
- **ביצועים:** דיווח #57: ‏"a 10 MB DWG failed after about two minutes", ו־"the throughput problem remains" (alpha blocker FF6). DWG מומר ל־DXF בזיכרון, ביחס של כ־6 (‏10MB DWG ≈ ‏60MB DXF).
- **לא נתמך או נשמט:** proxy entities, ACIS (3DSOLID/BODY), OLE, ‏custom objects, ‏SHX. ‏XREF: נתמך חלקית (#525), ללא עריכה וללא XCLIP.
- **[נבדק]** קבצים קטנים: ‏DWG→PDF ב־0.17–0.38 שניות, עם זיכרון שיא של כ־13–21MB (Windows). **לא נבדק קובץ DWG גדול או מורכב אמיתי.**

### 3.7 מצב צפייה בלבד
- **[קוד]** אין מצב read-only או viewer. גרסת הדפדפן היא אפליקציית CAD מלאה (תפריטים, Tool Sets, פקודות, Properties). פרמטרי URL קיימים רק לרינדור (`?webgl`, ‏`?cpu`, ‏`?sample`) ולהטמעה (`?host=parent`).
- **בטיחות המקור:** במצב `host=parent` כל שמירה חוזרת להורה כ־`cadcraft:save`, וה־iframe לא כותב לשום מקום. ProjectFlow יכול להתעלם מההודעה, והמקור באחסון לא ישתנה **[קוד + נבדק: הודעות save לא נשלחו בבדיקה]**. **אבל המשתמש יראה כלי עריכה** ויוכל לערוך בזיכרון. הסתרת ה־UI מחייבת fork.
- **[לא נבדק]** ממשק בעברית או RTL: לא קיים (L3 ב־gaps).

### 3.8 רישוי מלא **[קוד + נבדק: audit מול crates.io]**
- **CADCraft:** ‏MIT OR Apache-2.0. מותר לשימוש מסחרי סגור. חובה לשמור הודעות `LICENSE` ו־`NOTICE`. המותג ArtCraft (`docs/brand/`) אינו בתוך הרישיון.
- **audit של `Cargo.lock` מול crates.io: ‏484 חבילות.** 16 first-party ו־466 צד שלישי. **כל החבילות מתירניות**, למעט:
  - `acadrust 0.6.4`: **MPL-2.0**. שימוש ללא שינוי, file-level copyleft. **לא נכלל ב־WASM כלל.** בשימוש בשרת (המרה ב־CLI) אין "הפצה" ללקוח, ולכן אין חובות MPL בפועל.
  - `colored 2.2.0`: ‏MPL-2.0 (צבעי טרמינל ב־CLI). אותו דין.
  - רישיונות כפולים (`Apache-2.0 OR GPL-2.0-only`, ‏`MIT OR Apache-2.0 OR LGPL-2.1-or-later`): בוחרים בחלופה המתירנית.
  - גופני egui ברירת מחדל: ‏`(MIT OR Apache-2.0) AND OFL-1.1 AND Ubuntu-font-1.0`, עם חובת attribution.
- **אין GPL או AGPL מחייבים. אין צורך ברכישת רישיון.**

### 3.9 משקל WASM, ‏Vercel, זיכרון וטעינה עצלה **[נבדק]**

| מדד | ערך |
|---|---|
| WASM ‏v0.7.0 | **21.5MB** ללא דחיסה, **8.0MB ב־gzip-9**. ‏`HOSTING.md` מציין "13MB / 5MB", נתון שכבר לא עדכני |
| JS glue | 155KB |
| טעינה מקומית | 337ms להורדת ה־WASM, ‏ready תוך 336–600ms (שרת מקומי. ברשת אמיתית: 8MB לפתיחה ראשונה) |
| JS heap בדפדפן | כ־4MB (ה־WASM linear memory לא נמדד) |
| השפעה על Vercel | קבצים סטטיים ב־`public/` שמוגשים מה־CDN, **בלי Function ובלי CPU**. ‏Cache ‏`immutable` (שמות עם hash). אין צורך ב־COOP/COEP |
| טעינה עצלה | טבעית: ה־iframe נטען רק בפתיחת קובץ CAD. אין השפעה על bundle של Next.js |
| גבול גודל | ‏Cloudflare Pages ‏25MiB/file הוזכר בקוד. ‏Vercel: קובץ סטטי של 21.5MB תקין |

**חלופת שרת (DWG→PDF ב־`cadcraft-cli`):** בינארי CLI ‏Windows ‏53MB (Linux ‏tar.gz של 60MB כולל גם את האפליקציה). נכנס במגבלת 250MB של Vercel Function. **לא נבדק ב־Linux/Vercel**: ‏glibc, גופן עברי (סורק רק `/usr/share/fonts` ו־`~/.fonts`, כך שיש צורך לשתול גופן בזמן ריצה), זמני cold start, וזמן המרה לקבצים גדולים (#57).

---

## 4. השוואה מעשית ל־CodeCAD

| קריטריון | CodeCAD ‏(0.1.0) | CADCraft ‏(0.7.0) |
|---|---|---|
| DWG בדפדפן | ✅ (מ־ArrayBuffer) | ❌ אין |
| DXF בדפדפן | ❌ (DWG בלבד) | ✅ |
| DWG ‏R14 | ❌ נכשל בשקט | ✅ (CLI) |
| ישויות | שטוחות: מידות ובלוקים מפורקים לגאומטריה | מודל מלא: Dimension, ‏Table, ‏MLeader, ‏Attributes, ‏Block Reference |
| עברית בדפדפן | ❌ נעלמת | ❌ ריבועים (BiDi מיושם) |
| עברית native/CLI | ❌ (גופן יחיד בלי עברית) | ✅ תקינה, כולל BiDi |
| Layouts / Paper Space | ❌ רק Model Space | ✅ (נבדק ב־CLI ל־PDF) |
| מצב צפייה בלבד | Web Component פשוט (קרוב לצפייה) | ❌ ממשק עריכה מלא |
| הטמעה | Web Component (build עצמי מ־Rust, אין npm) | **release מוכן** עם iframe ו־postMessage רשמי |
| WASM | 23MB / ‏8.2MB gz | 21.5MB / ‏8.0MB gz |
| רישוי | MIT + ‏MPL (acadrust) | MIT/Apache, ו־MPL רק ב־native |
| בשלות | מפתח יחיד, ‏5 כוכבים | צוות, כ־5K כוכבים, releases יומיים, "early development", עם alpha blockers מוצהרים |
| PDF מ־DWG (שרת) | ✅ (‏printpdf, ללא עברית) | ✅ **עם עברית** |

**מסקנה:** CADCraft עדיף על CodeCAD כמנוע. אבל **אף אחד מהם לא נותן כיום DWG ועברית בתוך הדפדפן.**

---

## 5. אפשרויות שילוב ב־`StorageFilePreviewDialog`

| אפשרות | DWG | DXF | עברית | מקור באחסון | עלות | הערכה |
|---|---|---|---|---|---|---|
| **A. iframe ‏CADCraft web** (`public/cadcraft/` + `?host=parent`, ‏bytes מ־`browser-download`) | ❌ | ✅ | ❌ | ✅ לא נכתב (save ננטש) | $0, CDN בלבד | מתאים רק ל־DXF לטיני. UX כבד (ממשק עריכה מלא) |
| **B. המרת DWG/DXF→PDF בשרת** עם `cadcraft-cli`, ‏stream ל־`PdfJsViewer` הקיים | ✅ | ✅ | ✅ (נבדק מקומית) | ✅ קריאה בלבד מהספק | $0 רישוי. עלות CPU של Function לכל המרה | **הכי מבטיח**. זום, מסך מלא ומובייל קיימים כבר ב־PdfJsViewer. ‏Layouts יוצגו כעמודי PDF. אין שכבות או מדידה אינטראקטיבית |
| C. fork של CADCraft web עם גופן עברי | ❌ (אין DWG) | ✅ | כנראה ✅ | ✅ | זמן פיתוח ב־Rust ותחזוקת fork | לא כדאי כל עוד אין DWG ב־web |

**סיכונים באפשרות B (לא נבדקו):**
- ריצה על Vercel Linux (‏glibc, גודל, cold start).
- גופן עברי בסביבת השרת.
- קבצים גדולים: בעיית throughput מדווחת ב־10MB.
- המרה בכל צפייה ללא cache. ‏cache דורש אחסון נוסף או כתיבה לתיקיית הלקוח, וזו החלטה נפרדת.
- extents שגויים בקבצים עם Ray/XLine, כמו שנצפה.
- פרויקט צעיר מאוד (שבוע), עם ‏"no real-file test corpus".

---

## 6. המלצה

1. **לא לשלב את CADCraft כמציג DWG בדפדפן.** אין לו תמיכת DWG ב־web, והעברית לא מוצגת בו.
2. **לבדוק כ־POC את אפשרות B:** המרת DWG→PDF בשרת עם `cadcraft-cli` (MIT/Apache, ללא רכישה) והצגה ב־`PdfJsViewer` הקיים, בלי שינוי בהתנהגות ה־PDF. זה הנתיב החינמי היחיד שבו DWG ועברית עבדו בפועל.
   - שלבי POC (רק לאחר אישור): הרצת ה־CLI של Linux בסביבה מבודדת דמוית Vercel, עם גופן עברי חינמי (Noto Sans Hebrew, OFL); בדיקה על 5–10 קובצי DWG אמיתיים של החברה **באישור מפורש**; מדידת זמן וזיכרון לקבצים גדולים; החלטה על cache.
3. **DWF/DWFX:** ללא שינוי מהדוח הקודם (APS Viewer במצב Local).
4. **mlightcad עם מפענח מסחרי** נשאר חלופה בתשלום, אם B ייכשל על קבצים אמיתיים או ב־Vercel.

**אין להתחיל פיתוח לפני אישור הבעלים.**

---

## 7. מה נבדק בפועל ומה לא

**נבדק בפועל:**
- הורדה ואימות SHA של v0.7.0.
- טעינת DXF מ־ArrayBuffer דרך iframe ו־postMessage.
- כישלון DWG בדפדפן.
- ריבועים במקום עברית בדפדפן.
- עברית ו־BiDi תקינים ב־CLI, כולל אחרי DWG round-trip.
- קריאת R14–2018.
- Layout ל־PDF עם עברית.
- תצוגת ה־PDF ב־pdf.js (אותו מנוע של PdfJsViewer).
- זמני המרה וזיכרון בקבצים קטנים.
- משקל WASM.
- audit רישוי של 484 חבילות.

**לא נבדק:**
- DWG אמיתי מ־AutoCAD, בעברית או בקידוד 1255.
- קבצים גדולים.
- Linux/Vercel.
- build עצמי עם גופן עברי.
- מעבר Layout בממשק הדפדפן.
- מובייל ומגע.
- WASM linear memory.

**חומרים:** `.tmp/cad-poc/heb/` (קובצי הניסוי, PNG ו־PDF), ‏`cadcraft-host.html`, ‏`pdf-render.html`, ‏`license_audit.json`. הבינאריים וקובצי ה־zip נמחקו בסיום, והשרת המקומי נסגר.
