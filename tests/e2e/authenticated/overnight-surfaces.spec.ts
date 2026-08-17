import { expect, test } from '@playwright/test';
import { assertNoPageHorizontalOverflow } from '../fixtures/layout';
import { he } from '../fixtures/locales';

test.describe('overnight 3-wave surfaces (hebrew owner)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('scheduling, safety, notifications and timesheet approvals load RTL', async ({ page }) => {
    await page.goto('/he-IL/scheduling');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: he.nav.scheduling, level: 1 })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'scheduling mobile');

    await page.goto('/he-IL/safety');
    await expect(page.getByRole('heading', { name: /בטיחות/, level: 1 })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'safety mobile');

    await page.goto('/he-IL/notifications');
    await expect(page.getByRole('heading', { name: 'התראות', level: 1 })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'notifications mobile');

    await page.goto('/he-IL/workforce/time/approvals');
    await expect(page.getByRole('heading', { name: 'אישורי שעות', level: 1 })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'timesheet approvals mobile');
  });
});
