import { expect, test } from '@playwright/test';
import { loadWorld } from '../fixtures/world';
import { APP_URL } from '../harness/config';

const world = loadWorld();

/**
 * Owner surface + PGlite harness (port 3100) + fake worker.
 * Requires UI `data-testid` contract — see docs/implementation/electrical-takeoff/TESTING.md.
 */
test.describe('electrical takeoff', () => {
  test('owner: upload → analyze → approve → export links', async ({ page }) => {
    const projectId = world.projectId;
    await page.goto(`${APP_URL}/he-IL/projects/${projectId}/takeoff`);

    const newAnalysis = page.getByTestId('takeoff-new-analysis');
    const hasNew = await newAnalysis.isVisible().catch(() => false);
    if (!hasNew) {
      test.info().annotations.push({
        type: 'agent4-blocker',
        description:
          'No takeoff-new-analysis test id on page. Agent 4 must add data-testid per TESTING.md on TakeoffAnalysesList / TakeoffWorkspace.',
      });
      expect(hasNew, 'takeoff UI missing data-testid hooks').toBe(true);
      return;
    }

    await newAnalysis.click();
    await page.getByTestId('takeoff-upload-input').setInputFiles({
      name: 'synthetic.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n'),
    });
    await page.getByTestId('takeoff-start-analysis').click();
    await expect(page.getByTestId('takeoff-detection-row').first()).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('takeoff-approve').click();
    await expect(page.getByTestId('takeoff-export-xlsx')).toBeVisible();
  });
});