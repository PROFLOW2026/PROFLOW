# 10 — Globalization & Localization

**Status:** Draft with owner direction applied (2026-08-09)  
**Phase:** Planning only

---

## 1. Purpose

Define global-first architecture for language, locale, country packs, currency, units, and directionality — while shipping Israel/Hebrew first.

---

## 2. Non-negotiable rules

1. **English is the canonical source language** for product copy keys and default source strings.
2. **Hebrew (`he-IL`) is the first complete UI language**.
3. No hardcoded user-facing UI strings inside components.
4. Israel is a **Country Pack**, not the core product.
5. Money always includes currency.
6. Units are convertible/configurable; do not assume one system forever.
7. RTL and LTR must both be first-class.

---

## 3. Language & locale

### Concepts

| Concept | Meaning |
|---------|---------|
| **Language** | Translation set (en, he, ...) |
| **Locale** | Language + regional formatting (`he-IL`, `en-US`, `en-GB`) |
| **UI direction** | RTL / LTR derived primarily from language/locale |

### Expected support readiness

- translation keys for all UI text
- locale-aware dates, numbers, calendars
- pluralization rules
- direction-aware layout

### Content types to separate

- UI chrome strings
- system presets (domains, document types)
- user-generated content (usually stored as entered; not auto-translated)
- country-pack terminology overrides

---

## 4. Country Packs

### Shape

```text
Core Product
  + Country Pack (Israel first)
  + future packs (US, UK, AU, CA, EU countries, etc.)
```

### Country Pack may control

- default currency
- tax regime integration points
- date formats
- address formats
- unit defaults
- local terminology
- regulatory configuration hooks
- document naming defaults
- local preset catalogs
- default fiscal calendar assumptions (careful)

### Rule

Core business logic should remain valid if country pack is swapped or extended.

---

## 5. Currency

### Rules

- Every amount has a currency code.
- Organization has a base currency.
- UI must never assume ₪ globally.

### Future multi-currency topics

- project currency differs from base currency
- exchange rates and rate dates
- realized/unrealized differences (probably accounting-system territory)

**Decided (2026-08-09):** one organization base currency and one project currency path in V1.  
All monetary data still uses Amount + Currency structurally.  
Multi-currency conversion is deferred, not blocked.

---

## 6. Units & measurements

Support planning for:

- metric
- imperial
- conversion
- display preference

Examples:

- m² vs sq ft
- km vs miles
- m vs ft

### Rules

- store canonical values in an unambiguous way (strategy TBD)
- display according to preference/country defaults
- quantity billing units must be explicit

### Storage fork

- **Option A:** store canonical metric internally; convert for display  
- **Option B:** store entered unit + amount; convert as needed  
- **Recommendation:** Option B for commercial quantities (preserve what was agreed); Option A may suit telemetry-like measures later  
- **OWNER DECISION REQUIRED**

---

## 7. RTL / LTR

Hebrew-first means RTL quality is mandatory, not a late patch.

Implications:

- layout mirroring
- icon directionality where needed
- mixed content (Hebrew + numbers + English names)
- PDF/export direction considerations
- email templates direction

English UI must also remain excellent for canonical/admin and future markets.

---

## 8. Terminology configuration

Same entity may have different business words:

| Canonical | Possible display aliases |
|-----------|--------------------------|
| Project | Job / Engagement / Site |
| Work Package | Trade / Discipline / Service Area |
| Change Request | Extra / Variation / Variation Order request |
| Vendor | Supplier / Subcontractor |

Country packs and organization settings may override display terms. Canonical keys remain stable.

---

## 9. Israel-first delivery checklist

For first release readiness:

- `he-IL` complete translations
- Israel country pack defaults (currency ILS, address patterns, tax integration points)
- RTL validated on major flows
- Hebrew formatting for dates/numbers according to locale decisions
- no core code branches like `if (country === 'IL')` scattered randomly — prefer pack configuration

---

## 10. What not to hardcode in core

- VAT rate
- ID/company number formats as universal requirements
- address line assumptions
- labor law overtime multipliers
- invoice legal text
- unit system
- currency symbol-only displays without code/context

---

## 11. Related documents

- Tax → `11-TAX-CONFIGURATION.md`
- Product principles → `01-PRODUCT-PRINCIPLES.md`
- Technical i18n options → `14-TECHNICAL-ARCHITECTURE-OPTIONS.md`
- Open questions → `18-OPEN-QUESTIONS.md`
