# 58 — V1 Typography & RTL

**Status:** Planning  
**Phase:** Planning only — no font files, no CSS  
**Rule:** Hebrew must feel native, not a translated afterthought

---

## 1. Language reality

First complete UI: **Hebrew (`he-IL`)**  
Canonical keys: English  
UI must excel at:

- Hebrew
- English
- Mixed HE + EN (vendor names, emails)
- Numbers, currencies, tables, large KPIs

---

## 2. Font strategy (not final pick)

**Recommendation posture:**

- One primary UI sans family with excellent **Hebrew + Latin** coverage
- Prefer fonts with tabular/lining numerals for money columns when available
- Exact production font remains **OPEN** pending license, Hebrew quality, and performance (`V2` in open questions)

Candidates to evaluate later (examples, not decisions):

- System stack with strong Hebrew (fastest start)
- Licensed/open UI sans with HE support verified in real tables

Do **not** embed fonts in this planning phase.

---

## 3. Type roles

| Role | Use | Relative scale (concept) |
|------|-----|---------------------------|
| Display | Rare welcome titles | Largest |
| Page title | PageHeader | XL |
| Section title | Overview blocks | L |
| Card title | Card headers | M–L medium weight |
| Body | Default reading | Base |
| Secondary | Supporting lines | Base / slightly smaller |
| Table header | Column labels | SM medium |
| Table cell | Dense readable | SM–Base |
| Form label | Above fields | SM medium |
| Helper | Hints | XS muted |
| KPI number | Dashboard values | XL–2XL tabular |
| Currency/value | Inline money | Tabular, medium |
| Button | CTA labels | SM–Base medium |

Avoid making every number gigantic. KPI number > KPI label (quieter label).

---

## 4. Numbers & money rules

Examples: `₪504,000` · `$12,500` · `12.5%` · `+₪12,000` · `−₪8,000`

| Rule | Detail |
|------|--------|
| Locale formatting | he-IL separators/currency placement per locale utils (implementation later) |
| Alignment | Tables: numeric columns end-aligned in reading direction with stable scanning |
| Tabular figures | Prefer for columns of money |
| Sign | Always show +/− or words; never color-only |
| Compact | Use compact (e.g. ₪310k) only in tight mobile cards when needed; full on detail |
| Decimals | Consistent; don’t invent precision |

---

## 5. RTL layout rules

Hebrew V1 is **native RTL**.

| Element | Behavior |
|---------|----------|
| Sidebar | Right side in RTL |
| Content | RTL flow |
| Tabs | Start from reading start edge |
| Forms | Labels/fields RTL; inputs full width |
| Button groups | Logical order (primary toward start or trailing action zone — keep consistent product-wide) |
| Breadcrumbs | Logical RTL sequence |
| Dropdowns | Open aligned to trigger in RTL |
| Icons | Mirror only **directional** icons (back/forward/chevron). Do not mirror logos, checkmarks, warning icons |
| Numbers | Stable, readable; treat as LTR islands when needed for mixed strings |
| EN names / emails / URLs / refs | Keep original direction; don’t force broken mirroring |
| Currency | Follow locale; keep amount visually intact |

---

## 6. Mixed string examples

```text
ספק: ABC Electrical Supplies
אסמכתא: INV-2026-014
אימייל: office@example.com
```

UI chrome Hebrew; entity strings may be English without visual “glitch” spacing.

---

## 7. Related

`10`, `30`, `48` glossary, `57`, `63`
