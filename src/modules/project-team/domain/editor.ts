import {
  IMPLIED_CAPABILITIES,
  PROJECT_CAPABILITY_CATALOG,
  expandCapabilities,
  isProjectCapability,
  type ProjectCapability,
  type ProjectCapabilityGroup,
} from './capabilities';

/**
 * Pure rules behind the capability editor. The server re-checks everything
 * (`setProjectMemberCapabilities` / `addProjectMember`); these only keep the UI
 * honest about what a save will do.
 */

/** next-intl treats `.` as nesting, so message keys use `_` (`project.view` -> `project_view`). */
export function capabilityMessageKey(capability: string): string {
  return capability.replace(/\./g, '_');
}

function capabilitiesInGroup(group: ProjectCapabilityGroup): readonly ProjectCapability[] {
  return PROJECT_CAPABILITY_CATALOG.filter((definition) => definition.group === group).map(
    (definition) => definition.key,
  );
}

export const CAPABILITIES_BY_GROUP: Readonly<Record<ProjectCapabilityGroup, readonly ProjectCapability[]>> = {
  operational: capabilitiesInGroup('operational'),
  financial: capabilitiesInGroup('financial'),
  administrative: capabilitiesInGroup('administrative'),
};

/** Capabilities whose implication closure contains `capability` (excluding itself). */
export function capabilitiesImplying(capability: ProjectCapability): ProjectCapability[] {
  return (Object.keys(IMPLIED_CAPABILITIES) as ProjectCapability[]).filter(
    (candidate) => candidate !== capability && expandCapabilities([candidate]).has(capability),
  );
}

/**
 * Toggles one capability in an (already expanded) selection.
 * - On: adds the capability and everything it implies.
 * - Off: removes it and every selected capability that implies it, otherwise the
 *   server-side expansion would silently put it back.
 */
export function toggleCapability(
  selected: Iterable<string>,
  capability: ProjectCapability,
  enabled: boolean,
): ProjectCapability[] {
  const current = expandCapabilities(selected);
  if (enabled) {
    for (const implied of expandCapabilities([capability])) current.add(implied);
  } else {
    current.delete(capability);
    for (const dependent of capabilitiesImplying(capability)) current.delete(dependent);
  }
  return [...current].sort();
}

export interface CapabilityChangePlan {
  readonly added: ProjectCapability[];
  readonly removed: ProjectCapability[];
  /** Added or removed capabilities the actor does not hold - the server will refuse them. */
  readonly beyondActor: ProjectCapability[];
  readonly addsFinancial: boolean;
}

/** Mirrors the server's two-way anti-escalation rule for a pending edit. */
export function planCapabilityChange(input: {
  readonly current: Iterable<string>;
  readonly next: Iterable<string>;
  readonly actor: ReadonlySet<string>;
  readonly isFinancial: (capability: ProjectCapability) => boolean;
}): CapabilityChangePlan {
  const current = expandCapabilities(input.current);
  const next = expandCapabilities(input.next);
  const added = [...next].filter((capability) => !current.has(capability)).sort();
  const removed = [...current].filter((capability) => !next.has(capability)).sort();
  const beyondActor = [...added, ...removed].filter((capability) => !input.actor.has(capability)).sort();
  return {
    added,
    removed,
    beyondActor,
    addsFinancial: added.some(input.isFinancial),
  };
}

/** Parses the capability list carried by an anti-escalation `AuthorizationError`. */
export function parseCapabilityList(value: string | undefined): ProjectCapability[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(isProjectCapability);
}
