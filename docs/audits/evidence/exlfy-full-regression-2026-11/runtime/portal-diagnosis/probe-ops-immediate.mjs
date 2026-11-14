import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';

const browser = await chromium.launch();
try {
  const page = await (
    await browser.newContext({ locale: 'he-IL', viewport: { width: 390, height: 844 } })
  ).newPage();
  await page.goto(`${base}/he-IL/employee/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('#username').fill('opspm');
  await page.locator('#pin').fill('135790');
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(10_000);
  const alertText = await page
    .locator('[role="alert"]')
    .first()
    .innerText()
    .catch(() => '');
  const url = page.url();
  await page.screenshot({ path: path.join(here, 'employee-ops-immediate.png'), fullPage: true });

  const sql = postgres('postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e', {
    max: 1,
    prepare: false,
  });
  try {
    const account = await sql`
      select failed_login_count, last_login_at, auth_email, organization_id, user_id
      from employee_app_accounts where username_normalized = 'opspm'
    `;
    const audit = await sql`
      select action, detail_json, created_at
      from employee_app_audit_events
      where organization_id = ${account[0].organization_id}
      order by created_at desc
      limit 12
    `;
    const out = { url, alertText, account, audit };
    writeFileSync(path.join(here, 'ops-immediate.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
} finally {
  await browser.close();
}
