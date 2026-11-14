import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, type PlaywrightTestConfig } from '@playwright/test';
import baseConfig from '../../../../../playwright.config';

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runtimeDir, '../../../../../');

const config = baseConfig as PlaywrightTestConfig;

const webServer = config.webServer;
let webServers = webServer
  ? (Array.isArray(webServer) ? webServer : [webServer]).map((server) => ({
      ...server,
      cwd: repoRoot,
    }))
  : undefined;

/** BUG-02 audit: use `next dev` when production `.next` is unavailable/corrupt. */
if (process.env.BUG02_USE_NEXT_DEV === '1' && webServers && webServers.length >= 2) {
  const bug02App = path.join(runtimeDir, '..', 'bug-02', 'start-app-dev-for-bug02.mjs');
  webServers = [
    webServers[0]!,
    {
      ...webServers[1]!,
      command: `node ${JSON.stringify(bug02App)}`,
      cwd: repoRoot,
      timeout: 420_000,
    },
  ];
}

export default {
  ...config,
  testDir: path.join(repoRoot, 'tests/e2e'),
  // Clears stale unstable_cache session-db entries for fixed E2E userIds after DB reseed.
  globalSetup: path.join(runtimeDir, 'portal-clear-next-cache.mjs'),
  webServer: webServers,
  outputDir: path.join(runtimeDir, 'playwright-output'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(runtimeDir, 'playwright-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(runtimeDir, 'playwright-report') }],
  ],
  projects: [
    ...(config.projects ?? []),
    {
      name: 'regression-viewport',
      testDir: runtimeDir,
      testMatch: /exlfy-viewport-coverage\.spec\.ts/,
      dependencies: ['setup-owner'],
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
    {
      name: 'regression-viewport-gaps',
      testDir: runtimeDir,
      testMatch: /exlfy-viewport-gaps\.spec\.ts/,
      dependencies: ['setup-owner'],
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
    {
      name: 'regression-business',
      testDir: runtimeDir,
      testMatch: /exlfy-business-flows\.spec\.ts/,
      dependencies: ['setup-owner'],
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
    {
      name: 'regression-pdf',
      testDir: runtimeDir,
      testMatch: /exlfy-pdf-touch-probe\.spec\.ts/,
      dependencies: ['setup-owner'],
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
    {
      name: 'regression-portal',
      testDir: runtimeDir,
      testMatch: /exlfy-portal-smoke\.spec\.ts/,
      // No setup-owner: contractor/employee use form login + fresh context, not owner storageState.
      // Depending on owner setup only blocks portal when owner sign-in flakes (HARNESS, not product).
      timeout: 180_000,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'bug02-setup-owner',
      testDir: path.join(runtimeDir, '..', 'bug-02'),
      testMatch: /owner-auth-stub\.setup\.ts/,
      timeout: 120_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'bug02-payroll',
      testDir: path.join(runtimeDir, '..', 'bug-02'),
      testMatch: /bug-02-payroll-deep-link\.spec\.ts/,
      dependencies: ['bug02-setup-owner'],
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/e2e/.auth/owner.json',
      },
    },
  ],
};
