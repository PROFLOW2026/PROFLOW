import { describe, expect, it } from 'vitest';
import { localizeNotificationListItem } from '@/modules/notifications/application/localize-notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import { readDgNotificationMetadata, renderDgNotificationCopy } from '@/modules/notifications/domain/dg-copy';
import { externalNotificationVisible } from '@/modules/notifications/domain/external-visibility';
import type { NotificationListItem } from '@/modules/notifications/domain/types';
import type { ExternalGrantView } from '@/shared/external';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';

describe('dg notification copy', () => {
  it('renders title, collapsed count and context in the reader locale', () => {
    const en = renderDgNotificationCopy(notificationsCopyTranslator('en'), {
      copyKey: 'subcontract_claim_submitted',
      params: { reference: 'C-7', project: 'Tower A', contractor: 'Acme' },
      occurrences: 3,
    });
    expect(en.title).toBe('Progress claim awaiting review (3)');
    expect(en.body).toBe('A contractor submitted a progress claim for review. · C-7 · Tower A · Acme');

    const he = renderDgNotificationCopy(notificationsCopyTranslator('he-IL'), {
      copyKey: 'rfi_request_answered',
      params: { project: 'מגדל' },
    });
    expect(he.title).toMatch(/[\u0590-\u05FF]/);
    expect(he.body).toContain('מגדל');
  });

  it('falls back to generic copy for unknown keys', () => {
    const copy = renderDgNotificationCopy(notificationsCopyTranslator('en'), { copyKey: 'nope_never', params: {} });
    expect(copy.title).toBe('Project update');
  });

  it('localizes stored internal rows from metadata, ignoring stored text', () => {
    const item: NotificationListItem = {
      id: 'n1',
      type: 'dg_claim',
      domain: 'contractor_finance',
      entityType: 'subcontract_claim',
      entityId: 'e1',
      title: 'stale',
      body: 'stale',
      severity: 'warning',
      deepLink: '/projects/p/claims/e1',
      readAt: null,
      createdAt: new Date(),
      metadata: { dg: { copyKey: 'subcontract_claim_certified', params: { project: 'P' }, occurrences: 1 } },
    };
    const localized = localizeNotificationListItem(item, notificationsCopyTranslator('en'));
    expect(localized.title).toBe('Progress claim certified');
    expect(localized.body).toBe('The claim was certified. · P');
    expect(readDgNotificationMetadata({ dg: { copyKey: 'BAD KEY' } })).toBeNull();
  });

  it('keeps the exhaustive notificationCopy helper working for dg types', () => {
    const copy = notificationCopy(notificationsCopyTranslator('en'), 'dg_task', {});
    expect(copy.title).toBe('Contractor task');
  });
});

describe('external notification visibility', () => {
  const grant: ExternalGrantView = {
    grantId: 'g',
    organizationId: 'org',
    vendorId: 'vendor-a',
    projectId: null,
    subcontractAgreementId: null,
    capabilities: new Set(['ext.claim.view', 'ext.project.view']),
    expiresAt: null,
  };
  const scope = {
    organizationId: 'org',
    vendorId: 'vendor-a',
    projectId: 'p1',
    subcontractAgreementId: 'agr-1',
    requiredCapabilities: ['ext.claim.view'],
  };

  it('requires a current grant over the same vendor with a required capability', () => {
    expect(externalNotificationVisible([grant], scope)).toBe(true);
    expect(externalNotificationVisible([{ ...grant, vendorId: 'vendor-b' }], scope)).toBe(false);
    expect(externalNotificationVisible([{ ...grant, capabilities: new Set(['ext.project.view']) }], scope)).toBe(false);
    expect(externalNotificationVisible([{ ...grant, expiresAt: new Date(Date.now() - 1000) }], scope)).toBe(false);
    expect(externalNotificationVisible([], scope)).toBe(false);
  });

  it('respects project and agreement narrowing', () => {
    expect(externalNotificationVisible([{ ...grant, projectId: 'p2' }], scope)).toBe(false);
    expect(externalNotificationVisible([{ ...grant, subcontractAgreementId: 'agr-2' }], scope)).toBe(false);
    expect(externalNotificationVisible([{ ...grant, subcontractAgreementId: 'agr-1', projectId: 'p1' }], scope)).toBe(true);
  });
});
