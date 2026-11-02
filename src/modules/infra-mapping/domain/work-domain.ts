/**
 * Work domain ("תחום עבודה") of a documented item: electrical, plumbing, HVAC ... It is a plain attribute
 * of the photo / video (`infra_captures.infra_type`) used to filter and organize. It never changes the
 * cloud folder tree, which follows locations only.
 */
import type { InfraType } from './types';

/** Business profiles that work in a single trade get that trade pre-selected (a default, never a lock). */
const PROFILE_DEFAULT_DOMAIN: Readonly<Record<string, InfraType>> = {
  ELECTRICAL: 'electrical',
  PLUMBING: 'plumbing',
  HVAC: 'hvac',
  SAFETY_INSPECTION_CONSULTANT: 'fire',
};

/**
 * The pre-selected work domain for a business profile. Profiles that manage several trades
 * (general contractor, renovation, developer, consultants ...) get none: they see and filter all domains.
 */
export function defaultWorkDomain(profileKey: string | null | undefined): InfraType | null {
  if (!profileKey) return null;
  return PROFILE_DEFAULT_DOMAIN[profileKey] ?? null;
}
