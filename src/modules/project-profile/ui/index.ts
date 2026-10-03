/** UI entry of the project-profile module (client-safe: no ORM, no server-only imports). */
export { LocationPicker, type LocationPickerProps } from './location-picker';
export { LocationLabel } from './location-label';
export { ProjectDeliveryCreateSection } from './project-delivery-create-section';
export { ProjectStructureClient, type ProjectStructureClientProps } from './project-structure-client';
export type { ProjectStructureActions, StructureActionResult } from './types';
export {
  DEFAULT_LOCATION_SEPARATOR,
  buildLocationIndex,
  filterLocationEntries,
  flattenLocationTree,
  formatLocationCodePath,
  formatLocationLabel,
  locationPath,
  type FlatLocationEntry,
  type LocationIndex,
  type LocationNode,
  type LocationType,
} from '../domain/locations';
