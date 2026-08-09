# 27 — AI, OCR & Intelligent Assistance

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** OCR V2–Later; predictive/assistant Later / Research  
**Class:** Optional module + Integration  
**Hard rule:** AI is outside the system of record

---

## 1. Purpose

Document intelligence capabilities while keeping deterministic domain data authoritative.

---

## 2. Governing rules

1. AI **proposes**; users/systems confirm before financially meaningful posts.
2. Deterministic entities (Contract, ChangeOrder, BillingRecord, Expense, Payment, rates) remain authoritative.
3. Store provenance/explanation where appropriate (model, prompt/version, confidence, source document).
4. Architecture must allow changing AI/OCR providers later (`32` adapter style).
5. Tenant isolation applies to prompts, documents, and embeddings/indexes.

---

## 3. Document intelligence

- invoice OCR
- receipt OCR
- quote extraction
- contract extraction
- insurance document extraction
- field recognition
- line-item recognition
- vendor matching
- duplicate detection

Reuse `CaptureJob` / `CaptureExtraction` concepts from `09`.

Flow:

```text
Document upload
  → CaptureJob
  → Extraction proposals
  → Human confirm/edit
  → Create/update domain records
```

---

## 4. Suggestions

- project assignment suggestion
- WorkPackage suggestion
- expense category
- tax treatment suggestion
- allocation suggestion

Suggestions are non-binding defaults.

---

## 5. Financial intelligence

- cost overrun prediction
- labor overrun
- margin deterioration
- unusual spending
- project completion cost prediction
- cash-flow risk
- missing billing
- approved work not billed
- work done without approved Change Order

These consume facts already planned in financial/time/change models (`04`, `05`, `06`).

---

## 6. Business intelligence assistant

Example natural-language questions:

- Which projects are losing money?
- Which subcontractor costs increased?
- What will my expected cash position be?
- Which project has the most unbilled work?

Assistant answers should cite underlying metrics and never silently rename Contract Value as “Revenue”.

---

## 7. Conceptual entities

| Entity | Meaning |
|--------|---------|
| **CaptureJob** | OCR/AI processing job |
| **CaptureExtraction** | Proposed fields |
| **InsightAlert** | Predicted risk/opportunity signal |
| **AssistantQueryLog** | Optional audit of Q&A (privacy-aware) |
| **ModelProviderConfig** | Provider adapter settings |

---

## 8. V1 impact

**No AI/OCR in V1.**  
Preserve document/expense/split model so capture can be added later without redesign.

---

## 9. Related documents

- Documents → `09`
- Financial model → `04`
- Reporting → `29`
- Integrations → `32`
- Capability map → `19`
