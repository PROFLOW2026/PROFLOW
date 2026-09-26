import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isMonthClosed } from '@/modules/month-close';
import type { ProjectFinancials } from '../domain/types';
import {
  decideMarginSnapshotWrite,
  marginSnapshotFromComposed,
  marginYearMonthKey,
  type MarginTrendPoint,
} from '../domain/margin-trend';
import {
  listProjectMarginSnapshots,
  upsertProjectMarginSnapshot,
} from '../data/margin-snapshots.repository';

function errorTexts(error: unknown): string[] {
  const texts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current !== 'object') {
      texts.push(String(current));
      break;
    }
    if ('code' in current && (current as { code?: unknown }).code) {
      texts.push(String((current as { code?: unknown }).code));
    }
    if (current instanceof Error) {
      texts.push(current.message);
      current = current.cause;
      continue;
    }
    if ('message' in current && (current as { message?: unknown }).message) {
      texts.push(String((current as { message?: unknown }).message));
    }
    current = 'cause' in current ? (current as { cause?: unknown }).cause : null;
  }
  return texts;
}

/** Migration 0130 is not applied yet — the project view must still render. */
export function isMissingMarginSnapshotSchema(error: unknown): boolean {
  return errorTexts(error).some(
    (text) =>
      text === '42P01' ||
      text === '42703' ||
      /relation .+ does not exist/i.test(text) ||
      /column .+ does not exist/i.test(text),
  );
}

/**
 * Refresh the current calendar month from an already-composed project view,
 * then return the stored trend. Closed months and older months are not written.
 * A missing `project_margin_snapshots` relation or column returns an empty trend.
 */
export async function captureCurrentMarginSnapshot(
  context: OrgContext,
  financials: ProjectFinancials,
): Promise<readonly MarginTrendPoint[]> {
  if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];

  try {
    const yearMonth = marginYearMonthKey(context.organization.timezone);
    const closed = await isMonthClosed(context, yearMonth);
    const decision = decideMarginSnapshotWrite({
      targetYearMonth: yearMonth,
      currentYearMonth: yearMonth,
      periodStatus: closed ? 'closed' : null,
    });
    const amounts = marginSnapshotFromComposed(financials);
    if (decision.write && amounts) {
      await upsertProjectMarginSnapshot(context.db, {
        organizationId: context.organizationId,
        projectId: financials.projectId,
        yearMonth: decision.yearMonth,
        ...amounts,
      });
    }
    return await listProjectMarginSnapshots(
      context.db,
      context.organizationId,
      financials.projectId,
    );
  } catch (error) {
    if (isMissingMarginSnapshotSchema(error)) return [];
    throw error;
  }
}
