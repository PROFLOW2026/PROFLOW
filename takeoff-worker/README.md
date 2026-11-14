# Takeoff worker

Stateless Python worker for electrical smart BOQ (`takeoff-worker/`).

## Local dev (Windows)

```powershell
.\scripts\takeoff-worker-dev.ps1
```

Set app env: `TAKEOFF_WORKER_URL=http://127.0.0.1:8765`, `TAKEOFF_WORKER_SECRET=<random>`.

## API

- `POST /v1/jobs` — accepts `WorkerJobRequest` (HMAC header `x-takeoff-secret`)
- `GET /v1/jobs/{id}` — job state
- `DELETE /v1/jobs/{id}` — cancel
- `POST /v1/export/annotated-pdf` — PDF bytes (501 until export module ships)
- `POST /v1/export/boq-pdf` — BOQ PDF
- `GET /healthz` — engine availability

**Runtime must not include PyMuPDF (AGPL).** LibreDWG is external CLI only.