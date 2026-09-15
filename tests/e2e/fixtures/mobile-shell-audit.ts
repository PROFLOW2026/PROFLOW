import type { Page } from '@playwright/test';

export type MobileShellAuditResult = {
  innerWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  bodyScrollWidth: number;
  navTop: number | null;
  navBottom: number | null;
};

export async function auditMobileShellOnPage(page: Page): Promise<MobileShellAuditResult> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const nav = document.querySelector<HTMLElement>('[data-pf-mobile-nav]');
    const navRect = nav?.getBoundingClientRect();

    return {
      innerWidth: window.innerWidth,
      documentClientWidth: root.clientWidth,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      navTop: navRect ? Math.round(navRect.top * 10) / 10 : null,
      navBottom: navRect ? Math.round(navRect.bottom * 10) / 10 : null,
    };
  });
}

export async function readMobileNavGeometry(page: Page): Promise<{ top: number; bottom: number } | null> {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('[data-pf-mobile-nav]');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
}
