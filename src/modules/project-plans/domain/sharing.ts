import type { DistributionEntryInput, DocumentShareAudience } from './types';

/** Pure contractor-sharing rules (mirrored by the `document_shares` CHECK constraints / RLS in 0162). */

export interface ShareTargetInput {
  readonly audience: DocumentShareAudience;
  readonly agreementId?: string | null;
  readonly principalId?: string | null;
}

export type ShareTarget =
  | { readonly audience: 'project_contractors' }
  | { readonly audience: 'agreement'; readonly agreementId: string }
  | { readonly audience: 'principal'; readonly principalId: string };

export function normalizeShareTarget(input: ShareTargetInput): ShareTarget | null {
  switch (input.audience) {
    case 'project_contractors':
      return { audience: 'project_contractors' };
    case 'agreement':
      return input.agreementId ? { audience: 'agreement', agreementId: input.agreementId } : null;
    case 'principal':
      return input.principalId ? { audience: 'principal', principalId: input.principalId } : null;
    default:
      return null;
  }
}

export function distributionKey(entry: DistributionEntryInput): string {
  return entry.audience === 'agreement' ? `agreement:${entry.agreementId}` : `principal:${entry.principalId}`;
}

/** Replace-set diff for a distribution list (duplicates collapse). */
export function diffDistribution(
  current: readonly (DistributionEntryInput & { readonly id: string })[],
  next: readonly DistributionEntryInput[],
): { readonly add: DistributionEntryInput[]; readonly removeIds: string[] } {
  const nextKeys = new Map<string, DistributionEntryInput>();
  for (const entry of next) nextKeys.set(distributionKey(entry), entry);
  const currentKeys = new Map(current.map((entry) => [distributionKey(entry), entry] as const));
  const add = [...nextKeys.entries()].filter(([key]) => !currentKeys.has(key)).map(([, entry]) => entry);
  const removeIds = [...currentKeys.entries()].filter(([key]) => !nextKeys.has(key)).map(([, entry]) => entry.id);
  return { add, removeIds };
}

const MAX_TITLE = 200;
const MAX_NOTE = 1000;

export function normalizeShareTitle(raw: string | null | undefined, fallback: string): string {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  return (value || fallback).slice(0, MAX_TITLE);
}

export function normalizeShareNote(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return value ? value.slice(0, MAX_NOTE) : null;
}
