/**
 * Built-in inspection checklist catalog. Lives in code (not per-org rows) so every organization
 * gets the same, translated catalog; an inspection snapshots the items when it is created.
 * Labels render from `inspections.catalog.<templateKey>.items.<itemKey>` with the stored English
 * label as fallback.
 */

export interface CatalogChecklistItem {
  readonly key: string;
  /** English fallback; stored on the inspection item snapshot. */
  readonly label: string;
  readonly required: boolean;
}

export interface CatalogTemplate {
  readonly key: string;
  readonly category: string;
  /** English fallback name. */
  readonly name: string;
  readonly items: readonly CatalogChecklistItem[];
}

function item(key: string, label: string, required = true): CatalogChecklistItem {
  return { key, label, required };
}

export const INSPECTION_CATALOG: readonly CatalogTemplate[] = [
  {
    key: 'waterproofing',
    category: 'waterproofing',
    name: 'Waterproofing',
    items: [
      item('substrate_prepared', 'Substrate clean, dry and primed'),
      item('membrane_continuous', 'Membrane continuous, no tears or blisters'),
      item('overlaps_sealed', 'Overlaps and joints sealed to specification'),
      item('upstands_height', 'Upstands and wall turn-ups at required height'),
      item('drains_detailed', 'Drains and penetrations detailed and sealed'),
      item('flood_test', 'Flood test held 24-48h without leakage'),
      item('protection_layer', 'Protection layer installed before covering', false),
    ],
  },
  {
    key: 'concrete_pre_pour',
    category: 'concrete',
    name: 'Concrete pre-pour',
    items: [
      item('formwork_dimensions', 'Formwork dimensions and levels per drawings'),
      item('formwork_stable', 'Formwork propped, stable and clean'),
      item('rebar_per_drawings', 'Reinforcement diameter, spacing and laps per drawings'),
      item('cover_spacers', 'Concrete cover spacers in place'),
      item('embedded_items', 'Sleeves, conduits and embedded items fixed'),
      item('engineer_approval', 'Structural engineer approval recorded'),
      item('pour_logistics', 'Mix order, pump and vibrators confirmed', false),
    ],
  },
  {
    key: 'electrical_panel',
    category: 'electrical',
    name: 'Electrical panel',
    items: [
      item('panel_location', 'Panel location and clearances per plan'),
      item('breakers_rating', 'Breakers and RCDs rated per single-line diagram'),
      item('wiring_labeled', 'Circuits labeled and schedule attached'),
      item('earthing_bonding', 'Earthing and bonding connected and tested'),
      item('insulation_test', 'Insulation resistance test passed'),
      item('cover_closed', 'Covers, blanks and IP rating intact', false),
    ],
  },
  {
    key: 'pressure_test',
    category: 'plumbing',
    name: 'Pressure test',
    items: [
      item('system_isolated', 'Section isolated and open ends capped'),
      item('gauge_calibrated', 'Calibrated gauge installed'),
      item('test_pressure_reached', 'Test pressure reached per specification'),
      item('hold_duration', 'Pressure held for the required duration without drop'),
      item('no_visible_leaks', 'No visible leaks at joints and fittings'),
      item('test_record_signed', 'Test record signed by the contractor', false),
    ],
  },
  {
    key: 'ceiling_closure',
    category: 'finishes',
    name: 'Ceiling closure',
    items: [
      item('services_complete', 'All above-ceiling services installed and tested'),
      item('fire_stopping', 'Fire stopping at penetrations completed'),
      item('insulation_installed', 'Thermal / acoustic insulation installed'),
      item('access_panels', 'Access panels positioned for valves and equipment'),
      item('mep_signoff', 'MEP trades signed off for closure'),
      item('photos_taken', 'Photos taken before closing', false),
    ],
  },
  {
    key: 'fire_system',
    category: 'fire',
    name: 'Fire system',
    items: [
      item('sprinkler_layout', 'Sprinkler heads per approved layout'),
      item('pipe_pressure_test', 'Sprinkler piping pressure tested'),
      item('detectors_installed', 'Detectors and call points installed'),
      item('panel_commissioned', 'Fire alarm panel commissioned'),
      item('doors_dampers', 'Fire doors and dampers operating'),
      item('signage', 'Exit signage and emergency lighting working', false),
    ],
  },
  {
    key: 'aluminium_installation',
    category: 'facade',
    name: 'Aluminium installation',
    items: [
      item('frames_plumb', 'Frames plumb, level and anchored'),
      item('sealing', 'Perimeter sealing continuous'),
      item('glazing_intact', 'Glazing intact, correct type and labels'),
      item('hardware_operation', 'Sashes, handles and locks operate smoothly'),
      item('drainage_slots', 'Drainage slots clear; water test passed'),
      item('protection_film', 'Protection film and cleanliness', false),
    ],
  },
];

const BY_KEY = new Map(INSPECTION_CATALOG.map((template) => [template.key, template] as const));

export function findCatalogTemplate(key: string | null | undefined): CatalogTemplate | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
}

export const INSPECTION_CATEGORIES = [
  'general',
  'waterproofing',
  'concrete',
  'electrical',
  'plumbing',
  'finishes',
  'fire',
  'facade',
  'structure',
  'mechanical',
  'safety',
] as const;
export type InspectionCategory = (typeof INSPECTION_CATEGORIES)[number];
