# 57 — V1 Design Tokens (Planning)

**Status:** Candidate token structure — values not owner-locked  
**Phase:** Planning only — no CSS variables implementation  
**Note:** Hex examples are **candidates** pending visual direction decision (`56`)

---

## 1. Token layers

```text
Primitive (raw palette)
  → Semantic (role: bg, text, border, action…)
    → Component (button-primary-bg, table-row-hover…)
```

Support future dark mode by swapping semantic mappings, not hardcoding light hex in components (when implemented later).

---

## 2. Color roles (semantic)

| Role | Purpose |
|------|---------|
| `color.bg.page` | Main canvas |
| `color.bg.surface` | Cards / panels |
| `color.bg.elevated` | Overlay surfaces |
| `color.bg.muted` | Subtle sections / zebra optional |
| `color.border.default` | 1px borders |
| `color.border.strong` | Emphasized separators |
| `color.text.primary` | Body / titles |
| `color.text.secondary` | Supporting |
| `color.text.muted` | Meta / timestamps |
| `color.text.disabled` | Disabled |
| `color.action.primary` | Primary CTA |
| `color.action.primaryHover` | Hover |
| `color.action.primaryForeground` | On primary |
| `color.focus.ring` | Keyboard focus |
| `color.status.success` | Positive operational state |
| `color.status.warning` | Attention / pending |
| `color.status.danger` | Destructive / rejected / overdue critical |
| `color.status.info` | Neutral information |
| `color.status.pending` | Awaiting approval etc. |
| `color.status.disabled` | Inactive |

Financial profit/loss: **sign + text first**; color secondary. No casino red/green walls.

---

## 3. Candidate neutrals (light)

Approximate only:

| Token | Candidate | Notes |
|-------|-----------|-------|
| page | `#F4F6F8` | Soft canvas — not pure white full-bleed |
| surface | `#FFFFFF` | Cards / content |
| elevated | `#FFFFFF` | With shadow elevation |
| muted | `#EEF1F4` | Nested regions |
| border | `#E2E6EB` | Subtle 1px |
| border.strong | `#C9D0D8` | |
| text.primary | `#1B2430` | Avoid pure `#000` |
| text.secondary | `#4A5563` | |
| text.muted | `#6B7280` | Keep AA contrast on page bg |
| text.disabled | `#9AA3AF` | |

---

## 4. Candidate brand primaries (by direction)

| Direction | Candidate primary | On-primary |
|-----------|-------------------|------------|
| A Calm Blue | `#2563EB` family | White |
| **B Deep Teal (rec.)** | `#0F766E`–`#0D9488` family | White |
| C Indigo | `#4F46E5` family | White |

Mark all as candidates until owner locks direction.

---

## 5. Spacing scale (conceptual)

| Token | Intent | Candidate rem |
|-------|--------|----------------|
| `space.2xs` | Very small | 0.25 |
| `space.xs` | Small | 0.5 |
| `space.sm` | Normal tight | 0.75 |
| `space.md` | Normal | 1 |
| `space.lg` | Medium | 1.5 |
| `space.xl` | Large | 2 |
| `space.2xl` | Section | 2.5–3 |
| `space.3xl` | Page padding | 3–4 |

Balance clarity + density for all-day use.

---

## 6. Radius

| Token | Candidate | Use |
|-------|-----------|-----|
| `radius.sm` | 4–6px | Inputs, badges |
| `radius.md` | 8–10px | Cards, buttons |
| `radius.lg` | 12–14px | Modals/sheets |
| `radius.full` | pill | Avoid as default for most chrome |

Moderate rounding — not “rounded-full everything”.

---

## 7. Borders & shadows

- Default cards: **1px border**, **no/low shadow**  
- Shadow for: dropdown, modal, popover, FAB elevation  
- Avoid every section floating as a heavy card  

| Token | Use |
|-------|-----|
| `shadow.sm` | Menus |
| `shadow.md` | Modal / sheet |
| `shadow.none` | Default surfaces |

---

## 8. Motion tokens (restrained)

| Token | Intent |
|-------|--------|
| `motion.fast` | 120–160ms menus |
| `motion.normal` | 200–240ms drawers |
| `motion.none` / reduced-motion | Respect prefers-reduced-motion |

No decorative animation.

---

## 9. Z-index layers

`base` → `sticky` → `dropdown` → `modal` → `toast` → `critical`

---

## 10. Related

`56`, `59`, `60`, `63`
