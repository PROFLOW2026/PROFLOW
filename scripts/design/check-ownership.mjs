#!/usr/bin/env node
import process from "node:process";
import {
  REPO_ROOT,
  loadOwnership,
  normalizePath,
  resolveOwner,
  walkDesignV2UiFiles,
} from "./ownership-lib.mjs";

function parseArgs(argv) {
  const opts = { verifyPartition: false, agent: null, paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--verify-partition") {
      opts.verifyPartition = true;
      continue;
    }
    if (arg === "--agent") {
      opts.agent = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
    opts.paths.push(normalizePath(arg));
  }
  return opts;
}

function verifyPartition(ctx) {
  const files = walkDesignV2UiFiles();
  const unmapped = [];
  const byAgent = new Map();
  let frozenCount = 0;
  for (const file of files) {
    const owner = resolveOwner(file, ctx);
    if (!owner) {
      unmapped.push(file);
      continue;
    }
    if (owner.frozen) frozenCount += 1;
    byAgent.set(owner.agent, (byAgent.get(owner.agent) ?? 0) + 1);
  }
  const ok = unmapped.length === 0;
  const summary = {
    tool: "check-ownership",
    mode: "verify-partition",
    pass: ok,
    files: files.length,
    frozen: frozenCount,
    unmappedCount: unmapped.length,
    unmapped: unmapped.slice(0, 50),
    byAgent: Object.fromEntries([...byAgent.entries()].sort()),
  };
  console.log(JSON.stringify(summary, null, 2));
  return ok ? 0 : 1;
}

function verifyAgent(agent, paths, ctx) {
  const violations = [];
  let allowed = 0;
  for (const file of paths) {
    const owner = resolveOwner(file, ctx);
    if (!owner) {
      violations.push({ file, reason: "unmapped" });
      continue;
    }
    if (owner.frozen) {
      violations.push({ file, reason: "frozen", ruleId: owner.ruleId });
      continue;
    }
    if (owner.agent !== agent) {
      violations.push({ file, reason: "wrong-agent", expected: agent, actual: owner.agent, ruleId: owner.ruleId });
      continue;
    }
    allowed += 1;
  }
  const ok = violations.length === 0;
  console.log(
    JSON.stringify(
      {
        tool: "check-ownership",
        mode: "agent",
        agent,
        pass: ok,
        checked: paths.length,
        allowed,
        violations,
      },
      null,
      2,
    ),
  );
  return ok ? 0 : 1;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = loadOwnership(REPO_ROOT);
  if (opts.verifyPartition) {
    process.exit(verifyPartition(ctx));
  }
  if (opts.agent) {
    if (opts.paths.length === 0) {
      console.error("--agent requires one or more paths");
      process.exit(2);
    }
    process.exit(verifyAgent(opts.agent, opts.paths, ctx));
  }
  console.error("Usage: node scripts/design/check-ownership.mjs --verify-partition");
  console.error("       node scripts/design/check-ownership.mjs --agent A2 <paths...>");
  process.exit(2);
}

main();