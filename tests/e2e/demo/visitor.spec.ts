import { expect, test, type Page } from "@playwright/test";

const BANNER = "מצב הדגמה — הנתונים מתאפסים מדי לילה";

async function enter(page: Page, profileKey: string, roleKey: string, ip: string): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.goto("/he-IL/demo");
  await page.locator('select[name="profileKey"]').selectOption(profileKey);
  await page.locator('select[name="roleKey"]').selectOption(roleKey);
  await page.getByRole("button", { name: "כניסה לדמו" }).click();
  await expect(page.getByText(BANNER)).toBeVisible();
}

test("every business profile opens the three apps and can switch roles", async ({ page }) => {
  test.setTimeout(1_800_000);
  await page.goto("/he-IL");
  await page.getByRole("link", { name: "הדגמה" }).click();
  await expect(page.getByRole("heading", { name: "הדגמה" })).toBeVisible();
  const profiles = await page.locator('select[name="profileKey"] option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );
  expect(profiles).toHaveLength(20);

  for (const [index, profileKey] of profiles.entries()) {
    await enter(page, profileKey, "owner", `10.9.0.${index + 1}`);
    await page.locator("#demo-role-switch").selectOption("employee");
    await page.getByRole("button", { name: "החלפת תפקיד" }).click();
    await expect(page).toHaveURL(/\/employee/);
    await expect(page.getByText(BANNER)).toBeVisible();

    await page.locator("#demo-role-switch").selectOption("contractor");
    await page.getByRole("button", { name: "החלפת תפקיד" }).click();
    await expect(page).toHaveURL(/\/contractor/);
    await expect(page.getByText(BANNER)).toBeVisible();

    for (const roleKey of ["finance", "manager", "worker"]) {
      await page.locator("#demo-role-switch").selectOption(roleKey);
      await page.getByRole("button", { name: "החלפת תפקיד" }).click();
      // demoRoleHome maps finance/manager/worker/employee → /employee
      await expect(page).toHaveURL(/\/employee/);
      await expect(page.getByText(BANNER)).toBeVisible();
    }
  }
});

test("two visitors do not share a session", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await first.newPage();
  const pageB = await second.newPage();
  await enter(pageA, "GENERAL_CONTRACTOR", "owner", "10.8.0.1");
  await enter(pageB, "ELECTRICAL", "owner", "10.8.0.2");
  const nameA = await pageA.locator("body").innerText();
  const nameB = await pageB.locator("body").innerText();
  expect(nameA).not.toBe(nameB);
  await first.close();
  await second.close();
});

test("a visitor sees fixture projects and documents without the other visitor's project", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await first.newPage();
  const pageB = await second.newPage();
  await enter(pageA, "GENERAL_CONTRACTOR", "owner", "10.7.0.1");
  await enter(pageB, "ELECTRICAL", "owner", "10.7.0.2");
  await pageA.goto("/he-IL/projects");
  await expect(pageA.getByRole("link", { name: "ביצוע — מתחם שקד שלב ב" })).toBeVisible();
  await pageA.goto("/he-IL/documents");
  await expect(pageA.getByRole("table").getByText("חוזה ביצוע ראשי.pdf").first()).toBeVisible();
  await expect(pageA.getByRole("table").getByText("תוכנית שלד מעודכנת.pdf").first()).toBeVisible();
  await pageB.goto("/he-IL/projects");
  await expect(pageB.getByRole("link", { name: "ביצוע — מערכת חשמל מלון כנרת" })).toBeVisible();
  await expect(pageB.getByRole("link", { name: "ביצוע — מתחם שקד שלב ב" })).toHaveCount(0);
  await pageB.goto("/he-IL/documents");
  await expect(pageB.getByRole("table").getByText("תכנית חשמל — גמר.pdf").first()).toBeVisible();
  await first.close();
  await second.close();
});

