import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import arNotifications from '@/locales/ar/notifications.json';
import enNotifications from '@/locales/en/notifications.json';
import heNotifications from '@/locales/he-IL/notifications.json';
import ruNotifications from '@/locales/ru/notifications.json';
import { localizeNotificationListItem } from '@/modules/notifications/application/localize-notifications';
import type { NotificationListItem } from '@/modules/notifications/domain/types';
import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';

const LEGACY_EN_TITLE = '⚠️ Rising pressure: Steel / Rebar (61/100)';
const LEGACY_EN_BODY =
  'ברזל זיון: לחץ שוק מחומרים נמצא ב-61/100. 1-month change: +15.0 pts.';

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

function pressureItem(
  metadata: Record<string, unknown>,
  title = 'material_pressure_alert',
  body = 'material_pressure_alert',
): NotificationListItem {
  return {
    id: 'n-pressure',
    type: 'material_pressure_alert',
    domain: 'market_intelligence',
    severity: 'info',
    title,
    body,
    readAt: null,
    createdAt: new Date('2026-09-28T00:00:00.000Z'),
    deepLink: '/material-market/steel_rebar',
    entityType: 'material_trade',
    entityId: null,
    metadata,
  };
}

describe('material_pressure_alert notification localization', () => {
  it.each(LOCALES)('localizes structured metadata in %s', (locale) => {
    const t = notificationsTranslator(locale);
    const localized = localizeNotificationListItem(
      pressureItem({
        i18n: true,
        trade: 'steel_rebar',
        score: 61,
        delta: 15,
        reason: 'significant_delta',
      }),
      t,
    );

    expect(localized.title).toContain('61');
    expect(localized.title).not.toBe('material_pressure_alert');
    expect(localized.body).toContain('61');

    if (locale === 'he-IL') {
      expect(localized.title).toMatch(/[\u0590-\u05FF]/);
      expect(localized.title).not.toContain('Rising pressure');
      expect(localized.title).not.toContain('Steel / Rebar');
      expect(localized.body).toMatch(/[\u0590-\u05FF]/);
    }
    if (locale === 'ar') {
      expect(localized.title).toMatch(/[\u0600-\u06FF]/);
    }
    if (locale === 'ru') {
      expect(localized.title).toMatch(/[\u0400-\u04FF]/);
    }
  });

  it('localizes legacy English stored titles for he-IL', () => {
    const t = notificationsTranslator('he-IL');
    const localized = localizeNotificationListItem(
      pressureItem(
        { trade: 'steel_rebar', score: 61, delta: 15, reason: 'significant_delta' },
        LEGACY_EN_TITLE,
        LEGACY_EN_BODY,
      ),
      t,
    );

    expect(localized.title).toMatch(/[\u0590-\u05FF]/);
    expect(localized.title).not.toContain('Rising pressure');
    expect(localized.body).toMatch(/[\u0590-\u05FF]/);
  });
});
