import {
  CHARACTERISTIC_COUNT_LIMITS,
  isConstructionCategory,
  type ConstructionCategory,
} from './characteristics';
import { isOwnershipModel, normalizeOperatingRoles, type OperatingRole, type OwnershipModel } from './profile';

/**
 * Optional "delivery profile" section of the project create form. Field names are prefixed
 * `deliveryProfile.` so they never collide with the existing create form fields.
 */
export const DELIVERY_CREATE_FIELD = {
  roles: 'deliveryProfile.roles',
  ownershipModel: 'deliveryProfile.ownershipModel',
  category: 'deliveryProfile.category',
  buildingsCount: 'deliveryProfile.buildingsCount',
  floorsAboveGround: 'deliveryProfile.floorsAboveGround',
  floorsBelowGround: 'deliveryProfile.floorsBelowGround',
  residentialUnits: 'deliveryProfile.residentialUnits',
  commercialUnits: 'deliveryProfile.commercialUnits',
  parkingLevels: 'deliveryProfile.parkingLevels',
} as const;

export const DELIVERY_CREATE_COUNT_FIELDS = [
  'buildingsCount',
  'floorsAboveGround',
  'floorsBelowGround',
  'residentialUnits',
  'commercialUnits',
  'parkingLevels',
] as const;
export type DeliveryCreateCountField = (typeof DELIVERY_CREATE_COUNT_FIELDS)[number];

export interface DeliveryCreateInput {
  readonly operatingRoles: OperatingRole[];
  readonly ownershipModel: OwnershipModel | null;
  readonly category: ConstructionCategory | null;
  readonly counts: Partial<Record<DeliveryCreateCountField, number>>;
}

/** Null when the section was left empty (the create flow then behaves exactly as before). */
export function parseDeliveryCreateFormData(formData: FormData): DeliveryCreateInput | null {
  const operatingRoles = normalizeOperatingRoles(formData.getAll(DELIVERY_CREATE_FIELD.roles));
  const ownershipRaw = formData.get(DELIVERY_CREATE_FIELD.ownershipModel);
  const categoryRaw = formData.get(DELIVERY_CREATE_FIELD.category);
  const counts: Partial<Record<DeliveryCreateCountField, number>> = {};
  for (const field of DELIVERY_CREATE_COUNT_FIELDS) {
    const raw = formData.get(DELIVERY_CREATE_FIELD[field]);
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const value = Number(raw);
    if (Number.isInteger(value) && value >= 0 && value <= CHARACTERISTIC_COUNT_LIMITS[field]) counts[field] = value;
  }
  const input: DeliveryCreateInput = {
    operatingRoles,
    ownershipModel: isOwnershipModel(ownershipRaw) ? ownershipRaw : null,
    category: isConstructionCategory(categoryRaw) ? categoryRaw : null,
    counts,
  };
  const empty = operatingRoles.length === 0 && input.category === null && Object.keys(counts).length === 0;
  return empty ? null : input;
}
