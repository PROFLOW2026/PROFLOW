# 26 — Communications & Automations

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** in-app/email V1.x; richer automations V2; SMS/WhatsApp/push Later  
**Class:** Core extension + Integrations

---

## 1. Purpose

Plan multi-channel notifications and automations driven by domain events, without binding core business logic to a single provider.

---

## 2. Architecture rule

```text
Domain Event
  → Notification Policy / Automation Rule
    → Channel Adapters (email, SMS, WhatsApp, push, in-app)
```

Core emits events. Providers are replaceable adapters.

---

## 3. Channels

- in-app notifications
- email
- SMS
- WhatsApp
- mobile push

Channel availability may depend on Country Pack, org settings, and integrations (`32`).

---

## 4. Example triggers

- quote sent
- approval needed
- change approved/rejected
- payment due
- overdue payment
- insurance expiry
- certification expiry
- budget warning
- cost overrun
- employee missing time
- document missing
- scheduled work approaching
- supplier delivery late
- maintenance due

---

## 5. Preference & control model

- organization defaults
- per-user preferences
- quiet hours
- escalation paths
- digest emails
- templates
- localization (English canonical keys; Hebrew/other locale bodies)

Users should be able to reduce noise without missing financially critical alerts (policy-configurable).

---

## 6. Conceptual entities

| Entity | Meaning |
|--------|---------|
| **DomainEvent** | Happened fact in the system |
| **NotificationRule** | Whether/how to notify |
| **NotificationTemplate** | Localized template |
| **NotificationDelivery** | Attempt/result per channel |
| **UserNotificationPreference** | User channel/opt settings |

---

## 7. V1 impact

V1 needs transactional email for auth/invites (implementation-time).  
Rich in-app notification center and multi-channel automations are not V1 scope expansions beyond essentials.

---

## 8. Related documents

- Compliance expiries → `24`
- Portals → `25`
- Integrations → `32`
- Localization → `10`, `30`
- Capability map → `19`
