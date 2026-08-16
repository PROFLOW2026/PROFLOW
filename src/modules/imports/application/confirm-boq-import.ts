/**
 * Confirm BOQ CSV import via public createProjectBoq / upsertBoqNode APIs.
 * Hierarchy: chapter → optional subchapter → item. Draft BOQ only.
 */

import Decimal from 'decimal.js';
import {
  createProjectBoq,
  findBoqById,
  listBoqNodes,
  listBoqsForProject,
  upsertBoqNode,
} from '@/modules/boq';
import type { OrgContext } from '@/shared/auth/context';
import { AppError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isBoqImportSkipRow, parseImportDecimal } from '../domain/boq-import-parse';
import type { ImportRowResult, MappedImportRow } from '../domain/types';

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

function normKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function errorMessage(error: unknown, locale: string): string {
  const he = locale.startsWith('he');
  const map = {
    notFound: he ? 'הפריט לא נמצא.' : 'Item was not found.',
    draftOnly: he ? 'ניתן לערוך רק טיוטת כתב כמויות.' : 'Only a draft BOQ can be edited.',
    changeOrderInvalid: he
      ? 'הזמנת השינוי לא נמצאה או אינה שייכת לפרויקט.'
      : 'Change order was not found or does not belong to this project.',
    generic: he
      ? 'לא ניתן להשלים את הפעולה. בדקו את הערכים ונסו שוב.'
      : 'Could not complete that BOQ action. Check the values and try again.',
  } as const;

  if (error instanceof NotFoundError) return map.notFound;
  if (error instanceof ValidationError) {
    const first = error.issues[0]?.message ?? error.message;
    if (/draft/i.test(first)) return map.draftOnly;
    if (/change order|project/i.test(first)) return map.changeOrderInvalid;
    if (/not found/i.test(first)) return map.notFound;
    return map.generic;
  }
  if (error instanceof AppError) {
    if (/draft/i.test(error.message)) return map.draftOnly;
    if (/not found/i.test(error.message)) return map.notFound;
    return map.generic;
  }
  if (error instanceof Error && /draft/i.test(error.message)) return map.draftOnly;
  return map.generic;
}

async function resolveDraftBoqId(
  context: OrgContext,
  projectId: string,
  boqId?: string,
): Promise<string> {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);

  if (boqId) {
    const existing = await findBoqById(context.db, context.organizationId, boqId);
    if (!existing) throw new NotFoundError('BOQ');
    if (existing.projectId !== projectId) {
      throw new ValidationError([
        { path: 'boqId', message: 'boqId does not belong to the given project' },
      ]);
    }
    if (existing.status !== 'draft') {
      throw new ValidationError([
        { path: 'boqId', message: 'Only draft BOQ baselines can receive imports' },
      ]);
    }
    return existing.id;
  }

  const versions = await listBoqsForProject(context.db, context.organizationId, projectId);
  const draft = versions.find((row) => row.status === 'draft');
  if (draft) return draft.id;

  const created = await createProjectBoq(context, {
    projectId,
    title: 'Imported BOQ',
  });
  if (!created) throw new ValidationError([{ path: 'projectId', message: 'Failed to create BOQ' }]);
  return created.id;
}

async function loadChapterMaps(
  context: OrgContext,
  boqId: string,
): Promise<{
  chapters: Map<string, string>;
  subchapters: Map<string, string>;
  itemsByCode: Map<string, string>;
}> {
  const nodes = await listBoqNodes(context.db, context.organizationId, boqId);
  const chapters = new Map<string, string>();
  const subchapters = new Map<string, string>();
  const itemsByCode = new Map<string, string>();
  const idToNode = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    if (node.nodeKind === 'item' && node.itemCode) {
      itemsByCode.set(normKey(node.itemCode), node.id);
    }
  }

  for (const node of nodes) {
    if (node.nodeKind !== 'chapter') continue;
    const key = normKey(node.description);
    if (!node.parentId) {
      chapters.set(key, node.id);
    } else {
      const parent = idToNode.get(node.parentId);
      const parentKey = parent ? normKey(parent.description) : '';
      subchapters.set(`${parentKey}|${key}`, node.id);
    }
  }

  return { chapters, subchapters, itemsByCode };
}

async function ensureChapter(
  context: OrgContext,
  boqId: string,
  name: string,
  chapters: Map<string, string>,
  sortOrder: number,
): Promise<string> {
  const key = normKey(name);
  const existing = chapters.get(key);
  if (existing) return existing;

  const node = await upsertBoqNode(context, {
    boqId,
    nodeKind: 'chapter',
    description: name,
    quantity: '0',
    unitPrice: '0',
    sortOrder,
  });
  if (!node) throw new Error('Failed to create chapter');
  chapters.set(key, node.id);
  return node.id;
}

async function ensureSubchapter(
  context: OrgContext,
  boqId: string,
  chapterId: string,
  chapterName: string,
  name: string,
  subchapters: Map<string, string>,
  sortOrder: number,
): Promise<string> {
  const key = `${normKey(chapterName)}|${normKey(name)}`;
  const existing = subchapters.get(key);
  if (existing) return existing;

  const node = await upsertBoqNode(context, {
    boqId,
    parentId: chapterId,
    nodeKind: 'chapter',
    description: name,
    quantity: '0',
    unitPrice: '0',
    sortOrder,
  });
  if (!node) throw new Error('Failed to create subchapter');
  subchapters.set(key, node.id);
  return node.id;
}

function resolveQtyPrice(values: Readonly<Record<string, string>>): {
  quantity: string;
  unitPrice: string;
  pricingType: 'quantity_unit_price' | 'lump_sum';
} {
  const quantity = parseImportDecimal(values.quantity) ?? '0';
  const unitPriceParsed = parseImportDecimal(values.unitPrice);
  const amountParsed = parseImportDecimal(values.amount);

  if (unitPriceParsed !== null) {
    return { quantity, unitPrice: unitPriceParsed, pricingType: 'quantity_unit_price' };
  }
  if (amountParsed !== null && (quantity === '0' || quantity === '1')) {
    // Lump-sum style: amount as unit price with qty 1
    return { quantity: quantity === '0' ? '1' : quantity, unitPrice: amountParsed, pricingType: 'lump_sum' };
  }
  if (amountParsed !== null && quantity !== '0') {
    // Derive unit price from amount / qty when price missing - Decimal, never JS Number.
    const qtyDec = new Decimal(quantity);
    const amtDec = new Decimal(amountParsed);
    if (!qtyDec.isZero()) {
      const derived = amtDec.div(qtyDec).toFixed(6).replace(/\.?0+$/, '') || '0';
      return { quantity, unitPrice: derived, pricingType: 'quantity_unit_price' };
    }
  }
  return { quantity, unitPrice: '0', pricingType: 'quantity_unit_price' };
}

/**
 * Import selected BOQ rows into a draft project BOQ (create draft if needed).
 */
export async function confirmBoqItemsRows(
  context: OrgContext,
  rows: readonly MappedImportRow[],
  options: { projectId: string; boqId?: string },
): Promise<ImportRowResult[]> {
  const projectId = options.projectId.trim();
  if (!projectId) {
    throw new ValidationError([{ path: 'projectId', message: 'projectId is required for boq_items import' }]);
  }

  const boqId = await resolveDraftBoqId(context, projectId, options.boqId);
  const maps = await loadChapterMaps(context, boqId);
  const results: ImportRowResult[] = [];
  let sortCounter = 0;

  for (const row of rows) {
    if (isBoqImportSkipRow(row.values)) {
      results.push({ rowNumber: row.rowNumber, ok: true });
      continue;
    }

    try {
      sortCounter += 10;
      const chapterName = emptyToUndefined(row.values.chapter);
      const subchapterName = emptyToUndefined(row.values.subchapter);
      let parentId: string | null = null;

      if (chapterName) {
        const chapterId = await ensureChapter(
          context,
          boqId,
          chapterName,
          maps.chapters,
          sortCounter,
        );
        parentId = chapterId;
        if (subchapterName) {
          parentId = await ensureSubchapter(
            context,
            boqId,
            chapterId,
            chapterName,
            subchapterName,
            maps.subchapters,
            sortCounter + 1,
          );
        }
      }

      const { quantity, unitPrice, pricingType } = resolveQtyPrice(row.values);
      const itemCode = emptyToUndefined(row.values.itemCode) ?? null;
      const existingItemId =
        itemCode && maps.itemsByCode.has(normKey(itemCode))
          ? maps.itemsByCode.get(normKey(itemCode))
          : undefined;

      const node = await upsertBoqNode(context, {
        boqId,
        nodeId: existingItemId,
        parentId,
        nodeKind: 'item',
        itemCode,
        description: emptyToUndefined(row.values.description) ?? '',
        unit: emptyToUndefined(row.values.unit) ?? null,
        pricingType,
        quantity,
        unitPrice,
        sortOrder: sortCounter + 2,
      });

      if (node && itemCode) {
        maps.itemsByCode.set(normKey(itemCode), node.id);
      }

      results.push({
        rowNumber: row.rowNumber,
        ok: true,
        entityId: node?.id,
      });
    } catch (error) {
      results.push({
        rowNumber: row.rowNumber,
        ok: false,
        error: errorMessage(error, context.locale),
      });
    }
  }

  return results;
}
