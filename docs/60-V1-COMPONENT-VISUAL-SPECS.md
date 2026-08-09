# 60 — V1 Component Visual Specs (Conceptual)

**Status:** Visual planning — NOT React/CSS components  
**Phase:** Planning only  
**Maps to patterns in:** `49`

---

## 1. Page shell

- Sidebar: calm, low contrast icons, clear active (bg + text weight), one icon style  
- Selected nav: obvious without neon  
- Conditional modules look identical to primary modules when shown  
- No nag badges for unused features  
- Top bar: search, `+ New` (strong affordance), notifications, user — do not duplicate sidebar  
- Content: page padding from spacing scale; header then body  

Logo/temporary mark area in sidebar — final brand mark later.

---

## 2. Buttons

| Type | Use |
|------|-----|
| Primary | One main action per region |
| Secondary | Supporting |
| Tertiary / Ghost | Low emphasis |
| Destructive | Delete / void / reject |

Avoid five bright primaries on one screen.

---

## 3. `+ New`

| Platform | Treatment |
|----------|-----------|
| Desktop | Strong top-bar button → menu (icon + label, adaptive items) |
| Mobile | FAB → bottom sheet |

---

## 4. Cards

| Family | Content |
|--------|---------|
| KPI | Quiet label · loud value · optional context · optional link (מה כלול) |
| Attention | Needs action; restrained warning tone |
| Entity/Project | Mobile-first; name, status, 2–3 metrics |
| Empty-state panel | Calm CTA; minimal/no illustration in V1 |

Avoid endless nested cards. Tables/forms may sit on surface without card chrome.

---

## 5. KPI

Examples: שווי חוזה נוכחי · עלות בפועל · רווח משוער · יתרה לתשלום  

- Number primary, label clear, context secondary  
- Avoid wall of metrics (wireframe limits)  

---

## 6. Calculation Basis (signature trust pattern)

Compact:

```text
רווח משוער
₪84,500
מבוסס על הנתונים שהוזנו
מה כלול בחישוב ›
```

Expanded: included ✓ / not configured ○ — **neutral**, not red.

---

## 7. Status badges

See `59`. Text always.

---

## 8. Modals / pages / drawers

| Size | Pattern |
|------|---------|
| Small (Payment, confirm) | Modal desktop / sheet mobile |
| Medium (Quick Expense, simple Change) | Modal desktop / full-screen or sheet mobile |
| Complex (Project, Employee, Change detail, advanced Expense) | **Page** |
| Drawer | Only when useful (filters, short detail); avoid modal-in-modal |

---

## 9. Empty states

```text
עדיין אין פרויקטים
אפשר ליצור פרויקט תוך כמה שניות.
[ צור פרויקט ]
```

Simple icon optional later; no cartoons required for V1.

---

## 10. Documents upload

Click/select · drag-drop desktop · camera mobile · progress · success · failed  
Attachment row/card — not a DMS.

---

## 11. Icons

- Consistent outline (or consistent solid) — pick one philosophy later  
- Professional, simple  
- No emoji in production UI  
- RTL-aware directional icons only  
- Library choice OPEN at implementation  

---

## 12. Motion & feedback

- Restrained: dropdown, drawer, toast, accordion, skeleton  
- Skeleton for major pages  
- Inline spinner for local actions  
- Toast for saved — **not alone** for critical financial confirm  
- Optimistic updates only where safe  

---

## 13. Related

`51`–`55`, `57`, `59`, `61`
