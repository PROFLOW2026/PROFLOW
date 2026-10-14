# AGENT 15 — UI Navigation, Mobile, Portals, PWA & i18n

| Field | Value |
|--------|--------|
| **Agent** | AGENT_15 (UI / navigation / mobile / portals) |
| **Audit date** | 2026-10-11 |
| **Repository commit** | `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e` (matches `2026-10-full-system-audit` README baseline) |
| **Method** | Read-only static analysis: App Router shells, nav builders, PWA manifest/SW, locale catalogs, unit tests. **No** production browser session, **no** Playwright/E2E run. |
| **Hints (not proof)** | `docs/audits/_route-inventory-2026-10-09.txt`, `scripts/audit-verification/resolve-route-urls.mjs`, `docs/audits/2026-10-full-system-audit/MODULE_ROUTE_INVENTORY.json` |

---

## Executive summary

Navigation architecture is **mature and test-backed** on the contractor portal (central `PORTAL_ROUTES` + Vitest dead-link guard) and **consistent** on the owner app (`NAV_ITEMS` — all 60 hrefs resolve to `(app)` pages in a static check). Employee and contractor shells both use **mobile bottom bars** with safe-area padding, locale-aware `Link` from `@/shared/i18n/navigation`, and **RTL `dir`/`lang`** driven by `LOCALE_METADATA` + `LocaleDocumentAttributes`.

Remaining gaps cluster around **cross-surface actions** (contractor → owner org flow), **PWA install metadata** (single English manifest, owner `start_url`), **mobile discoverability** (employee notifications vs contractor bell), and **locale persistence asymmetry** (employee profile vs contractor cookie-only).

**Finding counts (this agent only):**

| Severity | Count |
|----------|------:|
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 3 |
| INFO | 3 |
| **Total** | **11** (`U15-001` … `U15-011`) |

---

## 1. Surface inventory

| Surface | Base path | Shell / nav source | Mobile chrome | Locale switch (authenticated) |
|---------|-----------|-------------------|---------------|-------------------------------|
| Owner / back-office | `/[locale]/(app)/**` | `components/shell/navigation.ts` → `AppShell` + `MobileNav` | Bottom bar (up to 4 primaries + More) | Settings → profile `localePreference` + user menu patterns |
| Employee app | `/[locale]/employee/**` | `buildEmployeeNavItems` → `EmployeeSideNav` + `EmployeeBottomNav` | Fixed primary hrefs (home/time/projects/tasks) + More overflow | `EmployeeUserMenu` → `persistLocalePreferenceAction` |
| Contractor portal | `/[locale]/contractor/**` | `PORTAL_ROUTES` / `buildPortalMobileNav` → `ContractorPortalShell` | 5 tabs (today/projects/work/finance/more) | Portal user menu → **cookie only** |
| Pre-auth | employee login, `(auth)`, contractor `(auth)`, marketing | `LocaleSwitcherInline` | N/A | Cookie + `router.replace` (no profile) |

**Route scale @ commit** (from `MODULE_ROUTE_INVENTORY.json`): 408 `page.tsx` files — `(app)` 252, `employee` 101, `contractor` 41, plus auth/legal/onboarding/portal/setup.

**Locales:** `he-IL`, `en`, `ar`, `ru` (`src/shared/i18n/config.ts`). RTL: `he-IL`, `ar`. URL prefix: **always** (`localePrefix: 'always'`, `localeDetection: false`).

---

## 2. PWA & manifest

| Component | Location | Behavior |
|-----------|----------|----------|
| Manifest route | `src/app/manifest.webmanifest/route.ts` | Dynamic JSON from `buildWebManifest(locale)`; cookie via `NEXT_LOCALE` |
| Manifest body | `src/modules/offline/domain/web-manifest.ts` | `start_url: /{locale}`, `scope: /`, English `name`/`short_name`/`description`, icons `/icons/icon-192.png`, `/icons/icon-512.png` |
| Registration | `src/modules/offline/ui/pwa-bootstrap.tsx`, `public/sw.js` | Global scope `/`; manifest network-first; navigations network-first + offline fallback |
| Install CTAs | Owner dashboard/marketing; contractor **More** hub; employee home (`EmployeeInstallButton`) | Same manifest / start URL for all personas |

Icons verified on disk under `public/icons/` (192 + 512 PNG).

---

## 3. i18n & RTL (static)

| Check | Result |
|-------|--------|
| Key parity `nav.json`, `employeeApp.json`, `contractorPortal.json`, `common.json`, `offline.json` (ar/ru vs en) | **0 missing keys** (Node flat-key scan) |
| Full catalog key parity (all `src/locales/en/*.json` vs ar/ru) | **0 missing keys** |
| `employeeApp.pwa.shortName` / `admin.shareWhatsApp` in ar/ru | Identical to en brand strings (`ProjectFlow`, `WhatsApp`) — acceptable product names |
| Server HTML `lang`/`dir` | `src/app/layout.tsx` seeds from cookie; client sync via `LocaleDocumentAttributes` |

**Not verified:** runtime ICU/plural rules, screenshot RTL layout, or copy quality review in ar/ru.

---

## 4. Findings register

| ID | Severity | Title | Surfaces |
|----|----------|-------|----------|
| **U15-001** | **HIGH** | Contractor “Connect project in ProjectFlow” links into owner `(app)` without org session handoff | Contractor portal |
| **U15-002** | MEDIUM | Global PWA manifest is English-only and always opens owner home | All installed personas |
| **U15-003** | MEDIUM | Employee app lacks header notification affordance; mobile nav hides notifications under More | Employee |
| **U15-004** | MEDIUM | Contractor authenticated locale change is cookie-only (no principal/profile persist) | Contractor |
| **U15-005** | LOW | Pre-auth locale switcher uses hardcoded English `aria-label` | Auth / marketing |
| **U15-006** | LOW | Employee CRM hub shows generic empty state when `CRM_READ` is denied | Employee |
| **U15-007** | LOW | Non-employee session hitting employee shell redirects to owner `/` | Employee guard |
| **U15-008** | INFO | Owner `NAV_ITEMS` hrefs resolve to existing `(app)` pages (static) | Owner |
| **U15-009** | INFO | Contractor `PORTAL_ROUTES` + unit test enforce implemented ↔ disk parity | Contractor |
| **U15-010** | INFO | Employee mobile primary tabs are fixed-slot (no back-fill) — by design | Employee |
| **U15-011** | INFO | Employee / contractor routes use locale-aware navigation primitives consistently | All |

---

### U15-001 — Contractor org-connection CTA crosses surfaces incorrectly

**Severity:** HIGH  
**Evidence:** `src/app/[locale]/contractor/(portal)/more/page.tsx` — `Link href="/projects/connect-developer"`. Target page `src/app/[locale]/(app)/projects/connect-developer/page.tsx` calls `withOrgContext`, which requires org membership (`requireSession` + `activeOrganizationId`). Contractor portal layout explicitly **never** loads `OrgContext` (`src/app/[locale]/contractor/(portal)/layout.tsx` comment; `loadPortalSession` → `requireExternalContext` only).

**Expected UX (copy in `contractorPortal.hub.more.connectOrg*`):** User signs into **their** ProjectFlow organization and redeems a developer code.

**Actual for typical portal-only principal:** Navigation leaves external portal session and hits owner guard → `/sign-in`, `/onboarding`, or wrong org — not a guided handoff. Dual-role users (org member + contractor) may succeed only if they already have an active org session, with no UI to switch identity.

**Recommendation:** Dedicated external-safe redemption route, signed deep link, or explicit “open in browser / sign out of portal” flow with return URL — not a raw `(app)` link.

---

### U15-002 — PWA manifest not localized; start_url ignores employee/contractor entry

**Severity:** MEDIUM  
**Evidence:** `buildWebManifest` — fixed English `name`, `short_name`, `description`; `start_url` always `/${locale}` (owner/marketing root). Localized strings exist in catalogs but are unused in manifest (e.g. `employeeApp.pwa.name` / `employeeApp.pwa.shortName` in locale files).

**Impact:** Installed icon label and splash language stay English; employees/contractors installing from their hub still launch **owner** locale home, then must navigate to `/employee` or `/contractor`.

**Recommendation:** Either persona-specific manifest query params / separate scope, or document-only acceptance of single PWA with post-install routing — plus localized manifest fields per active locale.

---

### U15-003 — Employee notifications hard to reach on mobile

**Severity:** MEDIUM  
**Evidence:** `selectEmployeeMobilePrimaryItems` only promotes `/employee`, `/employee/time`, `/employee/projects`, `/employee/tasks` (`employee-navigation.ts`). Notifications (`/employee/notifications`) always land in **More** overflow — confirmed by `tests/unit/employee-app/employee-navigation.test.ts` (foreman / field_worker cases). Contractor portal exposes `NotificationBellLink` in top bar (`portal-shell.tsx`); employee top bar has **no** bell — only nav list entry.

**Impact:** Field users with notifications grant must open More → Notifications (extra tap vs contractor parity).

**Recommendation:** Header bell and/or promote notifications when unread count &gt; 0.

---

### U15-004 — Contractor locale preference not persisted on switch

**Severity:** MEDIUM  
**Evidence:** Contractor `UserMenu` in `portal-shell.tsx` sets `NEXT_LOCALE` cookie + `router.replace` only. Employee `EmployeeUserMenu` calls `persistLocalePreferenceAction` (profile + auth metadata). External principals store `locale` on sign-in (`contractor-auth.ts`) but portal UI does not update it on switch.

**Impact:** Returning contractors may revert to principal default locale despite in-session UI language choice (cookie vs DB mismatch).

**Recommendation:** Persist to external principal record (or shared profile when linked Supabase user exists), mirroring employee behavior.

---

### U15-005 — Pre-auth locale switcher a11y label not translated

**Severity:** LOW  
**Evidence:** `LocaleSwitcherInline` — `aria-label="Language"` hardcoded (`src/shared/i18n/locale-switcher-inline.tsx`). Used on employee login/set-pin, org auth layout, contractor auth layout, marketing header.

**Recommendation:** Use `common.labels.language` or dedicated a11y key in all four locales.

---

### U15-006 — Employee CRM shows misleading empty state without read grant

**Severity:** LOW  
**Evidence:** `CrmOpportunitiesHubView` with `surface="employee"` returns empty pipeline copy when `!canRead` instead of forbidden/access-denied (`src/modules/crm/ui/crm-opportunities-hub-view.tsx`). Nav hides CRM without `CRM_READ`, but deep links/bookmarks could still hit the route.

**Recommendation:** Align with other employee modules — redirect or explicit “no access” state.

---

### U15-007 — Employee guard sends wrong-role users to owner homepage

**Severity:** LOW  
**Evidence:** `assertEmployeeAppContext` redirects non-employee roles to `{ href: '/', locale }` (`session-guard.ts`), not `/employee/login` or org sign-in.

**Impact:** Confusing bounce for revoked employee role or misconfigured membership.

---

### U15-008 — Owner navigation href sanity (static)

**Severity:** INFO  
**Evidence:** Script over `NAV_ITEMS` hrefs vs `src/app/[locale]/(app)` tree — **0 missing** page targets @ commit.

**Limitation:** Does not prove permission/module gating or runtime 403 behavior.

---

### U15-009 — Contractor portal dead-link prevention

**Severity:** INFO  
**Evidence:** `tests/unit/contractor-portal/routes.test.ts` — `implemented` routes must exist on disk; every contractor `page.tsx` must appear in `PORTAL_ROUTES`. `routes.ts` documents the same invariant.

---

### U15-010 — Employee mobile primary bar intentional sparsity

**Severity:** INFO  
**Evidence:** `field_worker_time` preset yields only home + time primaries; notifications in overflow (`employee-navigation.test.ts`). Comment in `selectEmployeeMobilePrimaryItems`: missing slots are **not** back-filled from secondary modules.

**Product note:** Acceptable for minimal roles; document for owners configuring grants.

---

### U15-011 — Locale-aware linking convention

**Severity:** INFO  
**Evidence:** No `next/link` imports under `src/app/[locale]/employee/**` or `contractor/**` (grep). Navigation primitives re-exported from `@/shared/i18n/navigation`.

---

## 5. Dead routes & broken actions (summary)

| Area | Static dead-link scan | Known broken / risky action |
|------|----------------------|----------------------------|
| Owner `(app)` nav | None in `NAV_ITEMS` | Not runtime-tested |
| Employee nav (21 hrefs) | All `(shell)` pages exist | CRM empty-state (U15-006); connect N/A |
| Contractor portal | Registry + tests | **Connect developer** CTA (U15-001) |
| API / handlers | Out of scope | — |

`scripts/audit-verification/resolve-route-urls.mjs` maps inventory lines to URL paths with fixtures — useful for E2E planning, **not** executed as part of this agent.

---

## 6. Verification gaps

- No device lab (iOS standalone, Android TWA, safe-area, keyboard overlap).
- No authenticated E2E across employee / contractor / owner for the same Supabase user.
- No production URL crawl; `_route-inventory` treated as hint only.
- RTL visual regression not run (logical properties used in portal/employee UI grep sample — spot-check only).

---

## 7. Suggested follow-up tests (for integrator)

1. Playwright: contractor More → connect org CTA → assert expected handoff (or failure documented).
2. PWA: install from `/he-IL/employee`, cold-start `start_url` behavior.
3. Employee mobile: unread notifications → assert discoverability path (More vs bell).
4. Contractor: switch locale → re-login → assert persisted language.

---

*End of AGENT_15 report.*
