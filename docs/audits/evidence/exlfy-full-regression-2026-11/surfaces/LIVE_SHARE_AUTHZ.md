# BUG-011 — Live Share authorization (all entry points)

## Primary path

`startLiveShare(actor, { projectId }, deps)`  
→ `authorizeProject(actor, { organizationId, projectId, need: 'document' })`

### Internal actors (`access.ts`)

```ts
if (actor.kind === 'internal') {
  await assertProjectCapability(actor.context, input.projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  // `input.need` is ignored
  return { ... };
}
```

**Proven gap:** `need: 'document'` has **no effect** for internal users.

### External actors

`need === 'view'` → `DOCUMENT_VIEW`; else → `DOCUMENT_UPLOAD`. Contractors still need upload grant to host — stricter than internal.

## Entry points to audit on fix

| Surface | Likely caller |
|---------|----------------|
| Infra workspace UI | Host controls / live share start button |
| `infra-mapping/actions.ts` | Server action wrapping `startLiveShare` |
| Live share host page | `/api` or app route for host |

Any new wrapper that calls `startLiveShare` inherits the same hole until `authorizeProject` respects `need` for internals (e.g. require `documents.view` / share / manage).

## Tests

- `permissions-parity.test.ts` — PASS for infra matrix (does not assert live-share need).
- Dedicated live-share authz unit for internal view-only — **missing** (gap).

## Runtime

Browser reproduction with a view-only internal user: **UNVERIFIED** in this wave (needs seeded role).
