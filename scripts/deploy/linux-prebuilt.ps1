<#
  Production deploy of the COMMITTED code: Linux/Docker build + `vercel deploy --prebuilt --prod`.
  Temporary mandatory process until the Vercel 8 GB build limit is solved. Read docs/deployment.md first.

  Usage (from the repository root, after the change is committed and the focused tests passed):
    powershell -File scripts/deploy/linux-prebuilt.ps1 [-RequiredFunctions 'functions/[locale]/live/[token].func'] [-Wait]

  It never prints secrets, never builds on Windows, and refuses to start a second build while one is running.
#>
param(
  [string[]]$RequiredFunctions = @(),
  [switch]$Wait
)
$ErrorActionPreference = 'Stop'

$ProductionUrl = 'https://proflow-two-bice.vercel.app'
$Container = 'exlfy-linux-build'
$Work = Join-Path (Get-Location) '.deploy-linux'
$Out = Join-Path $Work 'out'

if (-not (Test-Path 'package.json') -or -not (Test-Path 'scripts/deploy/linux-prebuilt.sh')) { throw 'Run from the repository root.' }
docker info *> $null; if ($LASTEXITCODE -ne 0) { throw 'Docker is not running.' }
$running = docker ps --filter "name=^${Container}$" --format '{{.Names}}'
if ($running) { throw "A build is already running ($Container). Do not start a second one." }

$sha = (git rev-parse HEAD).Trim()
"Building committed HEAD $sha (uncommitted changes are NOT included)."

# --- Production variables: must exist and be real values (the Vercel pull returns [SENSITIVE] placeholders) ---
New-Item -ItemType Directory -Force -Path $Work, $Out | Out-Null
$envFile = Join-Path $Work 'env.production.local'
if (-not (Test-Path $envFile)) { throw "Missing $envFile - prepare it as described in docs/deployment.md (section 'Production variables')." }
function EnvValue([string]$name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return (($line -split '=', 2)[1]).Trim().Trim('"')
}
$app = EnvValue 'NEXT_PUBLIC_APP_URL'
$sb = EnvValue 'NEXT_PUBLIC_SUPABASE_URL'
$anon = EnvValue 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
$problems = @()
if ($app -ne $ProductionUrl) { $problems += 'NEXT_PUBLIC_APP_URL is not the production URL' }
if ($sb -notmatch '^https://[a-z0-9]+\.supabase\.co$') { $problems += 'NEXT_PUBLIC_SUPABASE_URL is not a Supabase project URL' }
if ($anon.Length -lt 100 -or -not $anon.StartsWith('eyJ')) { $problems += 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or a placeholder' }
if (Select-String -Path $envFile -Pattern '^NEXT_PUBLIC.*SENSITIVE' -Quiet) { $problems += 'a NEXT_PUBLIC value is still a [SENSITIVE] placeholder' }
if ($problems.Count) { throw ("Production variables invalid: " + ($problems -join '; ')) }
'Production public variables look valid (values not printed).'

# --- Inputs for the container ---
git archive --format=tar -o (Join-Path $Work 'src.tar') HEAD
if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
Copy-Item .vercel/project.json (Join-Path $Work 'project.json') -Force
# The script must have LF endings (CRLF breaks bash with "set: invalid option").
$script = (Get-Content scripts/deploy/linux-prebuilt.sh -Raw) -replace "`r`n", "`n"
[IO.File]::WriteAllText((Join-Path $Work 'linux-prebuilt.sh'), $script, (New-Object Text.UTF8Encoding($false)))
Remove-Item (Join-Path $Out '*') -Force -ErrorAction SilentlyContinue
docker rm -f $Container 2>$null | Out-Null

# --- Token: refresh the CLI login first (the saved token expires within hours), then hand it over via a temporary env-file ---
vercel whoami *> $null
$tok = (Get-Content (Join-Path $env:APPDATA 'com.vercel.cli/Data/auth.json') -Raw | ConvertFrom-Json).token
$pj = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
$tokenEnv = Join-Path $Work 'token.env'
$lines = "VERCEL_TOKEN=$tok`nVERCEL_ORG_ID=$($pj.orgId)`nVERCEL_PROJECT_ID=$($pj.projectId)`nREQUIRED_FUNCS=$($RequiredFunctions -join ' ')`n"
[IO.File]::WriteAllText($tokenEnv, $lines, (New-Object Text.UTF8Encoding($false)))

docker run -d --name $Container --cpuset-cpus 0-5 --env-file $tokenEnv `
  -v "${Work}:/in:ro" -v "${Out}:/out" node:22-bookworm bash /in/linux-prebuilt.sh | Out-Null
Start-Sleep 3
Remove-Item $tokenEnv -Force
"Container started; token file removed: $(-not (Test-Path $tokenEnv)). Progress: $Out\status and steps.log (build takes ~8 minutes)."

if ($Wait) {
  while ((Get-Content (Join-Path $Out 'status') -ErrorAction SilentlyContinue) -eq 'RUNNING') { Start-Sleep 10 }
  "Result: " + (Get-Content (Join-Path $Out 'status'))
  Get-Content (Join-Path $Out 'steps.log')
}
