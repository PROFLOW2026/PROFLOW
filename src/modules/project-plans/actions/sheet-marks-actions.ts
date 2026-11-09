'use server';

import {
  createDrawingSheetMark,
  deleteDrawingSheetMark,
  listDrawingSheetMarks,
  listSheetMarkBoqPickerLines,
  type SheetMarkBoqPickerLine,
  type SheetMarkView,
} from '@/modules/project-plans/application/sheet-marks';
import { withOrgContext } from '@/shared/auth/session';
import { plansActionError, type PlansActionResult } from './action-result';

export async function listSheetMarkBoqPickerLinesAction(input: {
  readonly projectId: string;
}): Promise<PlansActionResult<readonly SheetMarkBoqPickerLine[]>> {
  try {
    const data = await withOrgContext((context) => listSheetMarkBoqPickerLines(context, input.projectId));
    return { ok: true, data };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function listDrawingSheetMarksAction(input: {
  readonly revisionId: string;
  readonly pageIndex?: number;
}): Promise<PlansActionResult<readonly SheetMarkView[]>> {
  try {
    const data = await withOrgContext((context) => listDrawingSheetMarks(context, input));
    return { ok: true, data };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function createDrawingSheetMarkAction(input: {
  readonly projectId: string;
  readonly drawingRevisionId: string;
  readonly pageIndex: number;
  readonly kind: 'pin' | 'note' | 'measure';
  readonly geometry: Record<string, unknown>;
  readonly note?: string;
  readonly linkedEntityType?: 'boq_node';
  readonly linkedEntityId?: string;
}): Promise<PlansActionResult<{ markId: string }>> {
  try {
    const data = await withOrgContext((context) =>
      createDrawingSheetMark(context, {
        projectId: input.projectId,
        drawingRevisionId: input.drawingRevisionId,
        pageIndex: input.pageIndex,
        kind: input.kind,
        geometry: input.geometry as never,
        note: input.note,
        linkedEntityType: input.linkedEntityType,
        linkedEntityId: input.linkedEntityId,
      }),
    );
    return { ok: true, data };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function deleteDrawingSheetMarkAction(input: {
  readonly projectId: string;
  readonly markId: string;
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) => deleteDrawingSheetMark(context, input));
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}
