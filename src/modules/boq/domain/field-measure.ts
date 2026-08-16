import { parseQuantity, remainingQuantity } from './amounts';
import { FIELD_MEASURE_FORBIDDEN_MONEY_KEYS } from './mask-money';

export type FieldMeasureNodeInput = {
  readonly id: string;
  readonly parentId: string | null;
  readonly nodeKind: string;
  readonly itemCode: string | null;
  readonly description: string;
  readonly unit: string | null;
  readonly status: string;
  readonly sortOrder: number;
  readonly currentQuantity: string;
  readonly openingApprovedQuantity: string;
  readonly openingBilledQuantity: string;
};

export type FieldMeasureProgressLineInput = {
  readonly boqNodeId: string;
  readonly measuredQuantity: string;
  readonly approvedQuantity: string;
};

export type FieldMeasureProgressBatchInput = {
  readonly status: string;
  readonly lines: readonly FieldMeasureProgressLineInput[];
};

/** Quantity-only item for the worker field flow. No prices, profit, or rates. */
export type FieldMeasureItemDto = {
  readonly id: string;
  readonly itemCode: string | null;
  readonly description: string;
  readonly unit: string | null;
  readonly chapterLabel: string | null;
  readonly currentQuantity: string;
  readonly performedQuantity: string;
  readonly remainingQuantity: string;
  readonly pendingMeasuredQuantity: string;
};

function openingFloor(node: FieldMeasureNodeInput) {
  const approved = parseQuantity(node.openingApprovedQuantity || '0');
  const billed = parseQuantity(node.openingBilledQuantity || '0');
  return approved.greaterThan(billed) ? approved : billed;
}

/**
 * Builds the worker-first measure DTO.
 * Money fields on the source nodes are ignored - never copied onto the result.
 */
export function toFieldMeasureItems(
  nodes: readonly FieldMeasureNodeInput[],
  batches: readonly FieldMeasureProgressBatchInput[],
): FieldMeasureItemDto[] {
  const chapterLabelById = new Map<string, string>();
  for (const node of nodes) {
    if (node.nodeKind === 'chapter' && node.status === 'active') {
      chapterLabelById.set(node.id, node.description);
    }
  }

  const approvedByNode = new Map<string, ReturnType<typeof parseQuantity>>();
  const pendingByNode = new Map<string, ReturnType<typeof parseQuantity>>();

  for (const batch of batches) {
    for (const line of batch.lines) {
      if (batch.status === 'approved' || batch.status === 'billed') {
        const current = approvedByNode.get(line.boqNodeId) ?? parseQuantity('0');
        approvedByNode.set(line.boqNodeId, current.plus(parseQuantity(line.approvedQuantity || '0')));
      } else if (batch.status === 'draft') {
        const current = pendingByNode.get(line.boqNodeId) ?? parseQuantity('0');
        pendingByNode.set(line.boqNodeId, current.plus(parseQuantity(line.measuredQuantity || '0')));
      }
    }
  }

  const items = nodes
    .filter((node) => node.nodeKind === 'item' && node.status === 'active')
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.itemCode ?? '').localeCompare(b.itemCode ?? ''));

  return items.map((node) => {
    const performed = openingFloor(node).plus(approvedByNode.get(node.id) ?? parseQuantity('0'));
    const remainingRaw = parseQuantity(
      remainingQuantity({
        currentQuantity: node.currentQuantity || '0',
        cumulativeApproved: performed.toFixed(),
      }),
    );
    const dto: FieldMeasureItemDto = {
      id: node.id,
      itemCode: node.itemCode,
      description: node.description,
      unit: node.unit,
      chapterLabel: node.parentId ? (chapterLabelById.get(node.parentId) ?? null) : null,
      currentQuantity: parseQuantity(node.currentQuantity || '0').toFixed(),
      performedQuantity: performed.toFixed(),
      remainingQuantity: remainingRaw.isNegative() ? '0' : remainingRaw.toFixed(),
      pendingMeasuredQuantity: (pendingByNode.get(node.id) ?? parseQuantity('0')).toFixed(),
    };
    return dto;
  });
}

export function fieldMeasureDtoHasMoney(dto: object): boolean {
  return FIELD_MEASURE_FORBIDDEN_MONEY_KEYS.some((key) => key in dto);
}
