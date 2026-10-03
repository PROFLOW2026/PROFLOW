import { describe, expect, it } from 'vitest';
import { CLAIMS_AUDIT_ACTIONS } from '@/shared/audit/dg/claims';
import { COLLAB_AUDIT_ACTIONS } from '@/shared/audit/dg/collab';
import { COMPLIANCE_AUDIT_ACTIONS } from '@/shared/audit/dg/compliance';
import { COORDINATION_AUDIT_ACTIONS } from '@/shared/audit/dg/coordination';
import { DOCUMENTS_AUDIT_ACTIONS } from '@/shared/audit/dg/documents';
import { EXTERNAL_AUDIT_ACTIONS } from '@/shared/audit/dg/external';
import { FIELD_AUDIT_ACTIONS } from '@/shared/audit/dg/field';
import { NOTIFICATIONS_AUDIT_ACTIONS } from '@/shared/audit/dg/notifications';
import { PERMISSIONS_AUDIT_ACTIONS } from '@/shared/audit/dg/permissions';
import { PROCUREMENT_AUDIT_ACTIONS } from '@/shared/audit/dg/procurement';
import { PROFILE_AUDIT_ACTIONS } from '@/shared/audit/dg/profile';
import { QUALITY_AUDIT_ACTIONS } from '@/shared/audit/dg/quality';
import { RFI_AUDIT_ACTIONS } from '@/shared/audit/dg/rfi';
import { SUBCONTRACT_AUDIT_ACTIONS } from '@/shared/audit/dg/subcontract';
import { SURFACES_AUDIT_ACTIONS } from '@/shared/audit/dg/surfaces';
import { LOCALES, type Locale } from '@/shared/i18n/config';
import { readLocaleCatalog } from './i18n-catalog-helpers';

function actionValues(record: object): string[] {
  return Object.values(record).filter((value): value is string => typeof value === 'string');
}

/** Every action string exported from src/shared/audit/dg/*.ts. */
const DG_AUDIT_ACTIONS: readonly string[] = [
  ...actionValues(CLAIMS_AUDIT_ACTIONS),
  ...actionValues(COLLAB_AUDIT_ACTIONS),
  ...actionValues(COMPLIANCE_AUDIT_ACTIONS),
  ...actionValues(COORDINATION_AUDIT_ACTIONS),
  ...actionValues(DOCUMENTS_AUDIT_ACTIONS),
  ...actionValues(EXTERNAL_AUDIT_ACTIONS),
  ...actionValues(FIELD_AUDIT_ACTIONS),
  ...actionValues(NOTIFICATIONS_AUDIT_ACTIONS),
  ...actionValues(PERMISSIONS_AUDIT_ACTIONS),
  ...actionValues(PROCUREMENT_AUDIT_ACTIONS),
  ...actionValues(PROFILE_AUDIT_ACTIONS),
  ...actionValues(QUALITY_AUDIT_ACTIONS),
  ...actionValues(RFI_AUDIT_ACTIONS),
  ...actionValues(SUBCONTRACT_AUDIT_ACTIONS),
  ...actionValues(SURFACES_AUDIT_ACTIONS),
];

function activityLabel(actions: Record<string, unknown>, action: string): string | undefined {
  const [entity, verb, extra] = action.split('.');
  if (!entity || !verb || extra) return undefined;
  const group = actions[entity];
  if (!group || typeof group !== 'object') return undefined;
  const label = (group as Record<string, unknown>)[verb];
  return typeof label === 'string' && label.trim().length > 0 ? label : undefined;
}

describe('dg activity action labels', () => {
  it.each(LOCALES)(
    '%s settings.activity.actions has a label for every dg audit action',
    (locale: Locale) => {
      const catalog = readLocaleCatalog(locale, 'settings') as {
        activity?: { actions?: Record<string, unknown> };
      };
      const actions = catalog.activity?.actions ?? {};
      const missing = DG_AUDIT_ACTIONS.filter((action) => activityLabel(actions, action) === undefined);
      expect(missing).toEqual([]);
    },
  );
});
