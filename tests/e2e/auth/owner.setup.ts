import { test as setup } from '@playwright/test';
import { OWNER } from '../harness/config';
import { signInThroughForm } from '../fixtures/sign-in';

setup('authenticate owner', async ({ page }) => {
  await signInThroughForm(page, OWNER.email);
  await page.context().storageState({ path: 'tests/e2e/.auth/owner.json' });
});
