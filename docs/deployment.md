# EXLFY / ProjectFlow - Production deployment (temporary mandatory process)

**Status: in force until the Owner explicitly decides to return to automatic Git deployments.**
Rule file for agents: `.cursor/rules/production-deployment.mdc`. SQL / migrations are never part of this process
(see `AGENTS.md`).

## Why this exists

- The production Next.js (webpack) build peaks at about **10 GB** of memory (about 13.7 GB with child processes).
  The Vercel Hobby build machine has **2 cores / 8 GB**: builds there fail (`OOM` at a 4096 MB heap, `SIGKILL` at 6144 MB).
- Therefore **automatic Git deployments for `main` are disabled on purpose** (`vercel.json` -> `git.deploymentEnabled.main = false`).
  **A push to GitHub does NOT deploy anything.**
- Production is deployed from a **Linux/Docker build** of the committed code with `vercel deploy --prebuilt --prod`.
- A Windows production build is **not usable** (see "Windows problems" below). Never build for Production on Windows.

## Flow for a change

1. Implement; run **focused local checks matching the change** (the touched unit tests, `npx tsc --noEmit -p .`,
   `npx eslint <touched files>`). No broad suites unless the Owner asked.
2. Commit. Push to GitHub **only after the checks pass** (see `docs/RELEASE-PREFLIGHT.md` for the Owner-approved release gate).
   The push only syncs code; it does not deploy.
3. If the Owner approved a Production deployment: run the script below **once**.
4. Verify (section "Verification"). Report the commit SHA and the Production state.

No duplicate builds, no automatic retry loops: if a step fails, read the logs, report, and stop.

## Prerequisites (one time)

- Docker Desktop running (Linux containers). Image `node:22-bookworm` is pulled automatically.
- Vercel CLI installed and logged in on the host, and the project linked (`.vercel/project.json` exists; `.vercel/` is git-ignored).
- 6+ CPU cores and ~14 GB free memory for the container (the build uses a 12 GB Node heap).

## Production variables (build-time `NEXT_PUBLIC_*`)

Next.js inlines `NEXT_PUBLIC_*` at build time, so the Linux build needs real values. Prepare
`.deploy-linux/env.production.local` (git-ignored) once:

```powershell
New-Item -ItemType Directory -Force .deploy-linux | Out-Null
vercel env pull .deploy-linux/env.production.local --environment=production --yes
```

`vercel env pull` returns **`[SENSITIVE]` placeholders** for sensitive variables, including some `NEXT_PUBLIC_*`.
Replace only these three lines with the real **public** values (they are public by design, they ship to browsers):

```
NEXT_PUBLIC_APP_URL="https://proflow-two-bice.vercel.app"
NEXT_PUBLIC_SUPABASE_URL="<production Supabase project URL>"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<production anon key>"
```

Take the Supabase values from the Vercel dashboard (Production). If you copy them from a local `.env.local`, first prove
they are the production project: the `ref` claim inside the anon key's JWT payload must equal the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`, and the project must be the production one. If you cannot prove it, stop and ask the Owner.
Also delete a `VERCEL_OIDC_TOKEN=` line if present. Server-side secrets are **not** needed in the file with real values:
at runtime the deployment uses the variables stored in the Vercel project.

The launcher refuses to start when the app URL is not the production URL, the Supabase URL/key look wrong, or a
`NEXT_PUBLIC` value is still a placeholder. It never prints the values. Never commit this file.

## Deploy (the proven route)

From the repository root, with everything committed:

```powershell
powershell -File scripts/deploy/linux-prebuilt.ps1 -RequiredFunctions 'functions/[locale]/live/[token].func' -Wait
```

Use `-RequiredFunctions` for the route functions of the feature being shipped (paths relative to `.vercel/output`);
omit it when there is no specific route to prove. Without `-Wait` the container runs in the background; follow
`.deploy-linux/out/status` (`RUNNING`, `SUCCEEDED`, `FAILED_*`) and `.deploy-linux/out/steps.log`.

What the launcher (`scripts/deploy/linux-prebuilt.ps1`) does:

1. Refuses to run if a build container is already running (no double builds).
2. Validates the production variables (above).
3. `git archive --format=tar -o .deploy-linux/src.tar HEAD` - only **committed** files, so no `.env.local` and no uncommitted work.
4. Copies the container script with **LF** endings, plus `.vercel/project.json`.
5. Runs `vercel whoami` (refreshes the CLI login), writes a temporary `token.env` (Vercel token, org id, project id),
   starts the container, and **deletes `token.env` three seconds later**.
6. The container (`scripts/deploy/linux-prebuilt.sh`, `node:22-bookworm`, `--cpuset-cpus 0-5`, `--max-old-space-size=12288`):
   extract -> `npm i -g vercel@65.2.0` -> `vercel build --prod` (about 8 minutes) -> output checks -> **one**
   `vercel deploy --prebuilt --prod --yes`.

Output checks (the deploy is skipped and the status is `FAILED_*` when any of them fails):

- no symlink with a backslash target, no dangling symlink, every `.func` has a `.vc-config.json`;
- every route-transform argument matches the character set Vercel accepts (no Windows paths);
- no JSON in the output contains a Windows path, a user directory, `.env.local`, `.env.production.local`, or `aside-for-prebuilt`;
- the requested route functions exist;
- no `.env*` file and no occurrence of the Vercel token anywhere in `.vercel/output`.

### If only the deploy step failed (for example "token is not valid")

The build is still inside the stopped container; do not rebuild:

```powershell
vercel whoami                                   # refreshes the saved login
docker commit exlfy-linux-build exlfy-out       # keeps the finished build (large image)
# write .deploy-linux/token.env as in the launcher, then:
docker run -d --name exlfy-deploy --env-file .deploy-linux/token.env -e STAGE=deploy `
  -v "${PWD}\.deploy-linux:/in:ro" -v "${PWD}\.deploy-linux\out:/out" exlfy-out bash /in/linux-prebuilt.sh
Remove-Item .deploy-linux/token.env
```

`STAGE=deploy` re-runs the output checks on the existing build and then deploys once.

## Verification (always, at the end)

- Deployment state is **READY** and target **production** (Vercel dashboard, or `vercel inspect <url>`, or the REST API).
- `proflow-two-bice.vercel.app` (and `proflow-erans-projects-dffe05d5.vercel.app`) are aliased to the new deployment.
- The site answers and the changed behavior works (for example `/he-IL/live/<token>` opens without login while app routes still redirect to login).
- No other Production deployment was created (no automatic Git build). A prebuilt deployment has no GitHub SHA in
  Vercel; the deployed code is the commit that was `HEAD` when the script ran - report that SHA.

## Windows problems that were found (and how to avoid them)

| Problem | Cause | Avoidance |
| --- | --- | --- |
| Vercel build `OOM` / `SIGKILL` | Build needs about 10 GB; Hobby builder has 8 GB; raising the heap does not help | Build in Docker on a machine with enough memory (this process); Git auto-deploys are off |
| `spawn cmd.exe ENOENT` in `vercel build` | `Path` vs `PATH` casing in the Windows environment | Do not run `vercel build` on Windows |
| `EPERM: symlink` | Windows needs Developer Mode for symlinks | Not needed in Linux |
| Deploy `ENOENT ... .func` | Symlinks in `.vercel/output` had `\` targets | Linux build produces real links; checks reject backslash targets |
| `Builder returned invalid routes` | About 950 `x-server-action-name` transforms contained Windows absolute paths | Linux build; the transform check in the container script |
| `File does not exist: ".env.local.aside-for-prebuilt"` | `.vc-config.json` files referenced a renamed local env file | `git archive` of HEAD never contains `.env.local`; the checks reject these references |
| `set: -: invalid option` / `set -u\r` | CRLF line endings in a bash script | The launcher rewrites the script with LF before mounting it |
| Output check false positive ("no live route") | A glob `*live*` matched `deliveries`; symlinked `.func` directories were not walked | Required functions are checked by exact path (`-RequiredFunctions`) |
| `git archive` hangs / corrupts | Piping binary tar output through PowerShell cmdlets | Always `git archive -o <file>`; `tar -tf` on Windows prints harmless "empty filename" warnings for pax headers |
| Docker command quoting broken in PowerShell | `\"` handling | Mount a directory and run a script file instead of inline commands |
| `The token provided via VERCEL_TOKEN ... is not valid` | The saved CLI token expires within hours | The launcher runs `vercel whoami` first to refresh it |
| Logs deleted / duplicated runs | The same command was executed twice | One run at a time; the launcher refuses to start while the container runs |
| Tool call interrupted | Long `Start-Sleep` polling inside one call | Poll the status file with short checks |
| Build used placeholder public values | `vercel env pull` returns `[SENSITIVE]` for sensitive vars | Prepare `.deploy-linux/env.production.local` as above; the launcher validates it |

## Security rules for this process

- Secrets are never printed, logged, committed or put in the image: the token travels only through the temporary
  `token.env` (deleted right after the container starts), and the output is scanned for it before the deploy.
- `.deploy-linux/` is git-ignored and holds the env file, tar and logs. Do not copy it elsewhere.
- No personal paths or machine-specific values are in the committed scripts.

## Returning to automatic deployments (Owner decision only)

Only after the build-memory limit is solved (for example a larger Vercel build machine) **and** the Owner says so explicitly:
remove `git.deploymentEnabled` from `vercel.json`, update `AGENTS.md`, `.cursor/rules/production-deployment.mdc`
and this document in the same change.
