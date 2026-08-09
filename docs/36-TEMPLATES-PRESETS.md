# 36 — Templates & Presets

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** light presets V1.x–V2; rich template library Later  
**Class:** Core extension + Construction vertical packaging

---

## 1. Purpose

Accelerate onboarding with reusable structures while ensuring presets never hardcode the product to one profession.

**Preset ≠ restriction.** Presets customize defaults only (`39`).

Users must always be able to remove, add, rename (where allowed), create custom items, and enable capabilities later.

Do **not** turn profession selection into a mandatory gauntlet or schema lock.

---

## 1.1 Onboarding interaction

Profession/business type (if asked) should be optional and apply suggested domains/services/work-package starters only.

Minimal onboarding remains:

1. organization  
2. country/language/currency  
3. optional business type  
4. enter product  

Long mandatory setup wizards are forbidden (`39`).

---

## 2. Template types

- project templates
- WorkPackage templates
- profession presets
- Phase templates
- cost category presets
- quote templates
- employee cost templates
- Change Request templates
- document checklists
- country templates (via Country Pack)

---

## 3. Example presets (illustrative)

- Electrician preset
- Architect preset
- Main contractor preset
- Safety consultant preset
- HVAC subcontractor preset
- Interior design studio preset

Each preset is a **starting package** of domains, work packages, document checklists, and categories — fully editable after apply.

---

## 4. Apply semantics

```text
Template/Preset
  → instantiate copy onto Organization/Project
  → user edits instance
  → template remains unchanged
```

Do not create live binding that breaks historical projects when a template changes (unless explicitly versioned “update from template” feature later).

---

## 5. Rules

1. Presets improve speed; they are not required paths.
2. Users can create projects with no profession preset.
3. Canonical entities remain profession-agnostic.
4. Country Pack + Vertical Pack + Profession preset may stack.
5. Templates must support simple single-WP projects and complex multi-WP projects.

---

## 6. V1 impact

V1 needs custom domains/services; shipping a few light presets can wait for V1.x/V2 unless onboarding evidence demands earlier.

---

## 7. Related documents

- Flexible workflows → `39`
- Business/project model → `03`
- CRM quotes → `20`
- Configuration → `35`
- Country packs → `30`
- Capability map → `19`
