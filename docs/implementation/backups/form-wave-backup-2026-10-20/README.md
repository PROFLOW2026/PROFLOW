# Form wave pre-change backup (2026-10-20)

Snapshot taken **before** Main App FORM family implementation (post-LIST closeout).

## Off-repo mirror (canonical)

`C:\Users\ERAN YOSEF\AppData\Local\Cursor\AgentStores\cursor_agent_stores\u296407457\files\projectflow-form-wave-backup-2026-10-20`

- Full working tree mirror via `robocopy /MIR` (excludes `node_modules`, `.next`, `.git`)
- Includes **tracked + untracked** files present at snapshot time
- `git-status-snapshot.txt` and `git-diff-stat-snapshot.txt` at backup root

## Prior backup (not overwritten)

Earlier design/LIST recovery backups remain under the same user store (`projectflow-design-recovery-*` if present).

## Restore (local only)

Copy from the mirror path back into the workspace, or compare file-by-file. Do **not** use `git checkout -- .` / `reset` / `clean` without Owner approval.
