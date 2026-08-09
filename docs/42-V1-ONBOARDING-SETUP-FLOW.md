# 42 — V1 Onboarding & First-Use Flow

**Status:** UX planning draft  
**Phase:** Planning only  
**Rule:** No long mandatory setup wizard

---

## 1. Purpose

Get a user into useful work in minutes, with optional preferences that never lock the organization.

---

## 2. Recommended onboarding screens

### Screen 1 — Account

- Sign up / sign in
- Email verification path (auth provider TBD)

### Screen 2 — Business name

- Organization display name (required)

### Screen 3 — Locale defaults

- Country (required for Country Pack defaults)
- Language (default Hebrew for Israel-first)
- Currency auto-suggested from country; editable where allowed
- Timezone default from country/browser (editable)

### Screen 4 — Optional “What do you want to manage?”

Checkboxes (defaults off except Projects implied):

- Projects (always on conceptually)
- Employees & time
- Suppliers / subcontractors
- Business expenses / overhead
- Billing & collections

**Primary escape:** `Skip — I'll set this up later`

Selections affect **navigation defaults only**, not permanent restrictions.

Optional light profession/business type picker may apply presets (`36`) — also skippable.

---

## 3. First-use experience (empty org)

Do **not** show an enterprise dashboard with twenty zero widgets.

### Welcome state

**Headline:** Welcome to ProjectFlow (working name)

**Primary CTA:** `Create your first project`  
**Secondary:** `Add an expense`  
**Tertiary:** `Explore setup` → Settings

Once data exists, Home becomes data-driven (`46`).

---

## 4. Post-onboarding landing

| Condition | Land on |
|-----------|---------|
| No projects | Welcome / empty Home |
| Has projects | Home dashboard |
| Deep link invite | Accept invite → relevant project or Home |

---

## 5. Invitee onboarding

Invited users:

1. Accept invite  
2. Set password / confirm identity  
3. Land in org with role-appropriate nav  
4. Skip org-create screens  

They do not re-run country/module wizard unless they become owners of a new org.

---

## 6. Revisit setup anytime

Settings must allow changing:

- country/language/currency (with care for historical money)
- module visibility
- professions/services
- tax defaults
- users/roles

No “you chose wrong at signup” trap.

---

## 7. Related docs

- Progressive complexity → `39`
- Navigation → `41`
- Flows → `43`
- Screens → `44`
