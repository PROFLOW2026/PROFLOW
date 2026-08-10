# ProjectFlow — Manual Owner Test Plan

**Audience:** Owner review before release  
**Environment:** Staging / local with migrations **0022 + 0023** applied together on disposable DB (not production until owner approves)  
**Locale:** he-IL · Mobile + Desktop  
**Do not** apply `db:migrate` to owner Supabase until approved.

**Migrations:** Apply **0022_master_completion_foundations** then **0023_attendance_rls_and_role_backfill** as one chain. Do not leave 0022 without 0023.

---

## Prep

1. Sign in as Owner.
2. Confirm optional modules can stay off for “simple org” pass.
3. Second browser/session: Worker account with `attendance.self` (linked employee if testing clock).
4. Confirm both **0022** and **0023** are present in the target environment’s migration journal.
---

## Journey 1 — Employee lifecycle

1. More → עובדים → עובד חדש → save.
2. Edit name / phone / status → שמירת שינויים.
3. Optional: add rate (monthly) with effective from; add later superseding rate — confirm history keeps both windows.
4. Assign to project; edit dates; end; cancel a mistaken future assignment if available.
5. Time: one day simple; then advanced range Sun–Thu with preview → save.
6. Optional monthly employer cost apply for a month.
7. השבת/ארכיון → badge; החזר לפעיל.
8. Confirm no hard-delete control for employee with history.

**Pass if:** list rate matches detail; archive soft; rates not rewritten.

---

## Journey 2 — Worker attendance + finance wall

1. As Worker: see נוכחות; open clock; כניסה / יציאה (if linked).
2. Confirm no Clients / Vendors / Billing / Vendor bills / profit.
3. Direct `/procurement/ap` → אין הרשאה.
4. Optional: own permitted time entry only.

**Pass if:** clock works; finance hidden + blocked.

---

## Journey 3 — Project ops

1. Open project from list.
2. Team → add employee.
3. Contractors/engagements → dated subcontractor period; end engagement.
4. לוח זמנים → add/view task; progress; dependency (cycle blocked).
5. Expense → finalize.
6. Financials / profitability still coherent.

**Pass if:** schedule ≠ details; engagement creates no Actual alone.

---

## Journey 4 — Vendor AP

1. Vendor → edit / archive / restore.
2. Engagement on project with dates.
3. PO → issue → cancel or close (commitment not stuck active incorrectly).
4. Bill → allocate → payment.
5. Credit note → apply; outstanding + Actual move correctly.
6. Void bill (after voiding payments if required).
7. AP → גיל יתרות → buckets readable on mobile.

**Pass if:** credit ≠ negative payment; void preserves history.

---

## Journey 5 — Client contacts

1. Client → edit address → archive → restore.
2. Contact edit typo fix (no delete+recreate).
3. Mark primary; set project-specific contact.
4. Linked projects list visible.

---

## Journey 6 — Mobile Quick Create

1. Phone width: + menu shows only permitted actions.
2. Expense, Time, Attendance within sensible taps.
3. No dead buttons (press feedback).
4. Simple org without attendance/planning still calm (no forced setup).

---

## Financial spot checks

| Check | Expect |
|-------|--------|
| Assignment only | No Actual spike |
| Attendance only | No Actual spike |
| Engagement only | No Actual spike |
| Time then monthly cost | No double labor |
| Bill void | Actual reverses; history kept |
| Credit | Economic net down; outstanding down |

---

## Sign-off checklist

- [ ] Journeys 1–6 pass on he-IL mobile + desktop  
- [ ] Worker finance wall holds  
- [ ] Worker attendance.self sees **own** attendance only (not peers)  
- [ ] **0022 and 0023** both applied on intended environment (together)  
- [ ] Owner approves release / migrate production  
