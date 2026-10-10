# Employee App vs main `(app)` for field workers

## Two surfaces, one organization

Internal people may hold **both**:

- An **org membership role** (for example `worker` or `manager`) used on the main **`/(app)`** shell.
- An **Employee App account** (`employee` role + `employee_app_accounts`) used on **`/employee/**`**.

These are **not merged**. Permissions on `/employee` come from **explicit employee grants** (presets are defaults only), not from copying the org role wholesale.

## Org `worker` vs Employee preset `field_worker`

| Concept | Where it lives | Typical use |
|--------|----------------|-------------|
| Org role **`worker`** | `(app)` RBAC | Field ops on the main app when the business still uses that shell for some users. |
| Employee preset **`field_worker`** | Employee App grants | Mobile-first tasks, documents, and projects on `/employee` without office finance modules. |

A person can be org `worker` **and** have an active Employee App account. That does **not** collapse permissions: each surface enforces its own grant set.

## Project Manager vs Organization Manager

- **Project capabilities** (per-project PM / operational lead) are separate from the org **`manager`** role template.
- The org template display name is **Organization Manager** (SYS-001) to avoid implying every org `manager` is a single-project PM only.

## Guidance

- Prefer **`/employee`** for day-to-day internal staff when Employee App access is enabled.
- Keep **`/(app)`** for owners, back-office configuration, and users without Employee App accounts.
- Optional UX: a light banner on `(app)` field-ops when the user also has an active Employee account (“Open Employee App”) — no forced redirect.
