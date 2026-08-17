'use server';

import { revalidatePath } from 'next/cache';
import { runRules, setAutomationRuleEnabled } from '@/modules/automations';
import type { AutomationPresetKey } from '@/modules/automations';
import { withOrgContext } from '@/shared/auth/session';

export async function toggleAutomationAction(formData: FormData): Promise<void> {
  const presetKey = String(formData.get('presetKey') ?? '') as AutomationPresetKey;
  const enabled = String(formData.get('enabled') ?? '') === 'true';
  await withOrgContext((context) => setAutomationRuleEnabled(context, { presetKey, enabled }));
  revalidatePath('/automations');
}

export async function runNowAction(formData: FormData): Promise<void> {
  const presetKey = String(formData.get('presetKey') ?? '') as AutomationPresetKey;
  await withOrgContext((context) => runRules(context, { presetKey }));
  revalidatePath('/automations');
}
