import type { ExternalCapability } from '@/shared/external';

/** A single capability, or "any of" a list (e.g. tasks are reachable with work OR report). */
export type PortalCapabilityRequirement =
  | ExternalCapability
  | { readonly anyOf: readonly ExternalCapability[] };

export function requirementCapabilities(
  requirement: PortalCapabilityRequirement,
): readonly ExternalCapability[] {
  return typeof requirement === 'string' ? [requirement] : requirement.anyOf;
}

export function holdsRequirement(
  capabilities: ReadonlySet<string>,
  requirement: PortalCapabilityRequirement | null,
): boolean {
  if (requirement === null) return true;
  return requirementCapabilities(requirement).some((capability) => capabilities.has(capability));
}
