#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const OUT_PATH = path.join(REPO_ROOT, "docs/design/exlfy-design-v2/evidence/p5-probes.json");
const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010";
const STYLES = ["classic", "modern", "premium"];
const THEMES = ["light", "dark"];
const VIEWPORTS = [
  { id: "desktop", width: 1280, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];
const CSS_VARS = [
  "--pf-action-primary",
  "--pf-bg-page",
  "--pf-text-primary",
  "--pf-radius-md",
];

async function collectProbes(page) {
  return page.evaluate((vars) => {
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const tokens = {};
    for (const name of vars) {
      tokens[name] = rootStyle.getPropertyValue(name).trim();
    }
    const button = document.querySelector("button");
    let buttonProbe = null;
    if (button) {
      const bs = getComputedStyle(button);
      buttonProbe = {
        color: bs.color,
        backgroundColor: bs.backgroundColor,
      };
    }
    const sidebar = document.querySelector("[data-pf-slot=sidebar]");
    let sidebarBackground = null;
    if (sidebar) {
      sidebarBackground = getComputedStyle(sidebar).backgroundColor;
    }
    return {
      dataPfStyle: root.getAttribute("data-pf-style"),
      darkClass: root.classList.contains("dark"),
      tokens,
      button: buttonProbe,
      sidebarBackground,
    };
  }, CSS_VARS);
}

const browser = await chromium.launch();
const probes = {};

for (const style of STYLES) {
  probes[style] = {};
  for (const theme of THEMES) {
    probes[style][theme] = {};
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      await context.addCookies([
        { name: "pf-ui-style", value: style, url: base },
        { name: "pf-ui-theme", value: theme, url: base },
      ]);
      const page = await context.newPage();
      const response = await page.goto(`${base}/he-IL/dev/design-system`, {
        waitUntil: "domcontentloaded",
      });
      probes[style][theme][vp.id] = {
        viewport: { width: vp.width, height: vp.height },
        httpStatus: response?.status() ?? null,
        ...(await collectProbes(page)),
      };
      await context.close();
    }
  }
}

await browser.close();

function resolvedActionPrimary(style, theme) {
  const desktop = probes[style]?.[theme]?.desktop?.tokens?.["--pf-action-primary"];
  const mobile = probes[style]?.[theme]?.mobile?.tokens?.["--pf-action-primary"];
  return desktop || mobile || null;
}

const classicLight = resolvedActionPrimary("classic", "light");
const classicDark = resolvedActionPrimary("classic", "dark");
const premiumLight = resolvedActionPrimary("premium", "light");
const premiumDark = resolvedActionPrimary("premium", "dark");

const PREMIUM_ACTION_HEX = "#0b665f";
const classicLightIsPremiumHex =
  typeof classicLight === "string" &&
  classicLight.replace(/\s+/g, "").toLowerCase() === PREMIUM_ACTION_HEX;

const checks = {
  classicLightProbesExist: Boolean(probes.classic?.light?.desktop && probes.classic?.light?.mobile),
  classicDarkProbesExist: Boolean(probes.classic?.dark?.desktop && probes.classic?.dark?.mobile),
  classicPrimaryDiffersFromPremium:
    classicLight != null &&
    premiumLight != null &&
    classicLight !== premiumLight &&
    classicDark != null &&
    premiumDark != null &&
    classicDark !== premiumDark,
  classicLightNotPremiumHex: !classicLightIsPremiumHex,
};

const pass =
  checks.classicLightProbesExist &&
  checks.classicDarkProbesExist &&
  checks.classicPrimaryDiffersFromPremium &&
  checks.classicLightNotPremiumHex;

const report = {
  tool: "classic-probes",
  capturedAt: new Date().toISOString(),
  base,
  harnessRoutes: {
    status: "not-run",
    reason: "Windows production build is not used for this proof",
  },
  probes,
  samples: {
    classic: {
      light: { "--pf-action-primary": classicLight },
      dark: { "--pf-action-primary": classicDark },
    },
    premium: {
      light: { "--pf-action-primary": premiumLight },
      dark: { "--pf-action-primary": premiumDark },
    },
    modern: {
      light: { "--pf-action-primary": resolvedActionPrimary("modern", "light") },
      dark: { "--pf-action-primary": resolvedActionPrimary("modern", "dark") },
    },
  },
  checks,
  pass,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify({
    pass,
    classicLightProbesExist: checks.classicLightProbesExist,
    classicDarkProbesExist: checks.classicDarkProbesExist,
    classicPrimaryDiffersFromPremium: checks.classicPrimaryDiffersFromPremium,
    classicLightActionPrimary: classicLight,
    premiumLightActionPrimary: premiumLight,
  }),
);
process.exit(pass ? 0 : 1);