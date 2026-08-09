# 29 — Reporting, Dashboards & Analytics

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** basic summaries V1; richer dashboards V1.x–V2; configurable BI Later  
**Class:** Core extension

---

## 1. Purpose

Plan analytics across project and organization levels without hardcoding every dashboard forever.

---

## 2. Design rules

1. Metrics must use explicit definitions (especially profit / margin).
2. Do not casually label metrics as “Revenue” in V1 language.
3. Respect permission scoping (financial fields, project scopes).
4. Prefer composable metric definitions over one-off hardcoded screens over time.
5. Exports and API access should reuse the same metric definitions where possible.

---

## 3. Project reporting

- contract value (original/current)
- pending changes
- billing (invoiced)
- collection (paid / outstanding)
- direct cost
- overhead / allocated shared cost
- true / fully loaded cost
- forecast final cost
- profit / forecast profit
- margin
- labor
- vendor
- material
- progress

---

## 4. Organization reporting

- all active projects
- profitable / loss-making projects
- total overhead
- cash position / forecast (as available)
- receivables
- vendor exposure
- workforce cost
- asset cost
- project comparison

---

## 5. Historical intelligence

- similar project comparisons
- actual vs estimate
- vendor performance
- employee/team productivity
- project type profitability
- profession/service profitability

Depends on sufficient historical data and stable taxonomy (`ProfessionDomain`, `ServiceType`, templates).

---

## 6. Export & access

- CSV
- Excel
- PDF
- API (`32`)

---

## 7. Configurability (later)

Do not hardcode all dashboards forever. Future:

- saved views
- configurable widgets
- custom metric filters
- role-specific home dashboards

Canonical metric registry should remain governed (not arbitrary SQL by end users in V1–V2).

---

## 8. V1 impact

V1 includes basic project/org financial summaries already in scope (`16`).  
Advanced BI/configurable reporting is future.

---

## 9. Related documents

- Financial model → `04`
- AI assistant questions → `27`
- API → `32`
- Capability map → `19`
