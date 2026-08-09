# 56 — V1 Visual Design Direction

**Status:** Visual family **DECIDED** — Direction B Deep Teal (2026-08-09)  
**Phase:** Planning only — no branding assets, CSS, or components  
**Depends on:** Wireframes `49`–`55`, Progressive Complexity `39`

---

## 1. Product feel (target)

ProjectFlow is a **professional business operating system** for built-environment businesses.

| Should feel | Must not feel |
|-------------|----------------|
| Professional, trustworthy | Old ERP / government forms |
| Modern, clean, calm | Spreadsheet with a sidebar |
| Fast, financially clear | Construction-only industrial dashboard |
| Approachable | Children’s app / emoji UI |
| Premium without luxurious | Flashy fintech / trading / gaming |
| Comfortable for many hours/day | Generic Bootstrap admin template |

---

## 2. Key design tension

Deep capability + simple default experience.

**Visual hierarchy must reinforce Progressive Complexity.**

Simple users see: whitespace, few actions, clear cards, short forms, calm nav.  
Advanced depth (tables, filters, WP, workforce, allocations) appears when chosen — not as permanent chrome.

---

## 3. General style posture

**Clean SaaS workspace (light-first):**

- light main canvas
- strong information hierarchy
- restrained borders
- subtle surfaces
- comfortable whitespace balanced with business density
- clear numerical typography
- strong tables without spreadsheet heaviness
- moderate corner radius
- shadows only for layering (overlays/menus)
- no decorative gradients by default
- no glassmorphism / visual gimmicks
- contemporary for 2026, durable (not trend-chasing)

---

## 4. Three visual directions

### Direction A — Calm Blue

| Aspect | Description |
|--------|-------------|
| Feeling | Trust, clarity, universal professional SaaS |
| Brand-color family | Mid–deep blue primary; cool neutrals |
| Surfaces | Soft gray canvas, white elevated panels |
| Typography feel | Neutral sans; highly readable HE/EN |
| Financial/dashboard feel | Calm KPIs; blue for action/focus, not profit theater |
| Strengths | Familiar, safe for money, broad audience fit |
| Risks | Can feel “default SaaS” if neutrals/type are weak |
| Built-env + consultants | Strong for both contractors and architects |
| RTL/Hebrew | Excellent with mature Hebrew-capable sans |
| Dashboard suitability | High — restrained status colors |

### Direction B — Deep Teal

| Aspect | Description |
|--------|-------------|
| Feeling | Engineering + business; modern, grounded |
| Brand-color family | Deep teal / blue-green; warm-neutral or cool-neutral canvas |
| Surfaces | Slightly warmer paper or cool stone neutrals |
| Typography feel | Slightly distinctive sans; still UI-first |
| Financial/dashboard feel | Grown-up; less “bank blue”, still trustworthy |
| Strengths | Differentiated; fits trades + design firms |
| Risks | Teal can clash with green success if not tuned; print/PDF later |
| Built-env + consultants | Very strong for engineers/architects; still OK for trades |
| RTL/Hebrew | Good if contrast kept high |
| Dashboard suitability | High if success/warning stay distinct from brand teal |

### Direction C — Indigo

| Aspect | Description |
|--------|-------------|
| Feeling | Modern product software; sharp professional |
| Brand-color family | Indigo / blue-violet primary |
| Surfaces | Cool gray system, crisp borders |
| Typography feel | Contemporary geometric or neo-grotesk |
| Financial/dashboard feel | Product-forward; risk of “startup purple” if oversaturated |
| Strengths | Distinctive, tech-modern |
| Risks | Can feel trendy; purple bias conflicts with product principles against default AI-purple aesthetics; consultants may read it as less “site-ready” |
| Built-env + consultants | Better for software-native firms than field crews if too violet |
| RTL/Hebrew | Fine technically; cultural fit less universal |
| Dashboard suitability | Medium–high if desaturated |

---

## 5. Owner decision — Visual Direction (DECIDED 2026-08-09)

**V1 Visual Direction = B — Deep Teal.**

Why this fits:

- Differentiated from generic blue admin templates without flashy fintech energy  
- Bridges contractors and design/engineering consultants  
- Supports calm financial UI when neutrals and status colors are disciplined  
- Avoids indigo/purple “default AI SaaS” clustering  

**Direction A (Calm Blue)** remains a historical alternative only (not active V1 direction).  
**Direction C (Indigo)** rejected for V1.

Still **not** locked by this decision:

- Exact production hex values (candidates only in `57`)
- Logo / final product brand name
- Production font family (`V2` — stack/UI implementation review)

---

## 6. Light mode first

V1 prioritizes **Light Mode**.  
Token structure must allow future dark mode (`57`) without designing a full dark set now.

---

## 7. Density

Default: **balanced clarity + density** (daily-use product).  
Not overly airy; not Excel-dense.  
Future compact table mode possible — not V1 settings UI.

---

## 8. Related

`57`–`64`, wireframes `49`–`55`, open questions Visual section in `18`
