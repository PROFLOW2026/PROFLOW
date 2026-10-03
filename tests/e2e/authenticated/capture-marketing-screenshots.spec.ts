import { test } from '@playwright/test';
import { loadWorld } from '../fixtures/world';
import {
  MARKETING_CAPTURE_LOCALES,
  captureEmployeeAppMobile,
  captureMarketingLocaleDesktop,
  captureMarketingLocaleMobileToday,
  marketingScreenshotOutDir,
} from './marketing-screenshot-capture.helpers';

const shouldCapture = process.env.CAPTURE_MARKETING === '1';
const employeeOnly = process.env.CAPTURE_MARKETING_EMPLOYEE_ONLY === '1';
const desktopOnly = process.env.CAPTURE_MARKETING_DESKTOP_ONLY === '1';

test.describe('marketing screenshot capture', () => {
  test.describe.configure({ timeout: 900_000 });
  test.skip(!shouldCapture, 'Set CAPTURE_MARKETING=1 to capture real homepage screenshots');

  test('captures live authenticated UI for all marketing locales', async ({ page, browser }) => {
    const world = loadWorld();

    if (!employeeOnly) {
      for (const locale of MARKETING_CAPTURE_LOCALES) {
        await test.step(`desktop ${locale}`, async () => {
          test.setTimeout(600_000);
          await captureMarketingLocaleDesktop(page, locale, world.projectId);
        });
      }
    }

    if (!employeeOnly && !desktopOnly) {
      for (const locale of MARKETING_CAPTURE_LOCALES) {
      await test.step(`mobile today ${locale}`, async () => {
        const mobile = await browser.newContext({
          storageState: 'tests/e2e/.auth/owner.json',
          locale,
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        const mobilePage = await mobile.newPage();
        await captureMarketingLocaleMobileToday(mobilePage, locale);
        await mobile.close();
      });
      }
    }

    if (!desktopOnly) {
      for (const locale of MARKETING_CAPTURE_LOCALES) {
      await test.step(`employee mobile ${locale}`, async () => {
        const mobile = await browser.newContext({
          locale,
          viewport: { width: 390, height: 900 },
          isMobile: true,
          hasTouch: true,
        });
        const mobilePage = await mobile.newPage();
        await captureEmployeeAppMobile(mobilePage, locale);
        await mobile.close();
      });
      }
    }

    for (const locale of MARKETING_CAPTURE_LOCALES) {
      await test.step(`verify output dir ${locale}`, async () => {
        const dir = marketingScreenshotOutDir(locale);
        test.info().annotations.push({ type: 'marketing-screenshots', description: dir });
      });
    }
  });
});
