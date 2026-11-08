import { chromium } from "playwright";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(ROOT, "docs", "design", "exlfy-design-v2", "owner-pack");
const SPECIMEN_URL = "http://127.0.0.1:3010/he-IL/dev/design-system";
const BASE_HOST = "127.0.0.1";

const STYLES = ["modern", "premium"];
const APPEARANCES = ["light", "dark"];
const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

async function probeSpecimen() {
  try {
    const res = await fetch(SPECIMEN_URL, { redirect: "follow" });
    if (!res.ok) {
      return { ok: false, status: res.status, message: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, message };
  }
}

async function ensureHtmlState(page, style, appearance) {
  await page.evaluate(
    ({ style, appearance }) => {
      const html = document.documentElement;
      html.setAttribute("data-pf-style", style);
      if (appearance === "dark") {
        html.classList.add("dark");
      } else {
        html.classList.remove("dark");
      }
    },
    { style, appearance },
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const probe = await probeSpecimen();
  if (!probe.ok) {
    const payload = {
      capturedAt: new Date().toISOString(),
      specimenUrl: SPECIMEN_URL,
      error: probe.message ?? "Specimen unavailable",
      httpStatus: probe.status,
      shots: [],
    };
    await writeFile(join(OUT_DIR, "owner-pack.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const shots = [];

  try {
    for (const style of STYLES) {
      for (const appearance of APPEARANCES) {
        for (const viewport of VIEWPORTS) {
          const fileName = `${style}-${appearance}-${viewport.id}.png`;
          const outPath = join(OUT_DIR, fileName);
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
          });

          try {
            await context.addCookies([
              {
                name: "pf-ui-style",
                value: style,
                domain: BASE_HOST,
                path: "/",
                sameSite: "Lax",
              },
              {
                name: "pf-ui-theme",
                value: appearance,
                domain: BASE_HOST,
                path: "/",
                sameSite: "Lax",
              },
            ]);

            const page = await context.newPage();
            await page.goto(SPECIMEN_URL, { waitUntil: "networkidle", timeout: 120_000 });

            const domStyle = await page.evaluate(() =>
              document.documentElement.getAttribute("data-pf-style"),
            );
            const hasDark = await page.evaluate(() =>
              document.documentElement.classList.contains("dark"),
            );
            const needsPatch =
              domStyle !== style || (appearance === "dark") !== hasDark;
            if (needsPatch) {
              await ensureHtmlState(page, style, appearance);
              await page.waitForTimeout(300);
            }

            await page.screenshot({ path: outPath, fullPage: false });
            const { size } = await stat(outPath);
            shots.push({
              fileName,
              style,
              appearance,
              viewport: viewport.id,
              byteSize: size,
            });
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    specimenUrl: SPECIMEN_URL,
    httpStatus: probe.status,
    shots,
  };
  await writeFile(join(OUT_DIR, "owner-pack.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  await mkdir(OUT_DIR, { recursive: true });
  const payload = {
    capturedAt: new Date().toISOString(),
    specimenUrl: SPECIMEN_URL,
    error: message,
    shots: [],
  };
  await writeFile(join(OUT_DIR, "owner-pack.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.exitCode = 1;
});