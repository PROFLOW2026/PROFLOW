# CAD VIEWER COMPLETION — דוח סיום פיתוח

**תאריך:** 16.10.2026  
**סטטוס כולל:** **PARTIAL** (שיפור מהותי; לא כל שלבי התוכנית הושלמו)

---

## CAD VIEWER COMPLETION: **PARTIAL**

---

### 1. שלבים שהושלמו

| שלב | מצב | הערות |
|-----|-----|--------|
| **0** — חוזים, פיצול `lib.rs`, golden harness | **הושלם** | `schemaVersion: 2`, מודולים ב־`pf-cad-wasm`, סקריפטי `compat-report.mjs` / `text-stats.mjs` |
| **1** — דיוק טקסט (WASM + overlay) | **הושלם ברובו** | יישור, MTEXT, ATTRIB, `%%`, סיבוב MTEXT, מטריצת wf/oblique/mirror |
| **2** — צבעים, שכבות, ישויות קלות | **הושלם ברובו** | ACI מלא, שכבה 0, XREF\|layer, Spline, Leader, Point, Table, OCS חלקי |
| **3** — ביצועים | **הושלם חלקית** | מטמון מסמך מארח ב־WASM, תיקון דליפת `add_xref_dep`, חתימת deps ב־Worker |
| **4** — הודעות UI | **הושלם** | באנרים מותנים, 4 שפות, ללא שמות מתחרים, תיקון ספירת XREF |
| **5** — גופנים | **הושלם חלקית** | איתור מתיקייה, `missingFonts`, Noto מקומי, DXF `baseUrl` מקומי, מיפוי מקלדת עברית ל־SHX |
| **6** — Display List v2 (GPU) | **הושלם חלקית** | Hatch: גבול + מילוי SOLID בסיסי כקווים; **אין** ערוץ משולשים WebGL, linetypes, lineweights |
| **7** — Paper Space / Viewports | **לא הושלם** | Viewport עדיין ב־`skipped` |
| **8** — טקסט במנוע (SDF/mesh) | **לא הושלם** | עדיין Canvas2D overlay |
| **9** — MLeader מלא, Raster | **לא הושלם** | MLeader / RasterImage עדיין לא מוצגים |
| **10** — רישוי | **הושלם חלקית** | `docs/OPEN_SOURCE_NOTICES.md`; אין עדיין דף הגדרות in-app |

---

### 2. מה תוקן בטקסטים ובמספרים

**מוכח (WASM + בדיקות):**
- רשומת טקסט v2: `ha`/`va`, נקודות insert/alignment, `wf`, `obl`, `bx`/`by`, MTEXT `att`/`lines`/`r`, ATTRIB עם צבע/שכבה נכונים וסינון invisible.
- פענוח `%%c`, `%%d`, `%%p` וכו': ב־3096-EL נשאר **מחרוזת אחת** עם `%%` מילולי (מ־49); ב־3031-SW **0** (מ־22).
- Overlay: `draw-cad-text.ts` — עיגון לפי cap height (1/0.714), שורות MTEXT, culling, סנכרון עם WebGL אחרי pan/zoom.
- מיפוי עברית מקלדת→Unicode לסגנונות SHX עבריים (`hebrew-shx-decode.ts`).

**לא אומת חזותית מול PDF מקורי** — אין השוואת פיקסלים.

---

### 3. גופנים נתמכים

| מנגנון | מצב |
|--------|-----|
| **איתור** `.shx` / `.ttf` / `.otf` מתיקיית האחסון (אינדקס כמו XREF) | כן |
| **דיווח** `report.fonts` (מפת שם→שימוש) + `missingFonts` אחרי fetch | כן |
| **תצוגה** | Noto Sans Hebrew (OOF, `/pf-cad/fonts/`) + Arial fallback; **אין** רינדור SHX גליפים — רק מטריקה/עברית ממופה |
| **DXF viewer** | `baseUrl: '/pf-cad/fonts/'` — לא CDN צד שלישי |
| **אריזה** | לא נארזו גופנים קנייניים |

---

### 4. צורות וישויות שנוספו / שופרו

| ישות | לפני | אחרי (3096-EL Model, WASM v2) |
|------|------|-------------------------------|
| Hatch | skipped ~1,955 | **rendered 1,955** (גבול + SOLID בסיסי) |
| Spline | skipped | **rendered** |
| Leader | skipped | **rendered** |
| Point | skipped | **rendered** |
| Table (Layout) | skipped | **Table(via block)** ב־Paper Space |
| MultiLeader | skipped | **עדיין skipped** |
| RasterImage | skipped | **עדיין skipped** |
| Viewport | skipped | **עדיין skipped** |

---

### 5. שכבות, צבעים ו־Layouts

- **שכבות:** מקטעים על אינדקס 0 ירדו מ־~97% ל־**194 / 263k** (~0.07%) ב־3096-EL; **257** שכבות בשימוש (מ־25).
- **צבעים:** **41** צבעים שונים (מ־רוב לבן); ByLayer דרך טבלת ACI מלאה.
- **Layouts:** בחירת Model / Layout **עובדת**; תוכן Model **בתוך Viewport ב־Layout לא מוצג** (מסגרת + title block בלבד).

---

### 6. XREF

- **ממשיך לעבוד:** closure מאותה תיקייה, `resolvedXrefs`, ללא `missingBlocks` בשלושת הקבצים.
- באנר XREF חסר: ספירה מתוקנת (`Object.keys(xrefs).length`).

---

### 7. בעיות שנותרו (עדיפות)

1. **Viewports ב־Layout** — חסר; דורש `viewport_content` / clip (M).
2. **MLeader, Raster Image** — לא מוצגים.
3. **Hatch דוגמה** (לא SOLID) — ללא מילוי דוגמה מלא.
4. **Linetypes / Lineweights / Draw order / CTB** — לא מיושמים.
5. **SHX אמיתי** — גליפים קוויים; טקst עברית מוצפן דורש גופן/מיפוי (חלקי).
6. **XCLIP** — לא מיושם.
7. **התאמה חזותית מלאה** — לא הוכרזה (אין PDF מקורי להשוואה).

---

### 8. ביצועים וזיכרון

- WASM: **~4.24 MB** (מ־~4.17 MB).
- מטמון מסמך מארח: מעבר Layout **מהיר יותר** (עשרות–מאות ms ב־Paper Space במדידות Node).
- Worker: דילוג על `clear_xref_deps` כשחתימת deps זהה.
- **לא נמדד** שוב 3621+G1+G2 לשיא זיכרון 450MB; צפוי שיפור מדליפת bytes, לא בהכרח ירידה ב־CadDocument שמור.

---

### 9. תוצאות בדיקות

| בדיקה | תוצאה |
|--------|--------|
| `cad-text-anchor`, `cad-ui-messages`, `pf-cad-wasm-asset` | **10/10** passed |
| Golden `compat-report.mjs` על 3096 / 3621 / 3031 | הורץ; Hatch/Spline/Leader/Point משופרים |
| בדיקת דפדפן על שרטוט אמיתי | **לא בוצעה** במסגרת דוח זה (אין שרת dev מאומת ברקע) — **מומלץ smoke ידני** על Company Files + 3096-EL |

---

### 10. Git ושחרור

- **Commit מקומי:** מומלץ commit ב־`PROFLOW` על: `public/pf-cad/wasm/*`, `src/modules/external-storage/ui/cad/pf-cad/*`, locales, `docs/OPEN_SOURCE_NOTICES.md`, דוח זה.
- **מנוע:** שינויים ב־`projectflow-cad-engine` (מחוץ ל־repo ProjectFlow) — לסנכron ידני / commit נפרד אם יוגדר מאגר מקומי.
- **Push / Deploy:** **לא** — ממתין לאישור בעלים.
- **מוכן לשחרור:** **PARTIAL** — כדאי smoke בדפדפן + preflight CI לפני push; Viewports/Hatch דוגמה/MLeader עדיין פערים מוצריים.

---

### המלצה

להמשיך **שלב 7 (Viewports)** ואז **ערוץ משולשים + linetypes (שלב 6 מלא)** לפני הצהרת "השלמה מלאה". שלב 1–2 הנוכחי סוגר את רוב תלונות **מיקום טקסט/מספר** ו**שכבות/צבע** — לאמת ב־UI על 3031-SW ו־3096-EL.
