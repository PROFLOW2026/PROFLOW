import { describe, expect, it } from 'vitest';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';

const LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;

describe('task_assigned_to_you notification copy', () => {
  for (const locale of LOCALES) {
    it(`${locale}: resolves title and body without missing-message`, () => {
      const copy = notificationCopy(notificationsCopyTranslator(locale), 'task_assigned_to_you', {
        reference: 'Demo task',
      });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    });
  }

  it('he-IL body is Hebrew', () => {
    const copy = notificationCopy(notificationsCopyTranslator('he-IL'), 'task_assigned_to_you', {
      reference: 'משימת בדיקה',
    });
    expect(copy.body).toMatch(/[\u0590-\u05FF]/);
  });
});
