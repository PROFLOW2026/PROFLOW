import { exportTakeoffBoqXlsx } from '@/modules/electrical-takeoff/application/export-xlsx';
import type { Boq } from '@/modules/electrical-takeoff/domain/contracts';

/** Uses the existing workbook. The draft banner follows the temporary approval, not a project approval row. */
export async function exportExternalSessionXlsx(input: {
  reviewedAt: Date | null;
  boq: Boq;
}): Promise<Buffer> {
  return exportTakeoffBoqXlsx({
    title: 'כלים מקצועיים',
    boq: { ...input.boq, state: input.reviewedAt ? 'approved' : 'draft' },
    catalog: [],
    detections: [],
    sheets: [],
    approvedAtIso: input.reviewedAt?.toISOString() ?? null,
  });
}
