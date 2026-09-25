import { describe, expect, it } from 'vitest';
import { DEFAULT_CLIENT_TYPES } from '@/modules/business-catalog/domain/types';
import {
  CLIENT_TYPE_LABELS_AR,
  CLIENT_TYPE_LABELS_EN,
  CLIENT_TYPE_LABELS_HE,
  CLIENT_TYPE_LABELS_RU,
  localizeClientTypeName,
  localizeClientTypeOptions,
} from '@/modules/business-catalog/domain/client-type-labels';
import {
  localizeEngagementRoleName,
  localizeLeadSourceName,
  localizeLostReasonName,
} from '@/modules/business-catalog/domain/crm-catalog-labels';
import { localizeCatalogEntryName } from '@/modules/business-catalog/domain/catalog-entry-localization';

describe('client type localization', () => {
  it('maps system keys to Hebrew labels (never English catalog names)', () => {
    expect(localizeClientTypeName('private', 'Private', 'he-IL')).toBe('פרטי');
    expect(localizeClientTypeName('main_contractor', 'Main contractor', 'he-IL')).toBe('קבלן ראשי');
    expect(localizeClientTypeName('government', 'Government / Public', 'he-IL')).toBe('ממשלה / ציבורי');
  });

  it('localizes option lists at map boundaries', () => {
    expect(
      localizeClientTypeOptions(
        [
          { id: '1', key: 'company', name: 'Company' },
          { id: '2', key: 'developer', name: 'Developer' },
        ],
        'he-IL',
      ),
    ).toEqual([
      { id: '1', name: 'חברה' },
      { id: '2', name: 'יזם' },
    ]);
  });

  it('falls back to stored name for custom keys', () => {
    expect(localizeClientTypeName('acme_type', 'Acme Corp Type', 'he-IL', false)).toBe(
      'Acme Corp Type',
    );
  });

  it('covers every DEFAULT_CLIENT_TYPES key in all locale maps', () => {
    for (const entry of DEFAULT_CLIENT_TYPES) {
      expect(CLIENT_TYPE_LABELS_EN[entry.key]).toBeTruthy();
      expect(CLIENT_TYPE_LABELS_HE[entry.key]).toBeTruthy();
      expect(CLIENT_TYPE_LABELS_AR[entry.key]).toBeTruthy();
      expect(CLIENT_TYPE_LABELS_RU[entry.key]).toBeTruthy();
    }
  });
});

describe('catalog entry localization router', () => {
  it('routes client_type through client labels', () => {
    expect(localizeCatalogEntryName('client_type', 'architect', 'Architect', 'he-IL', true)).toBe(
      'אדריכל',
    );
  });

  it('localizes CRM catalog kinds in Hebrew', () => {
    expect(localizeLeadSourceName('referral', 'Referral', 'he-IL')).toBe('הפניה');
    expect(localizeLostReasonName('price', 'Price', 'he-IL')).toBe('מחיר');
    expect(localizeEngagementRoleName('subcontractor', 'Subcontractor', 'he-IL')).toBe('קבלן משנה');
  });
});
