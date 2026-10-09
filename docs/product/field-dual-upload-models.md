# Field dual upload models (PM-003)

ProjectFlow exposes **two complementary field stacks**, both supported in production:

| Stack | Primary use | Evidence model |
|-------|-------------|----------------|
| **DG field / site-log** | Developer–GC coordination, structured daily logs | `@/modules/evidence` gallery + entity links |
| **Legacy field-ops** | Punch, inspections, classic site attachments | `@/modules/field-ops` + documents module |

They are **not merged into one engine**. New DG features should prefer the evidence module; field-ops remains for punch/inspection workflows until a future consolidation wave.

**Owner decision (Build Wave 4):** document coexistence; no forced migration in this wave.
