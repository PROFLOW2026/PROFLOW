/**
 * Shared helpers for EXLFY post-fix runtime verification (BUG-001…016).
 */
import type { Page, TestInfo } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type FixVerifyVerdict =
  | 'VERIFIED_PASS'
  | 'VERIFIED_FAIL'
  | 'HARNESS'
  | 'UNVERIFIED'
  | 'UNVERIFIED_E2E'
  | 'DEVICE_UNAVAILABLE';

const fixVerifyDir = path.dirname(fileURLToPath(import.meta.url));

export const BUG02_FIXTURE_PATH = path.join(fixVerifyDir, '..', 'bug-02', 'bug-02-emc-seed.json');

export type Bug02PayrollFixture = {
  employeeId: string;
  paymentId: string;
  yearMonth: string;
  deepLinkWithPayment: string;
  deepLinkWithoutPayment: string;
  employeeName: string;
  emcHistoryId?: string;
};

export function annotate(info: TestInfo, area: string, verdict: FixVerifyVerdict, reason: string) {
  info.annotations.push({ type: 'exlfy-verdict', description: `${area}|${verdict}|${reason}` });
}

export async function softGoto(
  page: Page,
  url: string,
): Promise<{ status: number; ok: boolean; harness?: string }> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const status = response?.status() ?? 0;
    return { status, ok: status > 0 && status < 400 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 0, ok: false, harness: message.slice(0, 200) };
  }
}

export function loadBug02Fixture(): Bug02PayrollFixture | null {
  if (!existsSync(BUG02_FIXTURE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BUG02_FIXTURE_PATH, 'utf8')) as Bug02PayrollFixture;
  } catch {
    return null;
  }
}

export async function pageShowsGenericCrash(page: Page): Promise<boolean> {
  const errorTitle = page.getByText('משהו השתבש', { exact: false });
  const errorBody = page.getByText('נתקלנו בתקלה לא צפויה', { exact: false });
  return (
    (await errorTitle.isVisible().catch(() => false)) ||
    (await errorBody.isVisible().catch(() => false))
  );
}

export function payrollDeepLinkFromFixture(fixture: Bug02PayrollFixture | null): string | null {
  return fixture?.deepLinkWithPayment ?? fixture?.deepLinkWithoutPayment ?? null;
}