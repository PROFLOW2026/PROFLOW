/**
 * Bounded project-entity search. Each query is organization-scoped, limited,
 * and restricted to the project ids the caller already authorized.
 * Contractor money is a separate lookup so operational queries never select it.
 */

import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { numeric, pgView, text, uuid } from 'drizzle-orm/pg-core';
import {
  coordinationEvents,
  defects,
  drawings,
  meetingRecords,
  projectLocations,
  projects,
  rfis,
  siteInstructions,
  siteMeetingDetails,
  subcontractAgreements,
  subcontractClaims,
  submittals,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { ilikeContainsPattern } from '../domain/search-scope';
import type {
  ClaimSearchRow,
  ContractorSearchRow,
  CoordinationSearchRow,
  DrawingSearchRow,
  InstructionSearchRow,
  LocationSearchRow,
  MeetingSearchRow,
  NumberedSearchRow,
} from '../domain/project-hit-map';

function trimmed(query: string): string {
  return query.trim();
}

/** `null` project ids = no project filter. Empty = caller must not query. */
function blocked(projectIds: readonly string[] | null): boolean {
  return projectIds !== null && projectIds.length === 0;
}

function projectScope(projectIds: readonly string[] | null, column: Parameters<typeof eq>[0]) {
  if (projectIds === null) return undefined;
  return inArray(column as typeof projects.id, [...projectIds]);
}

/** 0168 revoked SELECT on original_amount. Header money is read only from this view. */
const subcontractAgreementMoneySecure = pgView('subcontract_agreement_money_secure', {
  id: uuid('id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  currency: text('currency').notNull(),
  originalAmount: numeric('original_amount', { precision: 18, scale: 6 }).notNull(),
}).existing();

export async function searchProjectContractors(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<Omit<ContractorSearchRow, 'amount' | 'currency'>[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const scope = projectScope(projectIds, subcontractAgreements.projectId);
  const rows = await db
    .select({
      agreementId: subcontractAgreements.id,
      projectId: subcontractAgreements.projectId,
      vendorName: vendors.name,
      agreementTitle: subcontractAgreements.title,
      status: subcontractAgreements.status,
      projectName: projects.name,
    })
    .from(subcontractAgreements)
    .innerJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .innerJoin(
      projects,
      and(eq(projects.id, subcontractAgreements.projectId), eq(projects.organizationId, subcontractAgreements.organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
        scope,
        or(
          ilike(vendors.name, term),
          ilike(subcontractAgreements.title, term),
          ilike(subcontractAgreements.subcontractNumber, term),
        ),
      ),
    )
    .orderBy(desc(subcontractAgreements.updatedAt))
    .limit(limit);

  return rows;
}

/** Amounts for agreements the caller already marked as financially visible. */
export async function searchContractorAmounts(
  db: DbExecutor,
  organizationId: string,
  agreementIds: readonly string[],
  financialProjectIds: readonly string[] | null,
): Promise<Map<string, { amount: string; currency: string }>> {
  const amounts = new Map<string, { amount: string; currency: string }>();
  if (agreementIds.length === 0 || blocked(financialProjectIds)) return amounts;
  const scope = projectScope(financialProjectIds, subcontractAgreementMoneySecure.projectId);
  const rows = await db
    .select({
      id: subcontractAgreementMoneySecure.id,
      amount: subcontractAgreementMoneySecure.originalAmount,
      currency: subcontractAgreementMoneySecure.currency,
    })
    .from(subcontractAgreementMoneySecure)
    .where(
      and(
        eq(subcontractAgreementMoneySecure.organizationId, organizationId),
        inArray(subcontractAgreementMoneySecure.id, [...agreementIds]),
        scope,
      ),
    )
    .limit(agreementIds.length);
  for (const row of rows) amounts.set(row.id, { amount: row.amount, currency: row.currency });
  return amounts;
}

export async function searchCoordinationEvents(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<CoordinationSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const rows = await db
    .select({
      id: coordinationEvents.id,
      projectId: coordinationEvents.projectId,
      title: coordinationEvents.title,
      status: coordinationEvents.status,
      projectName: projects.name,
      startsAt: coordinationEvents.startsAt,
    })
    .from(coordinationEvents)
    .innerJoin(
      projects,
      and(eq(projects.id, coordinationEvents.projectId), eq(projects.organizationId, coordinationEvents.organizationId)),
    )
    .where(
      and(
        eq(coordinationEvents.organizationId, organizationId),
        projectScope(projectIds, coordinationEvents.projectId),
        ilike(coordinationEvents.title, term),
      ),
    )
    .orderBy(desc(coordinationEvents.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    projectName: row.projectName,
    startsOn: row.startsAt.toISOString().slice(0, 10),
  }));
}

export async function searchProjectClaims(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<Omit<ClaimSearchRow, 'amount' | 'currency'>[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const numeric = /^\d+$/.test(exact) ? Number(exact) : null;
  const rows = await db
    .select({
      id: subcontractClaims.id,
      projectId: subcontractClaims.projectId,
      claimNumber: subcontractClaims.claimNumber,
      title: subcontractClaims.title,
      status: subcontractClaims.status,
      projectName: projects.name,
      periodStart: subcontractClaims.periodStart,
    })
    .from(subcontractClaims)
    .innerJoin(
      projects,
      and(eq(projects.id, subcontractClaims.projectId), eq(projects.organizationId, subcontractClaims.organizationId)),
    )
    .where(
      and(
        eq(subcontractClaims.organizationId, organizationId),
        projectScope(projectIds, subcontractClaims.projectId),
        or(
          ilike(subcontractClaims.title, term),
          numeric == null ? sql`false` : eq(subcontractClaims.claimNumber, numeric),
        ),
      ),
    )
    .orderBy(desc(subcontractClaims.updatedAt))
    .limit(limit);
  return rows;
}

export async function searchProjectRfis(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<NumberedSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const rows = await db
    .select({
      id: rfis.id,
      projectId: rfis.projectId,
      title: rfis.subject,
      number: rfis.number,
      status: rfis.status,
      projectName: projects.name,
    })
    .from(rfis)
    .innerJoin(projects, and(eq(projects.id, rfis.projectId), eq(projects.organizationId, rfis.organizationId)))
    .where(
      and(
        eq(rfis.organizationId, organizationId),
        isNull(rfis.archivedAt),
        projectScope(projectIds, rfis.projectId),
        or(ilike(rfis.subject, term), sql`(${rfis.number})::text ILIKE ${term}`),
      ),
    )
    .orderBy(desc(rfis.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    numberLabel: `RFI-${row.number}`,
    status: row.status,
    projectName: row.projectName,
  }));
}

export async function searchProjectSubmittals(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<NumberedSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const rows = await db
    .select({
      id: submittals.id,
      projectId: submittals.projectId,
      title: submittals.title,
      number: submittals.number,
      status: submittals.status,
      projectName: projects.name,
    })
    .from(submittals)
    .innerJoin(
      projects,
      and(eq(projects.id, submittals.projectId), eq(projects.organizationId, submittals.organizationId)),
    )
    .where(
      and(
        eq(submittals.organizationId, organizationId),
        isNull(submittals.archivedAt),
        projectScope(projectIds, submittals.projectId),
        or(ilike(submittals.title, term), sql`(${submittals.number})::text ILIKE ${term}`),
      ),
    )
    .orderBy(desc(submittals.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    numberLabel: `SUB-${row.number}`,
    status: row.status,
    projectName: row.projectName,
  }));
}

export async function searchProjectDefects(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<NumberedSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const rows = await db
    .select({
      id: defects.id,
      projectId: defects.projectId,
      title: defects.title,
      referenceNo: defects.referenceNo,
      status: defects.status,
      projectName: projects.name,
    })
    .from(defects)
    .innerJoin(projects, and(eq(projects.id, defects.projectId), eq(projects.organizationId, defects.organizationId)))
    .where(
      and(
        eq(defects.organizationId, organizationId),
        isNull(defects.archivedAt),
        projectScope(projectIds, defects.projectId),
        or(ilike(defects.title, term), sql`(${defects.referenceNo})::text ILIKE ${term}`),
      ),
    )
    .orderBy(desc(defects.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    numberLabel: `#${row.referenceNo}`,
    status: row.status,
    projectName: row.projectName,
  }));
}

export async function searchProjectDrawings(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<DrawingSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  return db
    .select({
      id: drawings.id,
      projectId: drawings.projectId,
      title: drawings.title,
      drawingNumber: drawings.drawingNumber,
      status: drawings.status,
      projectName: projects.name,
    })
    .from(drawings)
    .innerJoin(
      projects,
      and(eq(projects.id, drawings.projectId), eq(projects.organizationId, drawings.organizationId)),
    )
    .where(
      and(
        eq(drawings.organizationId, organizationId),
        isNull(drawings.archivedAt),
        projectScope(projectIds, drawings.projectId),
        or(ilike(drawings.title, term), ilike(drawings.drawingNumber, term)),
      ),
    )
    .orderBy(desc(drawings.updatedAt))
    .limit(limit);
}

export async function searchProjectLocations(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<LocationSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  return db
    .select({
      id: projectLocations.id,
      projectId: projectLocations.projectId,
      name: projectLocations.name,
      code: projectLocations.code,
      projectName: projects.name,
    })
    .from(projectLocations)
    .innerJoin(
      projects,
      and(eq(projects.id, projectLocations.projectId), eq(projects.organizationId, projectLocations.organizationId)),
    )
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        isNull(projectLocations.archivedAt),
        projectScope(projectIds, projectLocations.projectId),
        or(ilike(projectLocations.name, term), ilike(projectLocations.code, term)),
      ),
    )
    .orderBy(desc(projectLocations.updatedAt))
    .limit(limit);
}

export async function searchProjectMeetings(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<MeetingSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const rows = await db
    .select({
      id: meetingRecords.id,
      projectId: siteMeetingDetails.projectId,
      title: meetingRecords.title,
      status: siteMeetingDetails.status,
      projectName: projects.name,
      scheduledAt: meetingRecords.scheduledAt,
    })
    .from(siteMeetingDetails)
    .innerJoin(
      meetingRecords,
      and(
        eq(meetingRecords.id, siteMeetingDetails.meetingId),
        eq(meetingRecords.organizationId, siteMeetingDetails.organizationId),
      ),
    )
    .innerJoin(
      projects,
      and(eq(projects.id, siteMeetingDetails.projectId), eq(projects.organizationId, siteMeetingDetails.organizationId)),
    )
    .where(
      and(
        eq(siteMeetingDetails.organizationId, organizationId),
        projectScope(projectIds, siteMeetingDetails.projectId),
        ilike(meetingRecords.title, term),
      ),
    )
    .orderBy(desc(meetingRecords.scheduledAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    projectName: row.projectName,
    scheduledOn: row.scheduledAt.toISOString().slice(0, 10),
  }));
}

export async function searchProjectInstructions(
  db: DbExecutor,
  organizationId: string,
  query: string,
  projectIds: readonly string[] | null,
  limit: number,
): Promise<InstructionSearchRow[]> {
  const exact = trimmed(query);
  if (!exact || blocked(projectIds)) return [];
  const term = ilikeContainsPattern(exact);
  const rows = await db
    .select({
      id: siteInstructions.id,
      projectId: siteInstructions.projectId,
      title: siteInstructions.title,
      instructionNumber: siteInstructions.instructionNumber,
      status: siteInstructions.status,
      projectName: projects.name,
    })
    .from(siteInstructions)
    .innerJoin(
      projects,
      and(eq(projects.id, siteInstructions.projectId), eq(projects.organizationId, siteInstructions.organizationId)),
    )
    .where(
      and(
        eq(siteInstructions.organizationId, organizationId),
        projectScope(projectIds, siteInstructions.projectId),
        or(ilike(siteInstructions.title, term), sql`(${siteInstructions.instructionNumber})::text ILIKE ${term}`),
      ),
    )
    .orderBy(desc(siteInstructions.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    numberLabel: `#${row.instructionNumber}`,
    status: row.status,
    projectName: row.projectName,
  }));
}
