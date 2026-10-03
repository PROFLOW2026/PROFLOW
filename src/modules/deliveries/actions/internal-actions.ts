'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { createProjectDelivery } from '../application/internal';
import type { CreateDeliveryInput } from '../validation/schemas';
import { withOrgContext } from '@/shared/auth/session';
import { deliveryActionError, type DeliveryActionResult } from './action-result';

async function revalidateDeliveries(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}/deliveries`);
}

export async function createProjectDeliveryAction(
  input: CreateDeliveryInput,
): Promise<DeliveryActionResult<{ deliveryItemId: string }>> {
  try {
    const created = await withOrgContext((context) => createProjectDelivery(context, input));
    await revalidateDeliveries(input.projectId);
    return { ok: true, data: { deliveryItemId: created.id } };
  } catch (error) {
    unstable_rethrow(error);
    return deliveryActionError(error);
  }
}
