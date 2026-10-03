import 'server-only';

import { listProjectContractorTasks } from '@/modules/collaboration';
import { canReadWith } from '@/modules/coordination/application/authorization';
import { listProjectCoordinationEvents } from '@/modules/coordination';
import { listParticipants } from '@/modules/coordination/data/coordination.repository';
import { getProjectComplianceOverview } from '@/modules/contractor-compliance';
import { listProjectDefects } from '@/modules/defects';
import { listProjectInspections } from '@/modules/inspections';
import { listProjectDrawings } from '@/modules/project-plans';
import { listDistribution } from '@/modules/project-plans/data/plans.repository';
import { listDocumentSharesForProject } from '@/modules/project-plans/data/shares.repository';
import type { DocumentShareAudience } from '@/modules/project-plans';
import { PROJECT_CAPABILITIES as C, loadProjectCapabilities } from '@/modules/project-team';
import { listProjectRfis } from '@/modules/rfi';
import type { RfiStatus } from '@/modules/rfi';
import { listProjectSubmittals } from '@/modules/submittals';
import type { SubmittalStatus, SubmittalType } from '@/modules/submittals';
import { getAgreementPayments, listProjectClaims } from '@/modules/subcontract-claims';
import type { SubcontractClaimStatus } from '@/modules/subcontract-claims';
import { getAgreementWorkspace, listAgreementChanges } from '@/modules/subcontracts';
import type {
  AgreementFinancialView,
  AgreementOperationalView,
  ChangeView,
  WorkLineView,
} from '@/modules/subcontracts';
import type { CoordinationEventStatus, EventReadinessState } from '@/modules/coordination';
import type { DefectStatus, DefectSeverity } from '@/modules/defects';
import type { InspectionOutcome, InspectionStatus } from '@/modules/inspections';
import type { ExternalTaskStatus } from '@/modules/collaboration';
import type { ComplianceRequirementKind, ComplianceStatus } from '@/modules/contractor-compliance';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';

const LIST_LIMIT = 50;

/** This agreement, or a vendor-level row that is not pinned to a different agreement. */
function matchesAgreement(
  agreementId: string | null,
  vendorId: string | null,
  targetAgreementId: string,
  targetVendorId: string,
): boolean {
  if (agreementId === targetAgreementId) return true;
  return agreementId == null && vendorId === targetVendorId;
}

function shareMatches(
  share: { readonly audience: DocumentShareAudience; readonly agreementId: string | null; readonly vendorId: string | null },
  agreementId: string,
  vendorId: string,
): boolean {
  if (share.audience === 'project_contractors') return true;
  if (share.audience === 'agreement') return share.agreementId === agreementId;
  return share.audience === 'principal' && share.vendorId === vendorId;
}

export interface Contractor360Event {
  readonly id: string;
  readonly title: string;
  readonly status: CoordinationEventStatus;
  readonly readiness: EventReadinessState;
  readonly startsAt: string;
  readonly locationName: string | null;
}

export interface Contractor360Task {
  readonly taskId: string;
  readonly title: string;
  readonly status: ExternalTaskStatus;
  readonly dueDate: string | null;
}

export interface Contractor360Claim {
  readonly id: string;
  readonly claimNumber: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: SubcontractClaimStatus;
  /** Present only when the viewer holds claim.view or contract.financial.view. */
  readonly amounts: {
    readonly currency: string;
    readonly submitted: string;
    readonly certified: string | null;
  } | null;
}

export interface Contractor360Share {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly sharedAt: string;
}

export interface Contractor360Plan {
  readonly id: string;
  readonly drawingNumber: string;
  readonly title: string;
  readonly revisionLabel: string;
}

export interface Contractor360Rfi {
  readonly id: string;
  readonly number: number;
  readonly subject: string;
  readonly status: RfiStatus;
  readonly dueDate: string | null;
  readonly overdue: boolean;
}

export interface Contractor360Submittal {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly type: SubmittalType;
  readonly status: SubmittalStatus;
  readonly dueDate: string | null;
  readonly overdue: boolean;
}

export interface Contractor360Inspection {
  readonly id: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly status: InspectionStatus;
  readonly outcome: InspectionOutcome | null;
  readonly scheduledFor: string | null;
}

export interface Contractor360Defect {
  readonly id: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly status: DefectStatus;
  readonly severity: DefectSeverity;
  readonly dueDate: string | null;
  readonly overdue: boolean;
}

export interface Contractor360Payments {
  readonly currency: string;
  /** False when the agreement has no payable bases — the UI must not print zero totals. */
  readonly hasBases: boolean;
  readonly certified: string;
  readonly payableNet: string;
  readonly paid: string;
  readonly retentionHeld: string;
  readonly holdCount: number;
  readonly eligible: boolean;
}

export interface Contractor360Requirement {
  readonly id: string;
  readonly title: string;
  readonly kind: ComplianceRequirementKind;
  readonly status: ComplianceStatus;
}

export interface Contractor360View {
  readonly organizationId: string;
  readonly agreement: AgreementOperationalView;
  readonly lines: readonly WorkLineView[];
  readonly financial: AgreementFinancialView | null;
  readonly changes: readonly ChangeView[];
  /** Null when the viewer lacks schedule.view and contractor.coordinate. */
  readonly events: readonly Contractor360Event[] | null;
  /** Null when the viewer lacks tasks.view. */
  readonly tasks: readonly Contractor360Task[] | null;
  /** Null when the viewer lacks claim.view (the claims loader's gate). */
  readonly claims: {
    readonly showAmounts: boolean;
    readonly items: readonly Contractor360Claim[];
  } | null;
  /** Null when the viewer lacks documents.view. */
  readonly documents: {
    readonly shares: readonly Contractor360Share[];
    readonly plans: readonly Contractor360Plan[];
  } | null;
  /**
   * Vendor-scoped. The RFI list loader filters by vendor and does not return agreement id,
   * so rows for another agreement of the same vendor can appear.
   */
  readonly rfis: { readonly items: readonly Contractor360Rfi[]; readonly hasMore: boolean };
  /** Vendor-scoped, same limit as RFIs. */
  readonly submittals: { readonly items: readonly Contractor360Submittal[]; readonly hasMore: boolean };
  /** Vendor-scoped. The inspection list does not return agreement id. */
  readonly inspections: { readonly items: readonly Contractor360Inspection[]; readonly hasMore: boolean };
  /** Vendor-scoped. The defect list does not return agreement id. */
  readonly defects: { readonly items: readonly Contractor360Defect[]; readonly hasMore: boolean };
  /** Null when the viewer lacks payment.view. Amounts are the payment loader's own totals. */
  readonly payments: Contractor360Payments | null;
  readonly compliance: {
    readonly requirements: readonly Contractor360Requirement[];
    readonly blockingCount: number;
    readonly pendingReviewCount: number;
  };
}

export async function loadContractor360(
  context: OrgContext,
  projectId: string,
  agreementId: string,
): Promise<Contractor360View> {
  const held = await loadProjectCapabilities(context, projectId);
  const [workspace, changeList] = await Promise.all([
    getAgreementWorkspace(context, agreementId),
    listAgreementChanges(context, agreementId),
  ]);
  if (workspace.agreement.projectId !== projectId) throw new NotFoundError('Subcontract agreement');

  const vendorId = workspace.agreement.vendorId;
  const showClaimAmounts = held.has(C.CLAIM_VIEW) || held.has(C.CONTRACT_FINANCIAL_VIEW);

  const [events, tasks, claims, documents, rfis, submittals, inspections, defects, payments, compliance] =
    await Promise.all([
      held && canReadWith(held)
        ? loadEvents(context, projectId, agreementId, vendorId)
        : Promise.resolve(null),
      held.has(C.TASKS_VIEW)
        ? listProjectContractorTasks(context, { projectId, vendorId, limit: 100 }).then((rows) =>
            rows
              .filter((task) => task.subcontractAgreementId == null || task.subcontractAgreementId === agreementId)
              .map(
                (task): Contractor360Task => ({
                  taskId: task.taskId,
                  title: task.title,
                  status: task.status,
                  dueDate: task.dueDate,
                }),
              ),
          )
        : Promise.resolve(null),
      held.has(C.CLAIM_VIEW)
        ? listProjectClaims(context, projectId, { agreementId }).then((rows) => ({
            showAmounts: showClaimAmounts,
            items: rows.map(
              (row): Contractor360Claim => ({
                id: row.id,
                claimNumber: row.claimNumber,
                periodStart: row.periodStart,
                periodEnd: row.periodEnd,
                status: row.status,
                amounts: showClaimAmounts
                  ? {
                      currency: row.currency,
                      submitted: row.currentSubmitted,
                      certified: row.currentCertified,
                    }
                  : null,
              }),
            ),
          }))
        : Promise.resolve(null),
      held.has(C.DOCUMENTS_VIEW) ? loadSharedDocuments(context, projectId, agreementId, vendorId) : Promise.resolve(null),
      listProjectRfis(context, { projectId, vendorId, limit: LIST_LIMIT, offset: 0 }).then((page) => ({
        hasMore: page.hasMore,
        items: page.items
          .filter((item) => matchesAgreement(item.subcontractAgreementId, item.vendorId, agreementId, vendorId))
          .map(
          (item): Contractor360Rfi => ({
            id: item.id,
            number: item.number,
            subject: item.subject,
            status: item.status,
            dueDate: item.dueDate,
            overdue: item.overdue,
          }),
        ),
      })),
      listProjectSubmittals(context, { projectId, vendorId, limit: LIST_LIMIT, offset: 0 }).then((page) => ({
        hasMore: page.hasMore,
        items: page.items
          .filter((item) => matchesAgreement(item.subcontractAgreementId, item.vendorId, agreementId, vendorId))
          .map(
          (item): Contractor360Submittal => ({
            id: item.id,
            number: item.number,
            title: item.title,
            type: item.type,
            status: item.status,
            dueDate: item.dueDate,
            overdue: item.overdue,
          }),
        ),
      })),
      listProjectInspections(context, projectId, { vendorId, limit: LIST_LIMIT }).then((page) => ({
        hasMore: page.hasMore,
        items: page.items
          .filter((item) => matchesAgreement(item.subcontractAgreementId, item.vendor?.id ?? null, agreementId, vendorId))
          .map(
          (item): Contractor360Inspection => ({
            id: item.id,
            referenceNo: item.referenceNo,
            title: item.title,
            status: item.status,
            outcome: item.outcome,
            scheduledFor: item.scheduledFor,
          }),
        ),
      })),
      listProjectDefects(context, projectId, { vendorId, limit: LIST_LIMIT }).then((page) => ({
        hasMore: page.hasMore,
        items: page.items
          .filter((item) => matchesAgreement(item.subcontractAgreementId, item.vendor?.id ?? null, agreementId, vendorId))
          .map(
          (item): Contractor360Defect => ({
            id: item.id,
            referenceNo: item.referenceNo,
            title: item.title,
            status: item.status,
            severity: item.severity,
            dueDate: item.dueDate,
            overdue: item.overdue,
          }),
        ),
      })),
      held.has(C.PAYMENT_VIEW)
        ? getAgreementPayments(context, projectId, agreementId).then(
            (status): Contractor360Payments => ({
              currency: status.currency,
              hasBases: status.bases.length > 0,
              certified: status.totals.certified,
              payableNet: status.totals.payableNet,
              paid: status.totals.paid,
              retentionHeld: status.retention.held,
              holdCount: status.eligibility.holds.length,
              eligible: status.eligibility.eligible,
            }),
          )
        : Promise.resolve(null),
      getProjectComplianceOverview(context, projectId).then((overview) => {
        const agreement = overview.agreements.find((item) => item.agreementId === agreementId);
        return {
          requirements: (agreement?.requirements ?? []).map(
            (requirement): Contractor360Requirement => ({
              id: requirement.id,
              title: requirement.title,
              kind: requirement.kind,
              status: requirement.evaluation.status,
            }),
          ),
          blockingCount: agreement?.blockingCount ?? 0,
          pendingReviewCount: agreement?.pendingReviewCount ?? 0,
        };
      }),
    ]);

  return {
    organizationId: context.organizationId,
    agreement: workspace.agreement,
    lines: workspace.lines,
    financial: workspace.financial,
    changes: changeList.changes,
    events,
    tasks,
    claims,
    documents,
    rfis,
    submittals,
    inspections,
    defects,
    payments,
    compliance,
  };
}

async function loadEvents(
  context: OrgContext,
  projectId: string,
  agreementId: string,
  vendorId: string,
): Promise<Contractor360Event[]> {
  const [openPage, closedPage] = await Promise.all([
    listProjectCoordinationEvents(context, projectId, { scope: 'open', limit: 100 }),
    listProjectCoordinationEvents(context, projectId, { scope: 'closed', limit: 40 }),
  ]);
  const events = [...openPage.items, ...closedPage.items];
  const participants = await listParticipants(
    context.db,
    context.organizationId,
    events.map((event) => event.id),
  );
  const matched = new Set(
    participants
      .filter(
        (participant) =>
          participant.kind === 'contractor' &&
          matchesAgreement(participant.subcontractAgreementId, participant.vendorId, agreementId, vendorId),
      )
      .map((participant) => participant.eventId),
  );
  return events
    .filter((event) => matched.has(event.id))
    .map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      readiness: event.readiness,
      startsAt: event.startsAt.toISOString(),
      locationName: event.locationName,
    }));
}

async function loadSharedDocuments(
  context: OrgContext,
  projectId: string,
  agreementId: string,
  vendorId: string,
): Promise<{ shares: Contractor360Share[]; plans: Contractor360Plan[] }> {
  const [shares, register] = await Promise.all([
    listDocumentSharesForProject(context.db, { organizationId: context.organizationId, projectId }),
    listProjectDrawings(context, { projectId, status: 'active' }),
  ]);
  const distributionDrawings = register.drawings.filter(
    (drawing) => drawing.contractorVisibility === 'distribution' && drawing.currentRevision,
  );
  const distribution = await Promise.all(
    distributionDrawings.map(async (drawing) => ({
      id: drawing.id,
      entries: await listDistribution(context.db, context.organizationId, drawing.id),
    })),
  );
  const distributedIds = new Set(
    distribution
      .filter(({ entries }) =>
        entries.some((entry) => matchesAgreement(entry.agreementId, entry.vendorId, agreementId, vendorId)),
      )
      .map((entry) => entry.id),
  );

  return {
    shares: shares
      .filter((share) => shareMatches(share, agreementId, vendorId))
      .map((share) => ({
        id: share.id,
        title: share.title,
        fileName: share.fileName,
        sharedAt: share.sharedAt,
      })),
    plans: register.drawings.flatMap((drawing) => {
      if (!drawing.currentRevision) return [];
      const shared =
        drawing.contractorVisibility === 'all_contractors' || distributedIds.has(drawing.id);
      if (!shared) return [];
      return [
        {
          id: drawing.id,
          drawingNumber: drawing.drawingNumber,
          title: drawing.title,
          revisionLabel: drawing.currentRevision.revisionLabel,
        },
      ];
    }),
  };
}
