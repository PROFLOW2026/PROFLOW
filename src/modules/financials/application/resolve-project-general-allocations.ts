/**
 * Resolve recognized Actual and future Forecast general allocations without stale rows.
 */

import type { OrgContext } from '@/shared/auth/context';
import {
  addMoney,
  fromNumericString,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  actualRecognitionThroughYearMonth,
  compareYearMonth,
} from '../domain/general-cost-actual-recognition';
import {
  sumGeneralAllocationsForProject,
  sumStoredGeneralAllocationsBeforeYearMonth,
} from '../data/general-cost-months.repository';
import {
  listFutureGeneralCostCandidateMonths,
  previewGeneralCostMonthAllocations,
  previewLineAmountForProject,
} from './preview-general-cost-month';

export interface ResolvedProjectGeneralAllocations {
  readonly recognizedActual: MoneyValue;
  readonly futureForecast: MoneyValue;
}

const resolvedByTx = new WeakMap<object, Map<string, Promise<ResolvedProjectGeneralAllocations>>>();

export async function resolveRecognizedGeneralAllocationForProject(
  context: OrgContext,
  projectId: string,
  currency: string,
): Promise<MoneyValue> {
  const resolved = await resolveProjectGeneralAllocations(context, projectId, currency);
  return resolved.recognizedActual;
}

export async function resolveFutureGeneralAllocationForecastForProject(
  context: OrgContext,
  projectId: string,
  currency: string,
): Promise<MoneyValue> {
  const resolved = await resolveProjectGeneralAllocations(context, projectId, currency);
  return resolved.futureForecast;
}

export async function resolveProjectGeneralAllocations(
  context: OrgContext,
  projectId: string,
  currency: string,
): Promise<ResolvedProjectGeneralAllocations> {
  const txKey = context.db as object;
  let byProject = resolvedByTx.get(txKey);
  if (!byProject) {
    byProject = new Map();
    resolvedByTx.set(txKey, byProject);
  }
  const cacheKey = `${projectId}:${currency}`;
  const hit = byProject.get(cacheKey);
  if (hit) return hit;
  const pending = resolveProjectGeneralAllocationsUncached(context, projectId, currency);
  byProject.set(cacheKey, pending);
  return pending;
}

async function resolveProjectGeneralAllocationsUncached(
  context: OrgContext,
  projectId: string,
  currency: string,
): Promise<ResolvedProjectGeneralAllocations> {
  const throughYearMonth = actualRecognitionThroughYearMonth(context.organization.timezone);
  const [storedBeforeCurrent, candidateMonths] = await Promise.all([
    sumStoredGeneralAllocationsBeforeYearMonth(
      context.db,
      context.organizationId,
      projectId,
      currency,
      throughYearMonth,
    ),
    listFutureGeneralCostCandidateMonths(context, throughYearMonth),
  ]);

  const futureMonths = candidateMonths.filter(
    (yearMonth) => compareYearMonth(yearMonth, throughYearMonth) > 0,
  );
  const previewMonths = [throughYearMonth, ...futureMonths];
  const previews = await previewGeneralCostMonthAllocations(context, previewMonths, {
    allowFuture: true,
  });

  let recognized =
    fromNumericString(storedBeforeCurrent, currency) ?? zeroMoney(currency);
  const currentPreview = previews.get(throughYearMonth);
  if (currentPreview && !currentPreview.skipped) {
    recognized = addMoney(
      recognized,
      previewLineAmountForProject(currentPreview, projectId, currency),
    );
  } else {
    const storedCurrent = await sumGeneralAllocationsForProject(
      context.db,
      context.organizationId,
      projectId,
      currency,
      { yearMonthEquals: throughYearMonth },
    );
    recognized = addMoney(
      recognized,
      fromNumericString(storedCurrent, currency) ?? zeroMoney(currency),
    );
  }

  let futureForecast = zeroMoney(currency);
  for (const yearMonth of futureMonths) {
    const preview = previews.get(yearMonth);
    if (!preview || preview.skipped) continue;
    const share = previewLineAmountForProject(preview, projectId, currency);
    if (!isZeroMoney(share)) {
      futureForecast = addMoney(futureForecast, share);
    }
  }

  return {
    recognizedActual: roundMoney(recognized),
    futureForecast: roundMoney(futureForecast),
  };
}
