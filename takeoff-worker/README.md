# Takeoff worker

Stateless Python worker for electrical smart BOQ (`takeoff-worker/`).

## Local dev (Windows)

```powershell
.\scripts\takeoff-worker-dev.ps1
```

Set app env: `TAKEOFF_WORKER_URL=http://127.0.0.1:8765`, `TAKEOFF_WORKER_SECRET=<random>`.

## EXLFY production from this PC (Windows)

1. One-time: copy `scripts/deploy/takeoff-worker.local.env.example` → `scripts/deploy/takeoff-worker.local.env` and set the same `TAKEOFF_WORKER_SECRET` as Vercel Production. Ensure Docker image exists: `docker build -t exlfy-takeoff-worker:prod takeoff-worker`.
2. Double-click **`הפעל כתב כמויות.bat`** (repo root) — starts Docker worker + Cloudflare quick tunnel, checks health, updates Vercel `TAKEOFF_WORKER_URL` when the tunnel URL changes (requires `vercel login`).
3. Double-click **`כבה כתב כמויות.bat`** — stops only this worker and its tunnel.

Quick trycloudflare URLs change on each cold start; for a stable URL use a free Cloudflare named tunnel (not a paid add-on).

## API

- `POST /v1/jobs` — accepts `WorkerJobRequest` (HMAC header `x-takeoff-secret`)
- `GET /v1/jobs/{id}` — job state
- `DELETE /v1/jobs/{id}` — cancel
- `POST /v1/export/annotated-pdf` — PDF bytes (501 until export module ships)
- `POST /v1/export/boq-pdf` — BOQ PDF
- `GET /healthz` — engine availability

**Runtime must not include PyMuPDF (AGPL).** LibreDWG is external CLI only.