import { getProjectApOutstanding } from '@/modules/ap';
import { listProjectBillingRecords } from '@/modules/billing';
import { listBoqProgress, listBoqsForProject } from '@/modules/boq';
import { listProjectChangeRequests } from '@/modules/commercial';
import { listEntityDocuments } from '@/modules/documents';
import { listInspectionsForOrg, listPunchListItemsForOrg } from '@/modules/field-ops';
import { getProjectFinancials } from '@/modules/financials';
import { hasSubmittedFormForOwner, listFormTemplatesForOrg } from '@/modules/forms';
import {
  isPurchaseOrderCancellable,
  type PurchaseOrderStatus,
} from '@/modules/procurement/domain/committed-cost';
import { listPurchaseOrdersForOrg } from '@/modules/procurement';
import { listProjectMilestones } from '@/modules/projects';
import { listSafetyRecordsForOrg } from '@/modules/safety';
import { listProjectSubcontracts } from '@/modules/vendors';
import { listProjectTimeEntries } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { addMoney, isPositiveMoney, money, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { classifyReadiness, emptyReadinessFacts } from '../domain/readiness';
import type { ReadinessFacts, ReadinessItem } from '../domain/types';

const REQUIRED_FORM_CATEGORIES = new Set(['required', 'closeout', 'handover', 'סגירה']);

async function countOrZero(run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch {
    return 0;
  }
}

function flagCount(value: MoneyValue | null | undefined): number {
  if (!value) return 0;
  return isPositiveMoney(value) ? 1 : 0;
}

export async function collectCloseoutReadiness(
  context: OrgContext,
  projectId: string,
): Promise<{
  readonly items: readonly ReadinessItem[];
  readonly facts: ReadinessFacts;
  readonly retentionHeld: MoneyValue | null;
  readonly financials: Awaited<ReturnType<typeof getProjectFinancials>> | null;
}> {
  const facts = { ...emptyReadinessFacts() };
  let financials: Awaited<ReturnType<typeof getProjectFinancials>> | null = null;
  let retentionHeld: MoneyValue | null = null;

  if (hasPermission(context, PERMISSIONS.FIELD_OPS_READ)) {
    facts.openDefects = await countOrZero(async () => {
      const rows = await listPunchListItemsForOrg(context, { projectId });
      return rows.filter((row) => row.status === 'open' || row.status === 'in_progress').length;
    });
    const inspections = await countOrZero(async () => {
      const rows = await listInspectionsForOrg(context, { projectId });
      facts.failedInspections = rows.filter((row) => row.status === 'failed').length;
      facts.openInspections = rows.filter(
        (row) => row.status === 'scheduled' || row.status === 'in_progress',
      ).length;
      return 0;
    });
    void inspections;
  }

  if (hasPermission(context, PERMISSIONS.SAFETY_READ)) {
    facts.openSafety = await countOrZero(async () => {
      const rows = await listSafetyRecordsForOrg(context, { projectId });
      return rows.filter((row) => row.status === 'open' || row.status === 'in_progress').length;
    });
  }

  if (hasPermission(context, PERMISSIONS.CHANGES_READ)) {
    await countOrZero(async () => {
      const rows = await listProjectChangeRequests(context, projectId);
      facts.awaitingApprovalChanges = rows.filter((row) => row.status === 'awaiting_approval').length;
      facts.draftChanges = rows.filter((row) => row.status === 'draft').length;
      return 0;
    });
  }

  facts.submittedUnapprovedTime = await countOrZero(async () => {
    const rows = await listProjectTimeEntries(context, projectId);
    facts.submittedUnapprovedTime = rows.filter((row) => row.approvalStatus === 'submitted').length;
    facts.otherUnapprovedTime = rows.filter(
      (row) => row.approvalStatus === 'draft' || row.approvalStatus === 'returned',
    ).length;
    return facts.submittedUnapprovedTime;
  });

  if (hasPermission(context, PERMISSIONS.FORMS_READ)) {
    facts.incompleteForms = await countOrZero(async () => {
      const templates = await listFormTemplatesForOrg(context, { enabledOnly: true });
      const required = templates.filter((template) =>
        REQUIRED_FORM_CATEGORIES.has((template.category ?? '').trim().toLowerCase()),
      );
      if (required.length === 0) return 0;
      let missing = 0;
      for (const template of required) {
        const submitted = await hasSubmittedFormForOwner(context.db, context.organizationId, {
          ownerType: 'project',
          ownerId: projectId,
          templateId: template.id,
        });
        if (!submitted) missing += 1;
      }
      return missing;
    });
  }

  if (hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) {
    try {
      financials = await getProjectFinancials(context, projectId);
      facts.openCommitments = flagCount(financials.cost.committedOpen);
      facts.openSupplierLiabilities = flagCount(financials.cost.openApPayable);
      facts.openClientBalances = flagCount(financials.billing.outstanding);
    } catch {
      financials = null;
    }
  }

  if (hasPermission(context, PERMISSIONS.PROCUREMENT_READ)) {
    facts.openPurchaseOrders = await countOrZero(async () => {
      const rows = await listPurchaseOrdersForOrg(context, projectId);
      return rows.filter((row) =>
        isPurchaseOrderCancellable(row.status as PurchaseOrderStatus),
      ).length;
    });
  }

  if (hasPermission(context, PERMISSIONS.BOQ_READ)) {
    facts.unbilledWork = await countOrZero(async () => {
      const versions = await listBoqsForProject(context.db, context.organizationId, projectId);
      const active = versions.find((row) => row.status === 'active') ?? versions[0];
      if (!active) return 0;
      const { batches } = await listBoqProgress(context, active.id);
      return batches.filter((row) => row.batch.status === 'approved').length;
    });
  }

  let arRetention = zeroMoney(context.organization.baseCurrency);
  let apRetention = zeroMoney(context.organization.baseCurrency);
  if (hasPermission(context, PERMISSIONS.BILLING_READ)) {
    await countOrZero(async () => {
      const records = await listProjectBillingRecords(context, projectId);
      for (const record of records) {
        const held = record.retentionHeldRemaining;
        if (held && isPositiveMoney(held)) {
          arRetention =
            arRetention.currency === held.currency ? addMoney(arRetention, held) : held;
        }
      }
      return 0;
    });
  }
  if (hasPermission(context, PERMISSIONS.AP_READ)) {
    await countOrZero(async () => {
      const summary = await getProjectApOutstanding(context, projectId, {
        currency: financials?.currency ?? context.organization.baseCurrency,
      });
      apRetention = money(summary.retentionHeld, summary.currency);
      return 0;
    });
  }

  if (isPositiveMoney(arRetention) || isPositiveMoney(apRetention)) {
    const currency = financials?.currency ?? arRetention.currency;
    const ar = arRetention.currency === currency ? arRetention : zeroMoney(currency);
    const ap = apRetention.currency === currency ? apRetention : zeroMoney(currency);
    retentionHeld = addMoney(ar, ap);
    facts.remainingRetention = flagCount(retentionHeld);
  }

  if (hasPermission(context, PERMISSIONS.VENDORS_READ)) {
    facts.openSubcontract = await countOrZero(async () => {
      const rows = await listProjectSubcontracts(context, projectId);
      return rows.filter((row) => row.status === 'draft' || row.status === 'active').length;
    });
  }

  if (hasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    facts.missingDocuments = await countOrZero(async () => {
      const docs = await listEntityDocuments(context, { ownerType: 'project', ownerId: projectId });
      const required = docs.filter((doc) => doc.isRequired);
      if (required.length === 0) return 0;
      return required.filter((doc) => doc.status !== 'available').length;
    });
  }

  facts.unfinishedMilestones = await countOrZero(async () => {
    const rows = await listProjectMilestones(context, projectId);
    return rows.filter(
      (row) =>
        Boolean(row.targetDate) && (row.status === 'planned' || row.status === 'missed'),
    ).length;
  });

  return {
    items: classifyReadiness(facts),
    facts,
    retentionHeld,
    financials,
  };
}
