import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type VercelCron = { readonly path: string; readonly schedule: string };

function isOncePerDay(schedule: string): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const minute = parts[0] ?? '';
  const hour = parts[1] ?? '';
  const dayOfMonth = parts[2] ?? '';
  const month = parts[3] ?? '';
  const dayOfWeek = parts[4] ?? '';
  return (
    /^\d{1,2}$/.test(minute) &&
    /^\d{1,2}$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  );
}

describe('Vercel Hobby cron schedules', () => {
  const vercel = JSON.parse(
    readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
  ) as { crons: VercelCron[] };

  it('schedules OCR recovery and ops once per day only', () => {
    expect(vercel.crons).toHaveLength(2);
    expect(vercel.crons.every((cron) => isOncePerDay(cron.schedule))).toBe(true);
    expect(vercel.crons.map((cron) => cron.path).sort()).toEqual([
      '/api/internal/ocr-worker',
      '/api/internal/ops-worker',
    ]);
    expect(vercel.crons.find((cron) => cron.path === '/api/internal/ocr-worker')?.schedule).toBe(
      '0 5 * * *',
    );
    expect(vercel.crons.find((cron) => cron.path === '/api/internal/ops-worker')?.schedule).toBe(
      '0 6 * * *',
    );
  });
});
