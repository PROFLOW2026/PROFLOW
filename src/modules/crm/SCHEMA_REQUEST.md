# SCHEMA_REQUEST — CRM opportunity follow-up (Agent CRM-UX)

**Agent:** CRM-UX  
**Do not apply in 0000–0035.** Portal stays off. No email notifications.

`crm_opportunities` has **no** `next_action_at` (or equivalent follow-up due column). Current stored fields used by the UX instead:

| Existing column | How the UI uses it until 0036+ |
|---|---|
| `notes` | Follow-up / next-action free text on the opportunity row |
| `expected_start_date` | Optional dated field already in schema (project start — **not** a follow-up due date) |
| `crm_opportunity_notes.body` | Dated follow-up log entries |

There is no CRM activity table. History shows stored notes plus `audit_events` filtered by `entity_type = crm_opportunity` and `entity_id`.

## Requested columns on `app.crm_opportunities`

| Column | Type | Null | Purpose |
|---|---|---|---|
| `next_action_at` | `timestamptz` | yes | Due instant for the next follow-up. Board/detail can sort and badge overdue items. |
| `next_action_text` | `text` | yes | Short next-action label, distinct from general `notes`. |

Do **not** reuse `expected_start_date` as `next_action_at` — that date is expected project start.

### After 0036

- Map both columns in `crm.repository` `mapOpportunity`
- Accept them on create/update opportunity schemas
- Show `next_action_at` on the pipeline board cards and the follow-up panel
- Keep using `crm_opportunity_notes` for the log; do not invent an activity table
