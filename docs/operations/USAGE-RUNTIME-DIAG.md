# Usage runtime diagnostics (backend only)

Set on **Vercel Production** (and optionally Preview):

```bash
USAGE_RUNTIME_DIAG=1
```

When enabled, the app emits compact single-line logs (no PII):

| Tag | Source |
| --- | --- |
| `PF_USAGE_DIAG` | Proxy (matched page routes only; `/api/*` excluded from proxy) |
| `PF_USAGE_WORKER` | Internal worker routes (`start` / `end`) |
| `PF_USAGE_SELF_HTTP` | Self-HTTP kicks (DG, OCR, storage provision) |

**Analyze in Vercel → Logs** (filter `PF_USAGE_DIAG` or `PF_USAGE_WORKER`).

Disable by removing the env var or setting `USAGE_RUNTIME_DIAG=0`.
