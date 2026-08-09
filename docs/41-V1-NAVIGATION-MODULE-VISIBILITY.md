# 41 — V1 Navigation & Module Visibility

**Status:** UX planning draft  
**Phase:** Planning only  
**Principle:** Progressive Complexity (`39`)

---

## 1. Purpose

Define adaptive navigation so unused capabilities stay out of the way without deleting data.

---

## 2. Module visibility approaches

| Option | Description |
|--------|-------------|
| **A** | Explicit module switches in Settings |
| **B** | Auto-surface after first use |
| **C** | Combination: manual enable **or** auto-surface after use |

### V1 recommendation: **Option C**

- Settings → Modules: user can turn areas on/off for nav prominence.
- First meaningful use can auto-surface that area (e.g. first Employee created → Workforce appears).
- Turning a module “off” **hides nav/widgets only** — never deletes data.
- User can always re-enable or find archived data via Settings / search.

Prioritizes simplicity: minimal orgs stay clean; growing orgs don’t hunt for toggles after they already started using a feature.

---

## 3. Recommended default nav (new org)

After minimal onboarding:

```text
Home
Projects
Expenses
Settings
(+ New)
```

Billing may appear after first billing record **or** if selected in onboarding “what I manage”.

Clients/Vendors/Workforce/Documents stay out until enabled or used.

---

## 4. Example nav states

### Profile A — solo electrician

```text
Home · Projects · Expenses · Billing · Settings
```

### Profile B — contractor with employees

```text
Home · Projects · Expenses · Billing · Workforce · Vendors · Settings
```

### Profile C — multi-trade / turnkey

```text
Home · Projects · Expenses · Changes* · Billing · Vendors · Workforce · Settings
```
\* Changes may be under Projects as primary; top-level optional when volume is high.

### Profile D/E — architect / consultant

```text
Home · Projects · Expenses · Billing · Workforce · Settings
```

---

## 5. Global `+ New` menu (adaptive)

| Item | Shown when |
|------|------------|
| Project | Always |
| Expense | Always |
| Change / Extra | Always (core commercial loop) or after first change |
| Billing Record | Billing enabled/used |
| Payment | Billing enabled/used |
| Client | Clients enabled/used OR always as lightweight helper (recommend: show once Clients used or from Project create) |
| Vendor | Vendors enabled/used |
| Employee | Workforce enabled/used |
| Time Entry | Workforce enabled/used |

No workforce → Employee/Time do **not** clutter the menu.

---

## 6. Forbidden behaviors for unused modules

Unused modules must **not**:

- show warning badges
- create “setup incomplete” errors
- fill dashboard with zeros
- block unrelated work
- permanently disable or delete data when hidden

---

## 7. Settings → Modules / Features (V1)

Suggested toggles (nav/defaults only):

- Workforce (employees & time)
- Vendors directory
- Clients directory (optional; projects still work with simple names)
- Billing & collections
- Business overhead tools (allocation helpers)
- Documents hub (global list)
- Changes cross-project list

Hiding ≠ deleting.

---

## 8. Related docs

- IA → `40`
- Onboarding → `42`
- Settings screens → `44`
- Validation → `48`
