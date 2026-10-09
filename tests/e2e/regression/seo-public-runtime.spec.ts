import { expect, test } from '@playwright/test';

test.describe('SEO runtime (pre-launch containment)', () => {
  test('robots.txt disallows all crawling and omits sitemap', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/robots.txt`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\//);
    expect(body).not.toContain('Sitemap:');
  });

  test('sitemap.xml has no discoverable URLs while pre-launch', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/sitemap.xml`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toContain('/he-IL/legal/terms');
    expect(body).not.toContain('/he-IL/legal/privacy');
  });

  test('public homepage is noindex; auth and employee surfaces stay noindex', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/he-IL');
    if (page.url().includes('/setup')) {
      test.skip(true, 'App not configured');
    }
    const homeMeta = await page.locator('head meta[name="robots"]').getAttribute('content');
    expect(homeMeta).toContain('noindex');

    await page.goto('/he-IL/sign-in');
    const authRobots = await page.locator('head meta[name="robots"]').getAttribute('content');
    expect(authRobots).toContain('noindex');

    const employeeRes = await request.get(`${baseURL}/he-IL/employee/login`);
    expect(employeeRes.status()).toBeLessThan(500);
    await page.goto('/he-IL/employee/login');
    const employeeRobots = await page.locator('head meta[name="robots"]').getAttribute('content');
    expect(employeeRobots).toContain('noindex');
  });
});
