# 63 — V1 Design Accessibility

**Status:** Planning  
**Phase:** Planning only  
**Target posture:** WCAG AA for design decisions

---

## 1. Contrast

- Primary text on page/surface meets AA  
- Muted text still readable (avoid gray-on-gray)  
- Borders not the sole means of structure  
- Status colors checked against badge backgrounds  

---

## 2. Focus & keyboard

- Visible focus ring on all interactive elements  
- Logical tab order in RTL  
- Menus/dialogs trap focus appropriately (implementation later)  
- Skip-to-content concept for shell  

---

## 3. Labels & names

- Visible labels on inputs  
- Icon-only controls have accessible names  
- `+ New` / FAB labeled for AT  
- Status announced as text, not color alone  

---

## 4. Touch sizes

Comfortable targets on mobile (bottom nav, FAB, primary buttons).

---

## 5. Motion

Honor reduced-motion: minimize/disable non-essential transitions.

---

## 6. RTL accessibility

- Reading order matches visual RTL  
- Don’t break screen reader flow with improper mirroring  
- Mixed LTR islands (emails, IDs) remain understandable  

---

## 7. Financial clarity

- Profit/loss: sign + words/numbers  
- Calculation basis expandable and keyboard reachable  
- Critical confirms not toast-only  

---

## 8. Related

`57`, `58`, `59`, `61`
