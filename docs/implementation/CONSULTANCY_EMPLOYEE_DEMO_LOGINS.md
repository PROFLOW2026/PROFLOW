# Consultancy Demo — Employee App Login Credentials

**Organization:** אופק הנדסת חשמל וייעוץ בע"מ  
**Organization ID:** `c8f4a2e1-9b3d-4f7a-ae6c-1d2e3f4a5b6c`

## Owner (full ProjectFlow)

| Field | Value |
|-------|-------|
| Email | `leokid2026@gmail.com` |
| Role | Owner — full web application |

## Employee App

| Field | Value |
|-------|-------|
| URL | `/he-IL/employee/login` |
| PIN (all demo employees) | `747975` |

Each employee has a **unique username** and the **same demo PIN**.

| Employee | Role profile | Username | PIN |
|----------|--------------|----------|-----|
| אורי לביא | Management / all organization | `OFEK-URI` | `747975` |
| יעל כהן | Professional engineer | `OFEK-YAEL` | `747975` |
| רועי מזרחי | Professional engineer | `OFEK-ROEI` | `747975` |
| דניאל אברהם | Technical professional | `OFEK-DANIEL` | `747975` |
| נועה פרץ | Technical professional | `OFEK-NOA` | `747975` |
| מיכל בן דוד | Office / admin | `OFEK-MICHAL` | `747975` |

## Notes

- **אורי** uses the Employee App **management** profile with organization-wide project/task visibility. His separate Owner login (`leokid2026@gmail.com`) remains the full ProjectFlow owner account.
- **אורי** has `owner_manager` attendance exemption — no attendance reporting requirement.
- Other employees use role-appropriate **assigned** or **self** scopes as configured in production grants.
- PIN change on first login is **disabled** for demo testing (`pin_must_change = false`).
- Replace the shared PIN before any non-demo use.

**Last updated:** 2026-09-21
