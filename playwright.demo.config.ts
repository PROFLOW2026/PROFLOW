import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110";

export default defineConfig({
  testDir: "./tests/e2e/demo",
  fullyParallel: false,
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "demo-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
