# 11 — Tax Configuration

**Status:** Draft for owner review  
**Phase:** Planning only

---

## 1. Purpose

Define a Tax Engine that is configuration-driven, effective-dated, overridable, and historically safe.

Tax rates must **never** be hardcoded in application logic.

---

## 2. Why this is foundational

Tax can change mid-year or mid-project.  
Old invoices and quotes must remain historically correct.  
Different countries (and sometimes jurisdictions) have different regimes.

Israel may start with VAT-centric defaults via Israel Country Pack, but core remains generic.

---

## 3. Tax Rule entity (conceptual)

A Tax Rule should include:

- country / jurisdiction
- tax type (e.g. VAT/GST/Sales Tax — naming by pack)
- rate
- effective from
- effective until (nullable/open-ended)
- status (active/inactive)
- default behavior flags
- compounding/inclusivity metadata if needed later
- audit metadata

### Example

```text
Tax 17% effective until Date D
Tax 18% effective from Date D+1
```

Updating to 18% must not rewrite documents issued under 17%.

---

## 4. Tax Engine responsibilities

1. Resolve applicable rule(s) for a given context and date.
2. Apply overrides according to precedence.
3. Calculate tax on documents/lines according to stored decision.
4. Preserve the tax snapshot used on issued documents.
5. Explain why a rate was chosen.

---

## 5. Manual Tax Override

Override must be possible at appropriate levels:

```text
Global / Country default
  → Business override
    → Project override
      → Document / line override
```

### Override record should capture

- who changed
- when
- previous value
- new value
- reason (if required)
- scope
- effective dating if applicable

This supports sudden mid-year or mid-project changes and special cases (exempt, zero-rated, reverse charge later, etc.).

---

## 6. Historical integrity

### Issued documents

Store on the document/line:

- rate applied
- tax type
- taxable base
- tax amount
- whether inclusive/exclusive
- rule/override references

Recalculation of drafts may be allowed; recalculation of issued/finalized documents should be controlled and rare.

### Draft vs issued fork

- **Option A:** drafts always recalculate from current rules; issued are frozen  
- **Option B:** all saved documents freeze tax snapshot immediately  
- **Recommendation:** Option A  
- **OWNER DECISION REQUIRED**

---

## 7. Country pack interaction

Country packs provide:

- available tax types
- default rules
- legal display labels
- invoice tax presentation norms
- validation expectations

Core engine provides resolution and override mechanics.

---

## 8. Multi-tax and advanced regimes (later)

Future possibilities:

- multiple simultaneous taxes
- reverse charge
- withholding
- jurisdiction by project location vs supplier location
- tax IDs validation

Do not overbuild V1, but avoid a model that can represent only a single global percentage forever.

---

## 9. Permissions

Changing tax defaults/overrides is sensitive.

Typical access:

- owner / finance roles
- not project workers by default

All changes auditable.

---

## 10. V1 recommendation

- one primary tax type per country pack (e.g. VAT for Israel)
- effective-dated rates
- org default
- project override
- document/line override
- freeze on issue

Defer:

- complex multi-jurisdiction determination graphs
- automated statutory filings
- full tax report suite

---

## 11. Related documents

- Globalization → `10-GLOBALIZATION-LOCALIZATION.md`
- Financial docs → `04-FINANCIAL-MODEL.md`
- Audit → `13-AUDIT-HISTORY-DATA-INTEGRITY.md`
- Open questions → `18-OPEN-QUESTIONS.md`
