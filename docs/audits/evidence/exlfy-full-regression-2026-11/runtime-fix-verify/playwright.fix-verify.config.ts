import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, type PlaywrightTestConfig } from '@playwright/test';
import baseConfig from '../../../../../playwright.config';

const fixVerifyDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(fixVerifyDir, '..', 'runtime');
const repoRoot = path.resolve(fixVerifyDir, '../../../../../');

const config = baseConfig as PlaywrightTestConfig;

const webServer = config.webServer;
const webServers = webServer
  ? (Array.isArray(webServer) ? webServer : [webServer]).map((server) => ({
      ...server,
      cwd: repoRoot,
    }))
  : undefined;

export default {
  ...config,
  testDir: path.join(repoRoot, 'tests/e2e'),
  globalSetup: path.join(runtimeDir, 'portal-clear-next-cache.mjs'),
  webServer: webServers,
  outputDir: path.join(fixVerifyDir, 'playwright-output'),
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(fixVerifyDir, 'playwright-results.json') }],
    ['html', { open: 'never', outputFolder: path.join(fixVerifyDir, 'playwright-report') }],
  ],
  projects: [
    ...(config.projects ?? []),
    {
      name: 'fix-verify-owner',
      testDir: fixVerifyDir,
      testMatch: /exlfy-fix-verify\.spec\.ts/,
      dependencies: ['setup-owner'],
      timeout: 180_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/e2e/.auth/owner.json',
        locale: 'he-IL',
      },
    },
    {
      name: 'fix-verify-surfaces',
      testDir: fixVerifyDir,
      testMatch: /exlfy-fix-verify-surfaces\.spec\.ts/,
      timeout: 180_000,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        locale: 'he-IL',
        hasTouch: true,
      },
    },
    {
      name: 'fix-verify-pdf',
      testDir: fixVerifyDir,
      testMatch: /exlfy-fix-verify-pdf-mobile\.spec\.ts/,
      dependencies: ['setup-owner'],
      timeout: 180_000,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        storageState: 'tests/e2e/.auth/owner.json',
        locale: 'he-IL',
        hasTouch: true,
      },
    },
  ],
};