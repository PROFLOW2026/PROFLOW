# 30 — Global Country Pack Expansion & Terminology

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** Israel pack in V1; more packs/locales Later  
**Class:** Country Pack + Core localization  
**Cross-reference:** `10-GLOBALIZATION-LOCALIZATION.md`, `11-TAX-CONFIGURATION.md`

---

## 1. Purpose

Expand the global-first architecture: Country Packs, tax/regulatory hooks, and terminology/localization growth — without making Israel the core, and without letting display terms change canonical meaning.

---

## 2. Country Pack contents

A Country Pack may configure:

- tax rules
- tax naming
- tax rates
- effective dates
- exemptions
- multiple taxes where applicable
- invoice/document terminology
- organization identifiers
- individual/business identifiers
- addresses
- phone formats
- currency defaults
- date/time formats
- timezone defaults
- fiscal defaults
- units defaults
- terminology defaults
- labor cost configuration hooks
- document retention configuration hooks
- compliance requirement presets (`24`)

---

## 3. Override ladder (authoritative order)

Country Pack defaults are **not permanently authoritative**.

```text
Country default
  → Organization override
    → Project override
      → Document / line override (where appropriate)
```

All important calc-driving rules must support **effective dating / history**.  
A mid-year or mid-project tax change must not rewrite historical issued records (`11`, `13`).

---

## 4. Multi-country growth path

```text
Israel pack (first)
  → additional packs (US / UK / AU / CA / EU countries / etc.)
  → multi-currency conversion (Later)
  → richer multi-tax regimes
```

Core product logic stays country-agnostic.

---

## 5. Localization expansion

### Rules

- English = canonical source language for keys/source copy
- Hebrew = first complete UI language
- Additional locales over time
- Regional English variants as needed
- RTL and LTR both first-class
- Pluralization, dates, numbers, unit display via locale
- Configurable terminology on top of canonical keys

### Terminology adaptation examples

| Canonical concept | Possible display terms |
|-------------------|------------------------|
| Project | Project / Job / Engagement / Matter / תיק / … |
| Vendor | Vendor / Supplier / Subcontractor / … |
| WorkPackage | Work Package / Trade / Service Area / Discipline / … |
| Employee | Employee / Worker / Team member / … |
| Client | Client / Customer / Account / … |
| ChangeOrder | Change Order / Variation / Extra (approved) / … |
| BillingRecord | Invoice / Billing record / Application for payment / … |

**Critical:** terminology changes must **not** alter canonical domain meaning or API/domain identifiers.

---

## 6. Interaction with vertical packs

Country Pack ≠ Vertical Pack.

- Country Pack: jurisdiction/locale/regulatory defaults
- Vertical Pack (`34`): industry packaging (legal/accounting/etc.)
- Construction vertical: Built Environment presets/UX

They may combine (e.g., Israel + Built Environment + Architect preset).

---

## 7. V1 impact

Already in V1 direction: Israel pack basics, Hebrew UI, English keys, Amount+Currency, tax effective dating/overrides.  
No additional V1 countries required by this document.

---

## 8. Related documents

- Globalization baseline → `10`
- Tax engine → `11`
- Future verticals → `34`
- Templates/presets → `36`
- Capability map → `19`
