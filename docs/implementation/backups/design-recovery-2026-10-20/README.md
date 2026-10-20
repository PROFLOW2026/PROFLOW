# Design work recovery point — 2026-10-20

**Purpose:** Preserve local Main App design work before any further changes.  
**No commit, push, or deploy.**

## Primary backup (off repo tree)

```
C:\Users\ERAN YOSEF\AppData\Local\Cursor\AgentStores\cursor_agent_stores\u296407457\files\projectflow-design-recovery-2026-10-20\
```

| File | Contents |
|------|----------|
| `HEAD.txt` | Git commit `d9b79f4c` |
| `git-status-sb.txt` | `git status -sb` snapshot |
| `changed-files.txt` | All paths diff vs HEAD |
| `changed-design-scope.txt` | `src/`, `docs/implementation/`, `scripts/` only |
| `untracked-files.txt` | Including `vendors-list-owner.css` |
| `worktree-vs-head.patch` | Full `git diff HEAD` |
| `MAIN_APP_ROUTE_MANIFEST.snapshot.json` | Manifest at backup time |
| `untracked-design-snapshot-2026-10-20/` | **Full file copies** for untracked design assets (patch does not include these) |

### Untracked snapshot highlights

- `vendors-list-owner.css`, `owner-app-kit.css` (flat copies at snapshot root)
- `src/components/patterns/main-app/**`
- `docs-implementation/**` (copy of `docs/implementation/` at backup time)

## Restore (manual, selective)

Do **not** apply the whole patch blindly. To restore one file:

```powershell
git show HEAD:path/to/file > path/to/file   # only when intentionally reverting ONE file
# or pick hunks from worktree-vs-head.patch
```

## In-repo pointer

This folder documents the backup; the patch lives in the user agent store path above.
