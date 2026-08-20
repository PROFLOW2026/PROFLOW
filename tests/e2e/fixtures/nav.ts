import { expect, type Locator, type Page } from '@playwright/test';
import { he } from './locales';

/** Main app sidebar / desktop navigation landmark. */
export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: he.common.a11y.mainNavigation });
}

/**
 * Expand exclusive accordion groups until a named nav link is visible, then
 * return that link. Core (ungrouped) links are returned immediately.
 */
export async function navLink(page: Page, name: string): Promise<Locator> {
  const nav = mainNav(page);
  const link = nav.getByRole('link', { name, exact: true });
  if ((await link.count()) > 0) return link;

  const groupButtons = nav.locator('button[aria-controls^="pf-nav-group-"]');
  const groupCount = await groupButtons.count();
  for (let i = 0; i < groupCount; i += 1) {
    await groupButtons.nth(i).click();
    if ((await link.count()) > 0) return link;
  }

  return link;
}

export async function expectNavLinkVisible(page: Page, name: string): Promise<void> {
  await expect(await navLink(page, name)).toBeVisible();
}

export async function clickNavLink(page: Page, name: string): Promise<void> {
  const link = await navLink(page, name);
  if ((await link.count()) === 0) {
    throw new Error(`Navigation link not found: ${name}`);
  }
  await link.click();
}

/**
 * True when the destination exists in the current nav model (checks each
 * exclusive accordion group). Collapsed links are not treated as absent.
 */
export async function navHasLink(page: Page, name: string): Promise<boolean> {
  const nav = mainNav(page);
  const link = nav.getByRole('link', { name, exact: true });
  if ((await link.count()) > 0) return true;

  const groupButtons = nav.locator('button[aria-controls^="pf-nav-group-"]');
  const groupCount = await groupButtons.count();
  for (let i = 0; i < groupCount; i += 1) {
    await groupButtons.nth(i).click();
    if ((await link.count()) > 0) return true;
  }
  return false;
}

export async function expectNavLinkAbsent(page: Page, name: string): Promise<void> {
  expect(await navHasLink(page, name)).toBe(false);
}
