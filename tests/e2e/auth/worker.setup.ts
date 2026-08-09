import { test as setup } from '@playwright/test';
import { WORKER } from '../harness/config';
import { signInThroughForm } from '../fixtures/sign-in';

setup('authenticate worker', async ({ page }) => {
  await signInThroughForm(page, WORKER.email);
  await page.context().storageState({ path: 'tests/e2e/.auth/worker.json' });
});
