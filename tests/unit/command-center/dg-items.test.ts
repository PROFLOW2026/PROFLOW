import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectsWithCapability } from '@/modules/command-center/data/collect-dg';
import {
  clearDgCommandCenterPorts,
  dgCommandCenterPortsFor,
  registerDgCommandCenterPort,
} from '@/modules/command-center/data/dg-ports';
import { buildDgItems, DG_ITEM_DEFINITIONS } from '@/modules/command-center/domain/dg-items';
import { commandCenterCopyScope } from '@/modules/command-center/domain/item-copy';
import { assertSafeItemStateTransition } from '@/modules/command-center/domain/ranking';
import { DG_SOURCE_TYPES, isFinancialSourceType } from '@/modules/command-center/domain/types';
import type { BusinessDate } from '@/shared/dates';
import { commandCenterCopyTranslator } from '@/shared/i18n/sync-namespace-translator';

const today = '2026-10-03' as BusinessDate;
const scope = commandCenterCopyScope(commandCenterCopyTranslator('en'), 'en');
const P = '11111111-1111-4111-8111-111111111111';

describe('dg command center items', () => {
  it('emits only overdue items for overdue sources, ranked by lateness', () => {
    const items = buildDgItems({
      definition: DG_ITEM_DEFINITIONS.dg_rfi_overdue,
      rows: [
        { id: 'r1', projectId: P, dueDate: '2026-10-01', reference: 'RFI-1', projectName: 'Tower' },
        { id: 'r2', projectId: P, dueDate: '2026-09-20' },
        { id: 'r3', projectId: P, dueDate: '2026-10-03' },
        { id: 'r4', projectId: P, dueDate: '2026-10-10' },
        { id: 'r5', projectId: P },
      ],
      scope,
      today,
      cap: 15,
    });
    expect(items.map((item) => item.sourceId)).toEqual(['r2', 'r1']);
    expect(items[1]!.what).toBe('Answer RFI RFI-1');
    expect(items[1]!.why).toBe('2 days overdue (due 2026-10-01)');
    expect(items[1]!.where).toBe('Tower');
    expect(items[1]!.href).toBe(`/projects/${P}/rfi/r1`);
  });

  it('keeps expiring compliance inside the horizon and escalates expired items', () => {
    const items = buildDgItems({
      definition: DG_ITEM_DEFINITIONS.dg_compliance_expiring,
      rows: [
        { id: 'c1', projectId: P, dueDate: '2026-10-20' },
        { id: 'c2', projectId: P, dueDate: '2026-09-30', vendorName: 'Acme' },
        { id: 'c3', projectId: P, dueDate: '2027-01-01' },
      ],
      scope,
      today,
      cap: 15,
    });
    expect(items.map((item) => item.sourceId)).toEqual(['c2', 'c1']);
    expect(items[0]!.severity).toBe('high');
    expect(items[0]!.why).toBe('Expired on 2026-09-30');
  });

  it('shows payment holds with localized reasons and keeps them financial', () => {
    const [item] = buildDgItems({
      definition: DG_ITEM_DEFINITIONS.dg_payment_eligibility_blocked,
      rows: [
        { id: 'h1', projectId: P, claimId: 'claim-1', reasons: ['missing_invoice', 'expired_insurance', 'weird'] },
        { id: 'h2', projectId: P, reasons: [] },
      ],
      scope,
      today,
      cap: 15,
    });
    expect(item!.why).toBe('Missing invoice · Insurance expired · Payment hold');
    expect(item!.href).toBe(`/projects/${P}/claims/claim-1`);
    expect(item!.isFinancial).toBe(true);
    expect(item!.allowHandle).toBe(false);
    expect(assertSafeItemStateTransition('dg_claim_awaiting_review', 'dismissed').ok).toBe(false);
    expect(isFinancialSourceType('dg_rfi_overdue')).toBe(false);
  });

  it('scopes ports to projects where the viewer holds the capability', () => {
    const viewer = new Map([
      ['p-ops', new Set(['project.view', 'rfi.manage'])],
      ['p-fin', new Set(['project.view', 'claim.view', 'claim.review'])],
    ]);
    expect(projectsWithCapability(viewer, DG_ITEM_DEFINITIONS.dg_rfi_overdue.capabilities)).toEqual(['p-ops']);
    expect(projectsWithCapability(viewer, DG_ITEM_DEFINITIONS.dg_claim_awaiting_review.capabilities)).toEqual(['p-fin']);
    expect(projectsWithCapability(viewer, DG_ITEM_DEFINITIONS.dg_payment_eligibility_blocked.capabilities)).toEqual([]);
    expect(projectsWithCapability('all', DG_ITEM_DEFINITIONS.dg_rfi_overdue.capabilities)).toBe('all');
  });

  it('registers multiple providers per source without duplicates', () => {
    clearDgCommandCenterPorts();
    const port = async () => [];
    registerDgCommandCenterPort('dg_acknowledgement_overdue', port);
    registerDgCommandCenterPort('dg_acknowledgement_overdue', port);
    registerDgCommandCenterPort('dg_acknowledgement_overdue', async () => []);
    expect(dgCommandCenterPortsFor('dg_acknowledgement_overdue')).toHaveLength(2);
    expect(dgCommandCenterPortsFor('dg_rfi_overdue')).toHaveLength(0);
    clearDgCommandCenterPorts();
  });

  it('has source labels and item copy in all four locales', () => {
    for (const name of ['he-IL', 'en', 'ar', 'ru']) {
      const messages = JSON.parse(
        readFileSync(path.resolve(process.cwd(), `src/locales/${name}/commandCenter.json`), 'utf8'),
      ) as { sources: Record<string, string>; dg: Record<string, Record<string, string>> };
      for (const sourceType of DG_SOURCE_TYPES) {
        expect(messages.sources[sourceType], `${name} ${sourceType}`).toBeTruthy();
        expect(messages.dg[sourceType]?.what, `${name} ${sourceType}`).toBeTruthy();
        expect(messages.dg[sourceType]?.whatWithReference, `${name} ${sourceType}`).toContain('{reference}');
        expect(messages.dg[sourceType]?.why, `${name} ${sourceType}`).toBeTruthy();
      }
      for (const key of ['overdue', 'waiting', 'startsOn', 'expiresOn', 'expired']) {
        expect(messages.dg.why?.[key], `${name} why.${key}`).toBeTruthy();
      }
    }
  });
});
