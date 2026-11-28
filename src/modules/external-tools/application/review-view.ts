import { computeBoq } from '@/modules/electrical-takeoff/domain/boq-engine';
import {
  analysisViewSchema,
  takeoffEditSchema,
  type AnalysisView,
  type TakeoffEdit,
  type WorkerDetection,
  type WorkerLegendEntry,
  type WorkerSheet,
  type WorkerWarning,
} from '@/modules/electrical-takeoff/domain/contracts';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { DEFAULT_RULE_SET } from '@/modules/electrical-takeoff/domain/measurement';
import { planReviewConfirmed } from '@/modules/electrical-takeoff/domain/plan-review';

export interface ExternalReviewSource {
  sessionId: string;
  revision: number;
  reviewedAt: Date | null;
  updatedAt: Date;
  files: readonly { id: string; name: string; kind: 'dwg' | 'pdf' | 'dxf'; size: number; sha256: string | null }[];
  sheets: readonly WorkerSheet[];
  detections: readonly WorkerDetection[];
  legend: readonly WorkerLegendEntry[];
  warnings: readonly WorkerWarning[];
  edits: readonly TakeoffEdit[];
  canEdit: boolean;
}

/** The existing review model. External sessions do not create a project analysis row. */
export function externalAnalysisView(input: ExternalReviewSource): AnalysisView {
  const edits = input.edits.flatMap((edit) => {
    const parsed = takeoffEditSchema.safeParse(edit);
    return parsed.success ? [parsed.data] : [];
  });
  const detections = applyEdits(input.detections, edits);
  const sheets = input.sheets.map((sheet) => ({
    ...sheet,
    previewUrl: null,
    floorLabel: sheet.floorHint ?? null,
  }));
  const boq = computeBoq({
    detections,
    workerDetections: input.detections,
    sheets,
    areas: [],
    catalog: [],
    ruleSet: DEFAULT_RULE_SET,
    linear: [],
    state: input.reviewedAt ? 'approved' : 'draft',
  });
  return analysisViewSchema.parse({
    summary: {
      id: input.sessionId,
      name: input.files[0]?.name ?? 'כלים מקצועיים',
      status: input.reviewedAt ? 'approved' : 'in_review',
      plannerKey: 'external',
      revision: input.revision,
      updatedAtIso: input.updatedAt.toISOString(),
      fileCount: input.files.length,
      approvedAtIso: input.reviewedAt?.toISOString() ?? null,
      persistenceMode: 'ephemeral',
    },
    files: input.files.map((file) => ({
      id: file.id,
      name: file.name,
      kind: file.kind,
      sizeBytes: file.size,
      uploadedAtIso: input.updatedAt.toISOString(),
      sha256: file.sha256,
    })),
    sheets,
    detections,
    areas: [],
    boq,
    catalog: [],
    ruleSet: DEFAULT_RULE_SET,
    lastJob: null,
    workerWarnings: input.warnings,
    workerStats: {},
    legend: input.legend,
    permissions: {
      canRun: input.canEdit,
      canEdit: input.canEdit,
      canApprove: input.canEdit && !input.reviewedAt,
      canManageLibrary: false,
      canReopen: Boolean(input.reviewedAt),
      canPickFromProjectCloud: false,
      canPurgeEphemeral: input.canEdit,
    },
    appliedEdits: edits,
    planReviewConfirmed: planReviewConfirmed(edits),
  });
}
