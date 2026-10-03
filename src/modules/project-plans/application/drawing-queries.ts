import { z } from 'zod';
import type { ProjectFileDeps, OpenedFile } from '@/modules/evidence';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { listProjectAgreements, listProjectPrincipals, listShareableProjectDocuments, type ShareableDocument } from '../data/audience.repository';
import {
  findDrawing,
  findRevision,
  listDistribution,
  listDrawingsForProject,
  listRevisionAcknowledgements,
  listRevisions,
  toRevisionView,
  type DrawingRow,
} from '../data/plans.repository';
import { suggestNextRevisionLabel } from '../domain/revisions';
import {
  DRAWING_DISCIPLINES,
  type AcknowledgementView,
  type ContractorAudienceOptions,
  type DistributionEntryView,
  type DrawingListItem,
  type DrawingRevisionView,
} from '../domain/types';
import { parseOrThrow, uuid } from './shared';

const listSchema = z.object({
  projectId: uuid,
  discipline: z.enum(DRAWING_DISCIPLINES).nullish(),
  search: z.string().max(100).nullish(),
  status: z.enum(['active', 'archived']).default('active'),
});

export interface DrawingsRegister {
  readonly drawings: readonly DrawingListItem[];
  readonly canManage: boolean;
}

export async function listProjectDrawings(
  context: OrgContext,
  raw: z.input<typeof listSchema>,
): Promise<DrawingsRegister> {
  const input = parseOrThrow(listSchema, raw);
  const capabilities = await loadProjectCapabilities(context, input.projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_VIEW)) {
    await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  }
  const drawings = await listDrawingsForProject(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    discipline: input.discipline ?? null,
    search: input.search ?? null,
    status: input.status,
  });
  return { drawings, canManage: capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_SHARE) };
}

export interface DrawingRevisionWithAcks extends DrawingRevisionView {
  readonly acknowledgements: readonly AcknowledgementView[];
}

export interface DrawingDetail {
  readonly drawing: {
    readonly id: string;
    readonly projectId: string;
    readonly drawingNumber: string;
    readonly title: string;
    readonly discipline: DrawingRow['discipline'];
    readonly locationId: string | null;
    readonly contractorVisibility: DrawingRow['contractorVisibility'];
    readonly status: DrawingRow['status'];
    readonly currentRevisionId: string | null;
  };
  readonly revisions: readonly DrawingRevisionWithAcks[];
  readonly distribution: readonly DistributionEntryView[];
  readonly canManage: boolean;
  readonly suggestedNextLabel: string;
  /** Only for managers: who the drawing can be distributed to, and project files usable as revisions. */
  readonly audienceOptions: ContractorAudienceOptions | null;
  readonly reusableDocuments: readonly ShareableDocument[];
}

export async function getDrawingDetail(
  context: OrgContext,
  drawingId: string,
  deps: Pick<ProjectFileDeps, 'elevated'>,
): Promise<DrawingDetail> {
  const drawing = await findDrawing(context.db, context.organizationId, uuid.parse(drawingId));
  if (!drawing) throw new NotFoundError('Drawing');
  const capabilities = await loadProjectCapabilities(context, drawing.projectId);
  if (!capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_VIEW)) {
    await assertProjectCapability(context, drawing.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  }
  const canManage = capabilities.has(PROJECT_CAPABILITIES.DOCUMENTS_SHARE);
  const revisions = await listRevisions(context.db, context.organizationId, drawing.id);
  const acks = await listRevisionAcknowledgements(
    context.db,
    context.organizationId,
    revisions.map((revision) => revision.id),
  );
  const distribution = await listDistribution(context.db, context.organizationId, drawing.id);
  const extras = canManage
    ? await deps.elevated(async (db) => ({
        audienceOptions: {
          agreements: await listProjectAgreements(db, context.organizationId, drawing.projectId),
          principals: await listProjectPrincipals(db, context.organizationId, drawing.projectId),
        },
        reusableDocuments: (await listShareableProjectDocuments(db, context.organizationId, drawing.projectId)).filter(
          (document) => document.mimeType === 'application/pdf' || document.mimeType.startsWith('image/'),
        ),
      }))
    : { audienceOptions: null, reusableDocuments: [] };
  const latestLabel = revisions[0]?.revisionLabel ?? null;
  return {
    drawing: {
      id: drawing.id,
      projectId: drawing.projectId,
      drawingNumber: drawing.drawingNumber,
      title: drawing.title,
      discipline: drawing.discipline,
      locationId: drawing.locationId ?? null,
      contractorVisibility: drawing.contractorVisibility,
      status: drawing.status,
      currentRevisionId: drawing.currentRevisionId ?? null,
    },
    revisions: revisions.map((revision) => ({ ...toRevisionView(revision), acknowledgements: acks.get(revision.id) ?? [] })),
    distribution,
    canManage,
    suggestedNextLabel: latestLabel ? suggestNextRevisionLabel(latestLabel) : '0',
    audienceOptions: extras.audienceOptions,
    reusableDocuments: extras.reusableDocuments,
  };
}

export async function openInternalRevisionFile(
  context: OrgContext,
  input: { readonly revisionId: string; readonly rangeHeader?: string | null },
  deps: Pick<ProjectFileDeps, 'store'>,
): Promise<OpenedFile & { fileName: string }> {
  const revision = await findRevision(context.db, context.organizationId, uuid.parse(input.revisionId));
  if (!revision || !revision.fileReady) throw new NotFoundError('Revision');
  await assertProjectCapability(context, revision.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  const opened = await deps.store.open({
    organizationId: revision.organizationId,
    documentId: revision.documentId,
    rangeHeader: input.rangeHeader,
  });
  return { ...opened, mimeType: revision.mimeType, fileName: revision.fileName };
}
