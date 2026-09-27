import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import arNotifications from '@/locales/ar/notifications.json';
import enNotifications from '@/locales/en/notifications.json';
import heNotifications from '@/locales/he-IL/notifications.json';
import ruNotifications from '@/locales/ru/notifications.json';
import { localizeNotificationListItem } from '@/modules/notifications/application/localize-notifications';
import {
  captureNeedsReviewNotificationCopy,
  type CaptureNotificationVariant,
} from '@/modules/notifications/domain/copy';
import type { NotificationListItem } from '@/modules/notifications/domain/types';
import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';

const LEGACY_EN_TITLE = 'Field capture ready for review';
const LEGACY_EN_BODY = 'A field capture session is ready for review.';

const LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;

function notificationsTranslator(locale: (typeof LOCALES)[number]): NamespaceTranslator {
  const messages =
    locale === 'en'
      ? enNotifications
      : locale === 'ar'
        ? arNotifications
        : locale === 'ru'
          ? ruNotifications
          : heNotifications;
  const translator = createTranslator({
    locale,
    messages: messages as unknown as Record<string, string>,
  });
  const callable = ((key: string, values?: Record<string, string | number>) =>
    translator(key as never, values as never)) as NamespaceTranslator;
  callable.has = (key: string) => translator.has(key as never);
  return callable;
}

const VARIANTS: CaptureNotificationVariant[] = [
  'field_media',
  'financial_document',
  'video',
  'default',
];

function captureItem(metadata: Record<string, unknown>): NotificationListItem {
  return {
    id: 'n1',
    type: 'capture_needs_review',
    domain: 'documents',
    severity: 'info',
    title: 'Field capture ready for review',
    body: 'A field capture session is ready for review.',
    readAt: null,
    createdAt: new Date('2026-09-27T00:00:00.000Z'),
    deepLink: '/quick-capture/c1',
    entityType: 'quick_capture',
    entityId: 'c1',
    metadata,
  };
}

describe('capture_needs_review notification localization', () => {
  it.each(LOCALES)('localizes all variants in %s', (locale) => {
    const t = notificationsTranslator(locale);

    for (const variant of VARIANTS) {
      const copy = captureNeedsReviewNotificationCopy(t, variant, null);
      expect(copy.title.trim()).not.toBe('');
      expect(copy.body.trim()).not.toBe('');

      if (locale !== 'en') {
        expect(copy.title).not.toBe(LEGACY_EN_TITLE);
        expect(copy.body).not.toBe(LEGACY_EN_BODY);
      }

      if (locale === 'he-IL') {
        expect(copy.title).toMatch(/[\u0590-\u05FF]/);
        expect(copy.body).toMatch(/[\u0590-\u05FF]/);
      }
      if (locale === 'ar') {
        expect(copy.title).toMatch(/[\u0600-\u06FF]/);
        expect(copy.body).toMatch(/[\u0600-\u06FF]/);
      }
      if (locale === 'ru') {
        expect(copy.title).toMatch(/[\u0400-\u04FF]/);
        expect(copy.body).toMatch(/[\u0400-\u04FF]/);
      }
    }
  });

  it('preserves owner note without translating it', () => {
    const note = 'הערת בעלים';
    const t = notificationsTranslator('he-IL');
    const localized = localizeNotificationListItem(
      captureItem({ i18n: true, captureVariant: 'field_media', ownerNote: note }),
      t,
    );
    expect(localized.body).toContain(note);
    expect(localized.title).toMatch(/[\u0590-\u05FF]/);
  });

  it('localizes legacy English stored titles via title heuristic', () => {
    const t = notificationsTranslator('he-IL');
    const localized = localizeNotificationListItem(captureItem({}), t);
    expect(localized.title).toMatch(/[\u0590-\u05FF]/);
    expect(localized.body).toMatch(/[\u0590-\u05FF]/);
  });
});
