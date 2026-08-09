# 31 — Mobile, PWA & Offline Field UX

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** Responsive Web = V1; PWA V2–V3; Native Later/Research  
**Class:** Core extension (PWA) / Optional (native)

---

## 1. Purpose

Plan progressive mobile capability for field-heavy use without requiring native apps in V1.

---

## 2. Stages

### Stage 1 — Responsive Web (V1)

- phone-friendly critical actions
- fast time entry, expense capture, photos, change request, approvals
- no offline guarantee required

### Stage 2 — PWA (later)

- installable
- camera integration improvements
- quick capture
- offline drafts
- queued uploads
- push notifications (with `26`)

### Stage 3 — Native apps (only if justified)

Evaluate after real usage evidence (camera reliability, offline needs, store distribution, performance).

---

## 3. Offline-sensitive actions

- time entry
- expense capture
- receipt photo
- site photos
- daily log
- change request
- notes

---

## 4. Sync & conflict handling (conceptual)

```text
Local draft created offline
  → queued mutation
  → sync when online
  → server validates authz + domain rules
  → success | conflict | rejection
```

Conflict policy options (decide later):

- last-write-wins for low-risk notes
- server-wins for issued financial artifacts
- user resolution UI for ambiguous edits
- never silently mutate approved commercial amounts offline

Offline mode creates **drafts/candidates**, not authoritative issued financial documents.

---

## 5. V1 impact

**Responsive web only** as already planned. No PWA/native scope expansion in V1.

---

## 6. Related documents

- Field operations → `22`
- Documents/capture → `09`
- Notifications → `26`
- V1 scope → `16`
- Capability map → `19`
