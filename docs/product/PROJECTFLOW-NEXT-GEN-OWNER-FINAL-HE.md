# דוח סופי — Next Generation Overnight

**NEXT GENERATION SQL REVIEW STATUS = READY**

(עם פערים MEDIUM ידועים; בלי commit / push / owner migrate)

---

## 1. OWNER COMMAND CENTER
What exists = מסך `/today` (היום) אופציונלי  
What owner sees = פריטים לטיפול בלבד (WHAT/WHY/WHERE/ACTION)  
Mobile = primary כשהמודול דלוק

## 2. MONTH CLOSE
Open/ready/closed = כן  
Completeness = אחוז שקוף עם checklist  
Corrections = רשומות התאמה לאחר סגירה (לא unlock אוטומטי)

## 3. FINANCIAL EXPLAINABILITY
Why-this-number = כן  
Confidence = High/Medium/Needs data דטרמיניסטי  
Drilldown = פירוק לקטגוריות + מקורות

## 4. BUDGETS
Total = כן (קל משקל)  
Categories/Work packages = סכמה + API; UI מתקדם חלקי  
Variance/Forecast = ממנוע הפיננסי האחד

## 5. QUOTES / ESTIMATES
Create/Line items/Profit estimate/Accept-reject/Convert = כן  
טבלאות DB = `estimates` (לא change-order `quotes`)

## 6. SERVICE / WORK ORDERS
Work order = `work_kind=work_order` על projects  
Scheduling/Dispatch/Assignment = כן  
Financial = אותו מנוע (אין Actual כפול)

## 7. RECURRING WORK
Templates/Generate/Pause-skip-end = כן (יוצר WO draft בלבד)

## 8. APPROVALS
Expenses/PO/Budget/AP bill+credit = gated  
Mobile approve/reject = כן

## 9. MATERIALS / EQUIPMENT
Usage = כן; ≠ Actual; אין double-count

## 10. FIELD FORMS
Checklists/Photos/Sign-off(acknowledgement)/Offline drafts = כן

## 11. BUSINESS PROFILES
12 פרופילים כ־presets בלבד  
Terminology/Module presets = כן  
Simple-mode = נשמר (מודולים אופציונליים כבויים עד שימוש)

## 12. ONBOARDING / IMPORT
CSV/XLSX + Preview + Validation = משופר

## 13. PORTALS
Customer/Vendor public = **DISABLED**  
סיבה = אין ExternalPrincipal session מאובטח נפרד מחברות  
Internal grants/previews = קיימים ל־portal.manage

## 14. SEARCH
Global search = כן (⌘K) permission-safe

## 15. RECURRING FINANCIAL DRAFTS
Schema = כן; UI generator = פער (deferred)

## 16. RETENTION
Deferred — מסמך עיצוב בלבד

## 17. MOBILE
Daily flows/Quick Create/Field = מורחב; worker בלי “המסלול שלי” ייעודי

## 18. REPORTING
Confidence + explain על dashboard/reports; month close מדווח ב־CC

## 19. PERFORMANCE
Open project ≈ ~995ms חוזר; יעד &lt;700 חלקי  
Search/shell קלים יותר; פורטל לא משפיע

## 20. OPTIONALITY
Can a basic customer ignore advanced features = **YES**

## 21. BUSINESS ACCEPTANCE
General contractor = PASS  
Electrical/plumbing = PASS  
Maintenance/field service = PASS  
Mixed project + service = PASS

## 22. DATABASE
New migrations = 0024–0029  
Latest = `0029_next_gen_integration_hardening`  
Applied to owner DB = **YES**  
0000–0023 modified = **NO**

## 23. TESTS
`npm run verify` = **PASS** (typecheck + lint + 238 files / 1548 tests)  
Adversarial 0024–0029 = **PASS** (clean-start, 0023→latest, fake-approved insert, closed-month leak, form rewrite, budget history, kind-specific drafts, composite SET NULL)  
`npm run build` = **PASS**  
Playwright = **PASS** 86/86 (Owner Desktop, Owner Mobile, Worker; public shell)  
Concurrency + financial invariants = covered by existing integration suites in verify  
אין owner migrate

## 24. REMAINING REAL GAPS
BLOCKER = אין  
HIGH = אין  
MEDIUM =
- defaultWorkKind לא נצרך ב־create forms
- month-close adjustments = audit בלבד (לא supersede כלכלי)
- recurring financial drafts UI
- public portal auth (נשאר DISABLED)
- retention/holdback (deferred)
- per-line budget Actual
- open project עדיין ~1s
- Command Center copy עדיין “owner” למרות grants ל־manager/finance
- UI ל־postVendorCredit על זיכויי draft עצמאיים
- איבר approval INSERT עדיין פתוח לכל חבר org (רק submitted; לא approved) — DoS אפשרי על שער finalize

נפתר אחרי Reviewer1 / Lead:
- month-close freeze על expense/AP/labor
- AP vendor_bill/vendor_credit = draft→post + approval gate + כפתור Post בחשבון
- void bill ללא billDate משתמש ב־createdAt
- Quote convert race + budget approval + UI zero-hide

נפתר אחרי Reviewer2:
- `forms.submit` מופרד מ־`forms.manage` (worker = submit בלבד)
- dispatch RLS/app מאפשרים `dispatch.manage` OR `service.manage`
- FORCE RLS על כל טבלאות next-gen ב־0029
- `assertMonthOpenForRewrite` לא קורס בלי DATABASE_URL

0024–0029 applied. 0000–0029 immutable. Future DB change = 0030+.
