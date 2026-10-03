const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** Unique uuids found under `keys` (string or string[] values). Anything else is ignored. */
export function payloadIds(payload: Record<string, unknown>, keys: readonly string[] | undefined): string[] {
  if (!keys || keys.length === 0) return [];
  const result = new Set<string>();
  for (const key of keys) {
    const value = payload[key];
    const values = Array.isArray(value) ? value : [value];
    for (const candidate of values) {
      if (isUuid(candidate)) result.add(candidate.toLowerCase());
    }
  }
  return [...result];
}

export interface ContractorTarget {
  readonly vendorId: string;
  readonly agreementId: string | null;
}

export type ExternalTargeting =
  | { readonly mode: 'targets'; readonly targets: readonly ContractorTarget[] }
  | { readonly mode: 'project' }
  | { readonly mode: 'none' };

export interface FallbackScope {
  readonly vendorId?: string | null;
  readonly subcontractAgreementId?: string | null;
  readonly internalOnly?: boolean;
}

const MAX_TARGETS = 50;

function agreementOf(source: Record<string, unknown>): string | null {
  const value = source.agreementId ?? source.subcontractAgreementId;
  return isUuid(value) ? value.toLowerCase() : null;
}

/**
 * Which contractor companies an event concerns. Explicit payload scope wins; otherwise the entity
 * scope from `resolveEntityScope`. `internalOnly` entities never reach contractors.
 */
export function externalTargeting(
  payload: Record<string, unknown>,
  fallback: FallbackScope | null,
): ExternalTargeting {
  if (fallback?.internalOnly || payload.internalOnly === true) return { mode: 'none' };

  const targets = new Map<string, ContractorTarget>();
  const add = (vendorId: unknown, agreementId: string | null) => {
    if (!isUuid(vendorId) || targets.size >= MAX_TARGETS) return;
    const vendor = vendorId.toLowerCase();
    targets.set(`${vendor}:${agreementId ?? ''}`, { vendorId: vendor, agreementId });
  };

  add(payload.vendorId, agreementOf(payload));
  if (Array.isArray(payload.vendorIds)) {
    for (const vendorId of payload.vendorIds) add(vendorId, null);
  }
  if (Array.isArray(payload.targets)) {
    for (const target of payload.targets) {
      if (target && typeof target === 'object') {
        const record = target as Record<string, unknown>;
        add(record.vendorId, agreementOf(record));
      }
    }
  }
  if (targets.size > 0) return { mode: 'targets', targets: [...targets.values()] };
  if (payload.allProjectContractors === true) return { mode: 'project' };

  if (fallback && isUuid(fallback.vendorId)) {
    add(fallback.vendorId, isUuid(fallback.subcontractAgreementId) ? fallback.subcontractAgreementId.toLowerCase() : null);
    return { mode: 'targets', targets: [...targets.values()] };
  }
  return { mode: 'none' };
}

/** Agreement for link building: payload first, then the single target. */
export function primaryAgreementId(payload: Record<string, unknown>, targeting: ExternalTargeting): string | null {
  const explicit = agreementOf(payload);
  if (explicit) return explicit;
  if (targeting.mode === 'targets' && targeting.targets.length === 1) return targeting.targets[0]!.agreementId;
  return null;
}

/** Single vendor (for the "contractor" copy param) or null when several / none. */
export function primaryVendorId(targeting: ExternalTargeting): string | null {
  if (targeting.mode !== 'targets') return null;
  const vendors = new Set(targeting.targets.map((target) => target.vendorId));
  return vendors.size === 1 ? [...vendors][0]! : null;
}

const MAX_REFERENCE_LENGTH = 80;

export function payloadReference(payload: Record<string, unknown>): string | null {
  const value = payload.reference;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > MAX_REFERENCE_LENGTH ? `${text.slice(0, MAX_REFERENCE_LENGTH - 1)}…` : text;
}
