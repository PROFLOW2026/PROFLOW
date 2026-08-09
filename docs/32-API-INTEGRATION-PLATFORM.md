# 32 — API & Integration Platform

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** V2–Later  
**Class:** Platform / Enterprise / Integrations

---

## 1. Purpose

Plan a provider-agnostic integration surface so core domain logic is never tightly coupled to a third party.

---

## 2. Future platform capabilities

- public API
- API keys
- OAuth integrations
- webhooks
- import
- export
- accounting connectors
- payroll connectors
- calendar
- email
- e-sign
- payment services
- maps/location
- cloud storage
- BI tools
- external ERPs

---

## 3. Adapter approach

```text
Core Domain
  → Integration Port (interface)
    → Provider Adapter A/B/C
```

Examples of ports:

- AccountingPort
- ESignPort
- SmsPort
- PaymentPort
- ObjectStoragePort (also relevant at implementation time)
- AiCapturePort (`27`)

Core use-cases depend on ports, not vendor SDKs.

---

## 4. Conceptual platform entities

| Entity | Meaning |
|--------|---------|
| **ApiClient** | External app/integration registration |
| **ApiKey / OAuthToken** | Credentials |
| **WebhookEndpoint** | Receiver URL + secret |
| **WebhookDelivery** | Attempt log |
| **IntegrationConnection** | Connected external account |
| **ExternalObjectMap** | Local ↔ remote IDs |
| **IdempotencyKey** | Duplicate protection |

---

## 5. Design hygiene for later API stability

When implementation starts (not now):

- prefer stable public IDs
- explicit API versioning
- tenant scoping on every call
- fine-grained authz
- rate limits
- audit of sensitive exports

---

## 6. V1 impact

**No public API platform in V1.**  
Internal backend boundaries should still remain clean so extracting ports later is feasible (`14`).

---

## 7. Related documents

- Accounting integrations → `28`
- Notifications channels → `26`
- AI providers → `27`
- Enterprise security → `33`
- Import/export → `37`
- Capability map → `19`
