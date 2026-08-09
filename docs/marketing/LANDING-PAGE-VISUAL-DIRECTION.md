# ProjectFlow — Landing Page Visual Direction

**Base brand:** Product Direction B — **Deep Teal** (`docs/56-V1-VISUAL-DESIGN-DIRECTION.md`)  
**Mode:** Light-first  
**Script:** Hebrew RTL  
**Feel:** Professional · modern · trustworthy · business-first  

**Must not feel:** Childish · crypto/neon · purple AI-SaaS · construction-cliché overload · generic Inter-on-white startup template without brand presence

---

## 1. Brand presence (marketing page)

- Product name **ProjectFlow** is a hero-level signal (logo wordmark or large type in header + hero).  
- First viewport = one composition: brand + one headline + one subhead + CTA group + one dominant product image.  
- No dashboard-of-marketing clutter in the hero (no stat strips, badge piles, promo chips on the screenshot).

---

## 2. Color

| Token role | Direction |
|------------|-----------|
| Brand / primary action | Deep Teal family (`--pf-teal-*` from product) |
| Canvas | Clean white / cool stone light gray |
| Elevated surface | White |
| Text | Near-black / deep slate (high contrast for Hebrew) |
| Muted text | Slate gray |
| Borders | Hairline cool gray |
| Success / warning / danger | Product status tokens — **distinct from brand teal** |
| Hero atmosphere | Soft teal wash or subtle gradient — not flat single flat slab, not neon glow |
| Final CTA band | Deeper teal or teal-tinted panel with light text |

Avoid: purple-indigo gradients, warm cream+#terracotta cliché, multi-layer glow shadows.

---

## 3. Typography

| Level | Use |
|-------|-----|
| H1 Hero | Large, confident Hebrew; 1–2 lines max |
| H2 Section | Clear scan anchors |
| Body | Short paragraphs (2–4 lines); business Hebrew |
| Meta / captions | Smaller; screenshot captions |

Rules:

- Prefer the product’s Hebrew-capable UI font stack for consistency with the app (do not invent a random display font that fights the product).  
- If marketing adds a distinct display face later, keep it restrained and pair with the UI sans for body.  
- RTL: punctuation and numbers must render correctly; keep amounts LTR-isolated if needed (`dir` / bidi).  
- Line length: ~35–65 Hebrew characters for body comfort.

---

## 4. Layout

| Spec | Value |
|------|--------|
| Max content width | ~1120–1200px |
| Page gutters mobile | 16–20px |
| Page gutters desktop | 24–40px |
| Section vertical spacing | 64–96px desktop · 48–64px mobile |
| Hero min height | ~100vh feel on desktop without forcing empty void on mobile |

**Desktop:** Prefer 2-column for Hero, S05, S07, S08 (text + screenshot).  
**Mobile:** Single column; screenshot full-bleed width within gutters; no horizontal page scroll.

---

## 5. Cards

- Default on marketing: **minimal**.  
- Cards OK for: problem points, owner questions, advanced module grid — light border or soft surface, small radius (~8–12px matching product).  
- **No cards in hero.**  
- If removing border/shadow doesn’t hurt understanding — remove it.

---

## 6. Buttons

| Type | Style |
|------|--------|
| Primary | Solid Deep Teal; white label; large tap (≥44px height) |
| Secondary | Outline teal or ghost on light; same height |
| Final band | Primary may invert (light fill on deep teal) |

Hebrew labels exactly as master spec. Full-width buttons on mobile for primary CTAs.

---

## 7. Screenshots

- Framed in subtle browser/phone chrome **or** clean rounded rect with light shadow (one layer only).  
- Desktop shots: large; don’t shrink to unreadability.  
- Mobile shots: use phone frame; never show tiny desktop UI as “mobile”.  
- Captions under image in Hebrew.  
- Optional soft teal highlight mark in post-production per screenshot plan.

---

## 8. Badges / icons

- Sparse.  
- Icons: simple line icons, monochrome slate/teal — not emoji, not 3D clipart, not hard-hat spam.  
- Status-like badges only when explaining pending vs approved (matches product language).

---

## 9. Backgrounds

- Alternating: white → very light stone → white.  
- One atmospheric hero (soft teal gradient / faint pattern).  
- Avoid heavy photography of random construction sites as the main idea; **product UI is the visual anchor**.

---

## 10. RTL behavior

- `dir="rtl"` on page.  
- Logical CSS (margin-inline, padding-inline, inset-inline).  
- Flow arrows point correctly for RTL (לקוח → …).  
- Nav order: logo start-side (right in RTL), CTA end-side.  
- Screenshot carousels: swipe naturally; dots below.

---

## 11. Mobile stacking (per section type)

| Pattern | Stack |
|---------|--------|
| Hero | Brand/nav → H1 → sub → CTAs → mobile screenshot |
| Text + image | Text → image |
| Grids | 1 column |
| Tour | Snap carousel of mobile frames + optional desktop in separate slides |
| FAQ | Accordion full width |
| Final CTA | Text → full-width buttons |

**Sticky CTA:** Optional bottom bar after scroll past hero; single primary button; dismissible or auto-hide near final CTA to avoid double. Skip if it fights install/browser chrome.

---

## 12. Desktop layout patterns

| Section | Pattern |
|---------|---------|
| Hero | Split ~45/55 text/product |
| Questions | 4×2 grid |
| Problem | 2×2 or 4-up cards |
| How it works | Horizontal stepper (wrap to 2 rows if needed) |
| Core financial | Split + gold-rules strip full width below |
| Tour | Tabs or 3-up grid |
| Advanced | 3–4 column card grid |
| Mobile/PWA | Text + large phone |
| FAQ | Narrow centered column |

---

## 13. Motion (marketing only)

Ship 2–3 intentional motions max:

1. Soft fade/slide-up of hero content  
2. Subtle screenshot parallax or fade on scroll  
3. FAQ accordion height animate  

No continuous neon pulse, no particle fields.

---

## 14. Accessibility

- Contrast AA+ for body and CTAs  
- Focus rings visible  
- Don’t rely on color alone for pending/approved (include text)  
- Tap targets ≥44×44px  

---

## 15. What implementation must reuse

Prefer product design tokens (`--pf-teal-*`, status, radius, spacing) so the landing page feels like the same company as the app — **without** importing authenticated shell/nav components.
