import { expect, test } from '@playwright/test';

test.describe('SEO runtime (L9)', () => {
  test('robots.txt allows public marketing and legal', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/robots.txt`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Allow:\s*\//);
    expect(body).toMatch(/Allow:\s*\/legal\//);
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Sitemap:');
    expect(body).not.toMatch(/Disallow:\s*\/he-IL\s*$/m);
  });

  test('sitemap.xml lists locale home and legal URLs', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/sitemap.xml`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('/he-IL/legal/terms');
    expect(body).toContain('/he-IL/legal/privacy');
  });

  test('public homepage is indexable; authenticated app layout is noindex', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/he-IL');
    if (page.url().includes('/setup')) {
      test.skip(true, 'App not configured');
    }
    const homeMeta = await page.locator('head meta[name="robots"]').getAttribute('content');
    expect(homeMeta === null || !homeMeta.includes('noindex')).toBe(true);

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
