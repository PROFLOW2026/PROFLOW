#!/usr/bin/env bash
# Runs INSIDE the node:22-bookworm container started by scripts/deploy/linux-prebuilt.ps1.
# One clean Linux production build of the committed code, output checks, then ONE prebuilt deploy.
# See docs/deployment.md. Do not run this on the host and do not edit it per deployment.
#
# Mounts:   /in  (read-only)  src.tar, project.json, env.production.local, this script
#           /out (writable)   status + logs
# Env:      VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID  (passed with --env-file, deleted by the launcher)
#           STAGE=all (default) | deploy   (deploy = reuse the build already in /work, e.g. after a token problem)
#           REQUIRED_FUNCS="functions/[locale]/live/[token].func ..."  (optional, space separated, relative to .vercel/output)
set -u
OUT=/out
STAGE="${STAGE:-all}"
REQUIRED_FUNCS="${REQUIRED_FUNCS:-}"

echo "RUNNING" > "$OUT/status"
date -u +%FT%TZ > "$OUT/started_at"

step() { echo "$(date -u +%T) $*" >> "$OUT/steps.log"; }
fail() { echo "$1" > "$OUT/status"; step "FAILED: $1"; exit 1; }

if [ "$STAGE" = "all" ]; then
  step "extract source"
  mkdir -p /work && cd /work || fail "FAILED_SETUP"
  tar -xf /in/src.tar || fail "FAILED_EXTRACT"
  mkdir -p .vercel
  cp /in/project.json .vercel/project.json
  cp /in/env.production.local .vercel/.env.production.local
  [ -f .env.local ] && fail "FAILED_LOCAL_ENV_PRESENT"

  step "node $(node -v) npm $(npm -v)"
  step "install vercel cli"
  npm i -g vercel@65.2.0 --silent > "$OUT/cli-install.log" 2>&1 || fail "FAILED_CLI_INSTALL"

  export NODE_OPTIONS="--max-old-space-size=12288"
  export NEXT_TELEMETRY_DISABLED=1

  step "vercel build --prod"
  vercel build --prod --yes > "$OUT/build.log" 2>&1
  rc=$?
  echo $rc > "$OUT/build.exit"
  step "build exit=$rc"
  [ $rc -eq 0 ] || fail "FAILED_BUILD"
else
  cd /work || fail "FAILED_NO_WORKDIR"
  npm ls -g vercel > /dev/null 2>&1 || npm i -g vercel@65.2.0 --silent > "$OUT/cli-install.log" 2>&1 || fail "FAILED_CLI_INSTALL"
fi

step "output checks"
cat > /tmp/check.cjs <<'EOF'
const fs = require('fs');
const path = require('path');
const root = path.resolve('.vercel/output');
const problems = [];
const funcs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const target = fs.readlinkSync(full);
      if (target.includes('\\')) problems.push('symlink with backslash: ' + full);
      if (!fs.existsSync(full)) problems.push('dangling symlink: ' + full);
    } else if (e.isDirectory()) {
      if (e.name.endsWith('.func')) funcs.push(full);
      walk(full);
    }
  }
})(root);
for (const f of funcs) if (!fs.existsSync(path.join(f, '.vc-config.json'))) problems.push('func without .vc-config: ' + f);
// Vercel rejects route transforms with characters outside this set (Windows paths contain backslashes).
const pattern = /^[a-zA-Z0-9_ :;.,"'?!(){}\[\]@<>=+*#$&`|~\^%/-]+$/;
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
let transformArgs = 0;
for (const r of cfg.routes || []) {
  for (const t of r.transforms || []) {
    for (const a of Array.isArray(t.args) ? t.args : [t.args]) {
      if (typeof a !== 'string') continue;
      transformArgs++;
      if (!pattern.test(a)) problems.push('route transform arg not allowed: ' + a.slice(0, 80));
    }
  }
}
// Raw scan of every json for Windows paths / private env references.
const bad = [/[A-Za-z]:\\\\/, /[\\/]Users[\\/]/, /\.env\.local/, /aside-for-prebuilt/, /\.env\.production\.local/];
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) scan(full);
    else if (e.name.endsWith('.json')) {
      const text = fs.readFileSync(full, 'utf8');
      for (const re of bad) if (re.test(text)) problems.push('json reference ' + re + ' in ' + full);
    }
  }
})(root);
const required = (process.env.REQUIRED_FUNCS || '').split(/\s+/).filter(Boolean);
const missing = required.filter((m) => !fs.existsSync(path.join(root, m)));
for (const m of missing) problems.push('missing function: ' + m);
if (funcs.length === 0) problems.push('no functions in output');
console.log(JSON.stringify({ funcs: funcs.length, transformArgs, requiredChecked: required.length, missing, problems: problems.length }));
if (problems.length) {
  console.log(problems.slice(0, 15).join('\n'));
  process.exit(2);
}
EOF
export REQUIRED_FUNCS
node /tmp/check.cjs > "$OUT/checks.log" 2>&1
crc=$?
step "checks exit=$crc"
[ $crc -eq 0 ] || fail "FAILED_OUTPUT_CHECKS"

# No env files and no token anywhere in what is about to be uploaded.
[ "$(find .vercel/output \( -name '.env*' -o -name '*.env' \) | wc -l)" = "0" ] || fail "FAILED_ENV_FILES_IN_OUTPUT"
[ "$(grep -rlF "$VERCEL_TOKEN" .vercel/output 2>/dev/null | wc -l)" = "0" ] || fail "FAILED_TOKEN_IN_OUTPUT"

# --archive=tgz uploads ONE compressed archive instead of thousands of files: the per-file upload quota of the
# Vercel plan ("api-upload-free", 5000 files / 24 h) is no longer consumed by every deployment.
step "vercel deploy --prebuilt --prod --archive=tgz"
vercel deploy --prebuilt --prod --archive=tgz --yes > "$OUT/deploy.log" 2>&1
drc=$?
echo $drc > "$OUT/deploy.exit"
step "deploy exit=$drc"
[ $drc -eq 0 ] || fail "FAILED_DEPLOY"
echo "SUCCEEDED" > "$OUT/status"
step "done"
