'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  activateBoq,
  allocateApprovedChangeToBoq,
  approveProgressBatch,
  createProgressBatch,
  createProgressBilling,
  createProjectBoq,
  removeBoqNode,
  upsertBoqNode,
} from '@/modules/boq';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface BoqFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  message?: string;
}

function mapError(error: unknown, t: (key: string) => string): BoqFormState {
  if (!(error instanceof AppError)) {
    return { error: t('errors.generic') };
  }
  const message = error.message || '';
  if (/already has billing|duplicate billing|already being billed/i.test(message)) {
    return { error: t('errors.duplicateBilling') };
  }
  if (/Only approved \(unbilled\)|Only approved/i.test(message)) {
    return { error: t('errors.billingRequiresApproved') };
  }
  if (/Over-measurement|exceeds current quantity/i.test(message)) {
    return { error: t('errors.overMeasurement') };
  }
  if (/Negative period quantities/i.test(message)) {
    return { error: t('errors.negativePeriod') };
  }
  if (/Only draft BOQ/i.test(message)) {
    return { error: t('errors.draftOnly') };
  }
  if (/Progress requires an active BOQ|Change allocation requires an active BOQ/i.test(message)) {
    return { error: t('errors.activeRequired') };
  }
  if (/zero - nothing to bill|period value is zero/i.test(message)) {
    return { error: t('errors.zeroPeriod') };
  }
  if (/Change order must belong|Change order/i.test(message) && /same project|NotFound/i.test(message)) {
    return { error: t('errors.changeOrderInvalid') };
  }
  if (error.name === 'NotFoundError' || /not found/i.test(message)) {
    return { error: t('errors.notFound') };
  }
  return { error: t('errors.generic') };
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}`, 'layout');
}

export async function createProjectBoqAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    await withOrgContext((context) =>
      createProjectBoq(context, {
        projectId,
        title: formData.get('title') ? String(formData.get('title')) : undefined,
        notes: formData.get('notes') ? String(formData.get('notes')) : undefined,
        progressMode:
          formData.get('progressMode') === 'advanced' ? 'advanced' : 'simple',
        contractId: formData.get('contractId') ? String(formData.get('contractId')) : undefined,
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('actions.created') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function upsertBoqNodeAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  const parentRaw = formData.get('parentId');
  try {
    await withOrgContext((context) =>
      upsertBoqNode(context, {
        boqId: String(formData.get('boqId') ?? ''),
        nodeId: formData.get('nodeId') ? String(formData.get('nodeId')) : undefined,
        parentId: parentRaw === '' || parentRaw == null ? null : String(parentRaw),
        nodeKind: formData.get('nodeKind') === 'chapter' ? 'chapter' : 'item',
        itemCode: formData.get('itemCode') ? String(formData.get('itemCode')) : null,
        description: String(formData.get('description') ?? ''),
        unit: formData.get('unit') ? String(formData.get('unit')) : null,
        pricingType:
          formData.get('pricingType') === 'lump_sum' ? 'lump_sum' : 'quantity_unit_price',
        quantity: formData.get('quantity') ? String(formData.get('quantity')) : '0',
        unitPrice: formData.get('unitPrice') ? String(formData.get('unitPrice')) : '0',
        openingApprovedQuantity: formData.get('openingApprovedQuantity')
          ? String(formData.get('openingApprovedQuantity'))
          : undefined,
        openingBilledQuantity: formData.get('openingBilledQuantity')
          ? String(formData.get('openingBilledQuantity'))
          : undefined,
        workPackageId: formData.get('workPackageId')
          ? String(formData.get('workPackageId'))
          : null,
        costCategoryId: formData.get('costCategoryId')
          ? String(formData.get('costCategoryId'))
          : null,
        budgetLineId: formData.get('budgetLineId')
          ? String(formData.get('budgetLineId'))
          : null,
        sortOrder: formData.get('sortOrder')
          ? Number(formData.get('sortOrder'))
          : undefined,
        notes: formData.get('notes') ? String(formData.get('notes')) : null,
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('actions.saveItem') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function activateBoqAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    await withOrgContext((context) =>
      activateBoq(context, { boqId: String(formData.get('boqId') ?? '') }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('actions.activated') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function removeBoqNodeAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    await withOrgContext((context) => removeBoqNode(context, String(formData.get('nodeId') ?? '')));
    revalidateProject(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function createProgressBatchAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  const boqNodeIds = formData.getAll('boqNodeId').map(String);
  const measuredQuantities = formData.getAll('measuredQuantity').map(String);
  const lineNotes = formData.getAll('lineNote').map(String);
  const lines = boqNodeIds.map((boqNodeId, index) => ({
    boqNodeId,
    measuredQuantity: measuredQuantities[index] ?? '0',
    notes: lineNotes[index]?.trim() ? lineNotes[index] : undefined,
  }));
  try {
    await withOrgContext((context) =>
      createProgressBatch(context, {
        boqId: String(formData.get('boqId') ?? ''),
        periodLabel: String(formData.get('periodLabel') ?? ''),
        periodStart: formData.get('periodStart')
          ? String(formData.get('periodStart'))
          : undefined,
        periodEnd: formData.get('periodEnd') ? String(formData.get('periodEnd')) : undefined,
        notes: formData.get('notes') ? String(formData.get('notes')) : undefined,
        lines,
      }),
    );
    revalidateProject(projectId);
    revalidatePath(`/projects/${projectId}/boq-measure`);
    return { ok: true, message: t('actions.progressCreated') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function approveProgressBatchAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  const lineIds = formData.getAll('approveLineId').map(String);
  const approvedQtys = formData.getAll('approveApprovedQuantity').map(String);
  const lineApprovals: Record<string, string> = {};
  for (let i = 0; i < lineIds.length; i += 1) {
    const id = lineIds[i];
    if (!id) continue;
    lineApprovals[id] = approvedQtys[i] ?? '0';
  }
  try {
    await withOrgContext((context) =>
      approveProgressBatch(context, {
        batchId: String(formData.get('batchId') ?? ''),
        lineApprovals: Object.keys(lineApprovals).length > 0 ? lineApprovals : undefined,
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('actions.progressApproved') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function createProgressBillingAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    await withOrgContext((context) =>
      createProgressBilling(context, {
        batchId: String(formData.get('batchId') ?? ''),
        retentionPercent: formData.get('retentionPercent')
          ? String(formData.get('retentionPercent'))
          : undefined,
        taxAmount: formData.get('taxAmount') ? String(formData.get('taxAmount')) : undefined,
        reference: formData.get('reference') ? String(formData.get('reference')) : undefined,
        notes: formData.get('notes') ? String(formData.get('notes')) : undefined,
      }),
    );
    revalidateProject(projectId);
    revalidatePath('/billing');
    return { ok: true, message: t('actions.billingCreated') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function allocateApprovedChangeToBoqAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    await withOrgContext((context) =>
      allocateApprovedChangeToBoq(context, {
        boqId: String(formData.get('boqId') ?? ''),
        changeOrderId: String(formData.get('changeOrderId') ?? ''),
        allocations: [
          {
            allocationKind: (() => {
              const kind = String(formData.get('allocationKind') ?? 'quantity_change');
              if (kind === 'unallocated_contract') return 'unallocated_contract';
              if (kind === 'unit_price_change') return 'unit_price_change';
              return 'quantity_change';
            })(),
            boqNodeId: formData.get('boqNodeId') ? String(formData.get('boqNodeId')) : null,
            quantityDelta: formData.get('quantityDelta')
              ? String(formData.get('quantityDelta'))
              : '0',
            unitPriceDelta: formData.get('unitPriceDelta')
              ? String(formData.get('unitPriceDelta'))
              : '0',
            amountDelta: String(formData.get('amountDelta') ?? '0'),
            notes: formData.get('notes') ? String(formData.get('notes')) : undefined,
          },
        ],
      }),
    );
    revalidateProject(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function updateBoqNodeMappingsAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  const emptyToNull = (raw: FormDataEntryValue | null) => {
    const value = raw == null ? '' : String(raw);
    return value.trim() === '' ? null : value;
  };
  try {
    const { updateBoqNodeMappings } = await import('@/modules/boq');
    await withOrgContext((context) =>
      updateBoqNodeMappings(context, {
        nodeId: String(formData.get('nodeId') ?? ''),
        workPackageId: emptyToNull(formData.get('workPackageId')),
        costCategoryId: emptyToNull(formData.get('costCategoryId')),
        budgetLineId: emptyToNull(formData.get('budgetLineId')),
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('mappings.saved') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function createSubcontractorScheduleAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    const { createSubcontractorSchedule } = await import('@/modules/boq');
    await withOrgContext((context) =>
      createSubcontractorSchedule(context, {
        projectId,
        boqId: String(formData.get('boqId') ?? ''),
        vendorEngagementId: String(formData.get('vendorEngagementId') ?? ''),
        subcontractAgreementId: (() => {
          const raw = String(formData.get('subcontractAgreementId') ?? '').trim();
          return raw ? raw : undefined;
        })(),
        title: formData.get('title') ? String(formData.get('title')) : undefined,
      }),
    );
    revalidateProject(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function addSubcontractorScheduleLineAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    const { addSubcontractorScheduleLine } = await import('@/modules/boq');
    await withOrgContext((context) =>
      addSubcontractorScheduleLine(context, {
        scheduleId: String(formData.get('scheduleId') ?? ''),
        boqNodeId: String(formData.get('boqNodeId') ?? ''),
        agreedQuantity: String(formData.get('agreedQuantity') ?? '0'),
        unitRate: String(formData.get('unitRate') ?? '0'),
      }),
    );
    revalidateProject(projectId);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

/**
 * Durable valuation draft only.
 * Does not call createApBill - propose draft vendor bill manually in AP.
 */
export async function createSubcontractorValuationDraftAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  const scheduleId = String(formData.get('scheduleId') ?? '');
  try {
    const { createSubcontractorValuationDraft } = await import('@/modules/boq');
    const lines: { scheduleLineId: string; approvedQuantity: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith('qty_')) continue;
      lines.push({
        scheduleLineId: key.slice(4),
        approvedQuantity: String(value),
      });
    }
    await withOrgContext((context) =>
      createSubcontractorValuationDraft(context, {
        scheduleId,
        periodLabel: String(formData.get('periodLabel') ?? ''),
        lines,
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('subcontractor.valuationCreated') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function activateSubcontractorScheduleAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    const { activateSubcontractorSchedule } = await import('@/modules/boq');
    await withOrgContext((context) =>
      activateSubcontractorSchedule(context, {
        scheduleId: String(formData.get('scheduleId') ?? ''),
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('subcontractor.activated') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function approveSubcontractorValuationAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    const { approveSubcontractorValuation } = await import('@/modules/boq');
    await withOrgContext((context) =>
      approveSubcontractorValuation(context, {
        valuationId: String(formData.get('valuationId') ?? ''),
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('subcontractor.valuationApproved') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function createDraftApFromSubcontractorValuationAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    const { createDraftApFromSubcontractorValuation } = await import('@/modules/boq');
    await withOrgContext((context) =>
      createDraftApFromSubcontractorValuation(context, {
        valuationId: String(formData.get('valuationId') ?? ''),
        retentionPercent: (() => {
          const raw = String(formData.get('retentionPercent') ?? '').trim();
          return raw ? raw : undefined;
        })(),
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('subcontractor.draftApCreated') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}

export async function proposeSubcontractorValuationApAction(
  _prev: BoqFormState,
  formData: FormData,
): Promise<BoqFormState> {
  const t = await getTranslations('boq');
  const projectId = String(formData.get('projectId') ?? '');
  try {
    const { proposeSubcontractorValuationAp } = await import('@/modules/boq');
    await withOrgContext((context) =>
      proposeSubcontractorValuationAp(context, {
        valuationId: String(formData.get('valuationId') ?? ''),
        vendorBillId: String(formData.get('vendorBillId') ?? ''),
      }),
    );
    revalidateProject(projectId);
    return { ok: true, message: t('subcontractor.proposedAp') };
  } catch (error) {
    if (error instanceof AppError) return mapError(error, t);
    throw error;
  }
}
