# 34 — Future Vertical Packs (Beyond Built Environment)

**Status:** Architecture flexibility planning only  
**Phase:** Planning only  
**Timing intent:** Later  
**Class:** Future vertical pack  

---

## 1. Hard product boundary

**ProjectFlow V1 remains Construction / Built Environment.**

This document exists to protect architectural flexibility.  
It is **not** permission to design or build legal/accounting products now.

---

## 2. Why this matters

The core is:

```text
General Business / Project Core
  + Built Environment vertical (current)
  + future vertical packs (later)
```

If the core is accidentally electrician-only or GC-only, other verticals become rewrites.

---

## 3. Legal (future mapping check)

Possible mapping:

```text
Client
  → Matter / Project
    → Service / WorkPackage
      → Time
      → Expense
      → Billing
      → Change in scope
      → Documents
      → Profitability
```

Possible later special modules (not now):

- conflicts checks
- trust accounts
- legal deadlines
- heightened document security

Terminology example: Project displays as Matter; canonical remains Project/Engagement keyable.

---

## 4. Accounting firms (future mapping check)

```text
Client
  → Engagement / Project
    → Service Package / WorkPackage
      → Time
      → Expense
      → Billing
      → Profitability
```

Possible later special modules:

- recurring compliance work
- reporting periods
- statutory integrations

Do not confuse this with ProjectFlow’s own accounting connectors for contractor customers (`28`).

---

## 5. Consulting / agencies / engineering firms

Same underlying project economics:

- engagements
- service packages
- time
- expenses
- billing
- scope changes
- profitability / overhead allocation

Built Environment consultants are already in current market posture; this section covers broader professional services packaging later.

---

## 6. Architecture checklist (flexibility test)

| Need | Covered by current core direction? |
|------|------------------------------------|
| Rename Project in UI | Yes via terminology (`30`) |
| Custom service types | Yes |
| Time + expenses + billing | Yes |
| Scope changes with history | Yes (CR/CO) |
| Overhead / true cost | Yes |
| Vertical-specific modules | Add as optional packs later |
| Trust/conflict engines | Not in core; additive later |

No current core rewrite required to keep these possible.

---

## 7. V1 impact

**None.** Do not add legal/accounting UX to V1.

---

## 8. Related documents

- Overview/principles → `00`, `01`
- Terminology → `30`
- Templates → `36`
- Capability map → `19`
