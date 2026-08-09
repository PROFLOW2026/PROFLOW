# ProjectFlow — Landing Page Visual Prototype

**Isolated owner-review prototype only.**  
Does **not** touch the live Next.js application.

## Open locally

1. Open this folder in a file explorer, **or**
2. Double-click `index.html`, **or**
3. From the repo root:

```bash
# PowerShell example — static preview
Start-Process "docs/marketing/prototype/index.html"
```

Or serve the folder with any static server (optional):

```bash
npx --yes serve docs/marketing/prototype
```

No ProjectFlow `package.json` dependency is required.

## What this is

A Hebrew RTL marketing landing page visualizing the approved copy and structure from:

- `LANDING-PAGE-MASTER-SPEC-HE.md`
- `LANDING-PAGE-VISUAL-DIRECTION.md`
- `LANDING-PAGE-SCREENSHOT-PLAN.md`
- related SEO / conversion / claims docs

## Sections (15/15)

| ID | Anchor | Name |
|----|--------|------|
| S01 | `#hero` | Hero |
| S02 | `#owner-questions` | Owner questions |
| S03 | `#problem` | Problem |
| S04 | `#how-it-works` | How it works |
| S05 | `#financial-control` | Core financial control |
| S06 | `#costs` | Expenses / workforce / suppliers |
| S07 | `#changes-billing` | Changes / billing / payments |
| S08 | `#reports` | Reports / profitability |
| S09 | `#product-tour` | Product tour |
| S10 | `#advanced` | Advanced modules |
| S11 | `#mobile-app` | Mobile / installable app |
| S12 | `#team` | Team / permissions |
| S13 | `#audience` | Who it is for |
| S14 | `#faq` | FAQ |
| S15 | `#final-cta` | Final CTA |

## Owner review mode

- Bottom-start **Review** button (small, low-opacity) toggles section ID badges and screenshot `SC-XX` labels.
- Or open with `?review=1`.

## Screenshot placeholders

SVG frames under `assets/` named for the screenshot plan:

`pf-landing-sc-01-desktop.svg` … `sc-11`

Replace later with real PNGs/WebPs **using the same filenames** (or update `src` only) — layout slots are already sized.

Hebrew captions under each frame are marketing copy. Technical `SC-XX` IDs appear only in review mode.

## CTA behavior (prototype)

| Button | Action |
|--------|--------|
| התחילו עכשיו | Links to `/he-IL/sign-up` (no auth implemented) |
| ראו איך זה עובד | Scrolls to `#product-tour` |
| בקשו הדגמה | `mailto:` placeholder |
| כניסה | `/he-IL/sign-in` |

## Isolation rule

**Do not edit files outside `docs/marketing/prototype/`** when iterating this prototype.
