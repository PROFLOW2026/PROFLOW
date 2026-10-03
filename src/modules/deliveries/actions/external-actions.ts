'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import { createDeliveryFromPortal, reportDeliveryFromPortal } from '../application/external';
import type { ExternalCreateDeliveryInput, ExternalReportDeliveryInput } from '../validation/schemas';
import { deliveryActionError, type DeliveryActionResult } from './action-result';

async function revalidatePortalDeliveries(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/contractor/projects/${projectId}/deliveries`);
}

async function runExternal<T>(fn: (context: ExternalContext) => Promise<T>): Promise<
  { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  try {
    const context = await requireExternalContext();
    const value = await fn(context);
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return deliveryActionError(error);
  }
}

export async function createDeliveryFromPortalAction(
  input: ExternalCreateDeliveryInput,
): Promise<DeliveryActionResult<{ deliveryItemId: string }>> {
  const result = await runExternal((context) => createDeliveryFromPortal(context, input));
  if (!result.ok) return result;
  await revalidatePortalDeliveries(input.projectId);
  return { ok: true, data: { deliveryItemId: result.value.deliveryItemId } };
}

export async function reportDeliveryFromPortalAction(input: ExternalReportDeliveryInput): Promise<DeliveryActionResult> {
  const result = await runExternal((context) => reportDeliveryFromPortal(context, input));
  if (!result.ok) return result;
  await revalidatePortalDeliveries(input.projectId);
  return { ok: true };
}
