/**
 * Confirm billing_plan CSV import.
 * Adds draft lines to an existing plan, or creates a draft plan for projectId/contractId then adds lines.
 */

import { addPlanLine, createBillingPlan, getBillingPlanDetail } from '@/modules/billing-plan';
import {
  insertSection,
  listSectionsForPlan,
} from '@/modules/billing-plan/data/lines.repository';
import { computeCurrentContractValue } from '@/modules/projects';
import {
  findPrimaryContractByProject,
  listContractValueEvents,
} from '@/modules/projects/data/contracts.repository';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { money, percentOfMoney, toNumericString } from '@/shared/money';
import type { ImportRowResult, MappedImportRow } from '../domain/types';

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

const LINE_KINDS = [
  'fixed_amount',
  'percent_of_contract',
  'percent_of_base',
  'milestone',
  'period',
  'boq_link',
  'manual',
] as const;

type LineKind = (typeof LINE_KINDS)[number];

function inferLineKind(values: Readonly<Record<string, string>>): LineKind {
  const explicit = emptyToUndefined(values.lineKind)?.toLowerCase();
  if (explicit && (LINE_KINDS as readonly string[]).includes(explicit)) {
    return explicit as LineKind;
  }
  if (emptyToUndefined(values.agreedPercent)) return 'percent_of_contract';
  if (emptyToUndefined(values.agreedAmount)) return 'fixed_amount';
  return 'manual';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown billing plan import error';
}

export async function confirmBillingPlanRows(
  context: OrgContext,
  rows: readonly MappedImportRow[],
  options: {
    projectId?: string;
    planId?: string;
    contractId?: string;
  },
): Promise<ImportRowResult[]> {
  let planId = options.planId?.trim() || undefined;
  const projectId = options.projectId?.trim() || undefined;
  let contractId = options.contractId?.trim() || undefined;

  if (!planId) {
    if (!projectId) {
      throw new ValidationError([
        {
          path: 'planId',
          message: 'planId or projectId is required for billing_plan import',
        },
      ]);
    }
    if (!contractId) {
      const primary = await findPrimaryContractByProject(
        context.db,
        context.organizationId,
        projectId,
      );
      if (!primary) throw new NotFoundError('Contract');
      contractId = primary.id;
    }
    const plan = await createBillingPlan(context, {
      projectId,
      contractId,
      name: 'Imported billing plan',
      activate: false,
    });
    planId = plan.id;
  }

  const detail = await getBillingPlanDetail(context, { planId });
  const currency = detail.plan.currency;
  const events = await listContractValueEvents(
    context.db,
    context.organizationId,
    detail.plan.contractId,
  );
  const contractValue = toNumericString(computeCurrentContractValue(events, currency));
  const base = money(contractValue, currency);

  const sectionIds = new Map<string, string>();
  for (const section of await listSectionsForPlan(
    context.db,
    context.organizationId,
    planId,
  )) {
    sectionIds.set(section.name, section.id);
  }

  let sectionOrder = sectionIds.size;
  let sortOrder = detail.lines.length;
  const results: ImportRowResult[] = [];

  for (const row of rows) {
    try {
      const v = row.values;
      const label = emptyToUndefined(v.label);
      if (!label) {
        throw new ValidationError([{ path: 'label', message: 'label is required' }]);
      }

      let sectionId: string | null = null;
      const sectionName = emptyToUndefined(v.section);
      if (sectionName) {
        const existing = sectionIds.get(sectionName);
        if (existing) {
          sectionId = existing;
        } else {
          const section = await insertSection(context.db, {
            organizationId: context.organizationId,
            planId,
            name: sectionName,
            sortOrder: sectionOrder++,
          });
          sectionIds.set(sectionName, section.id);
          sectionId = section.id;
        }
      }

      const lineKind = inferLineKind(v);
      const agreedPercent = emptyToUndefined(v.agreedPercent) ?? null;
      let agreedAmount = emptyToUndefined(v.agreedAmount);
      if (!agreedAmount && agreedPercent) {
        agreedAmount = toNumericString(percentOfMoney(base, agreedPercent));
      }
      if (!agreedAmount) agreedAmount = '0';

      const line = await addPlanLine(context, {
        planId,
        sectionId,
        label,
        lineKind,
        agreedAmount,
        agreedPercent,
        targetDate: emptyToUndefined(v.targetDate) ?? null,
        notes: emptyToUndefined(v.notes) ?? null,
        sortOrder: sortOrder++,
      });

      results.push({ rowNumber: row.rowNumber, ok: true, entityId: line.id });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, ok: false, error: errorMessage(error) });
    }
  }

  return results;
}
