import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTION_CATEGORIES as SCHEMA_CATEGORIES,
  CONSTRUCTION_METHODS as SCHEMA_METHODS,
  PROJECT_OPERATING_ROLES,
  PROJECT_OWNERSHIP_MODELS,
} from '@drizzle/schema';
import { parseDeliveryCreateFormData } from '@/modules/project-profile/domain/create-section';
import {
  CONSTRUCTION_CATEGORIES,
  CONSTRUCTION_METHODS,
  EMPTY_CHARACTERISTICS,
  isEmptyCharacteristics,
  normalizeCustomMetadata,
  totalUnits,
} from '@/modules/project-profile/domain/characteristics';
import {
  OPERATING_ROLES,
  OWNERSHIP_MODELS,
  buildDeliveryProfile,
  clientRequirement,
  isStandardProfile,
  normalizeOperatingRoles,
  resolveOwnershipModel,
} from '@/modules/project-profile/domain/profile';
import { updateCharacteristicsSchema } from '@/modules/project-profile/validation/schemas';

describe('delivery profile', () => {
  it('normalizes roles (dedupe, catalog order, unknown dropped) and allows any combination', () => {
    expect(normalizeOperatingRoles(['subcontractor', 'developer', 'developer', 'bogus'])).toEqual([
      'developer',
      'subcontractor',
    ]);
    expect(normalizeOperatingRoles(OPERATING_ROLES)).toEqual([...OPERATING_ROLES]);
  });

  it('treats an empty role set as a standard project', () => {
    const profile = buildDeliveryProfile({ operatingRoles: [] });
    expect(isStandardProfile(profile)).toBe(true);
    expect(profile.ownershipModel).toBe('client_project');
    expect(clientRequirement(profile)).toBe('optional');
  });

  it('a developer building for itself needs no client', () => {
    const profile = buildDeliveryProfile({ operatingRoles: ['developer', 'general_contractor'], ownershipModel: null });
    expect(profile.ownershipModel).toBe('own_development');
    expect(clientRequirement(profile)).toBe('not_applicable');
    expect(clientRequirement({ ...profile, ownershipModel: 'client_project' })).toBe('optional');
  });

  it('never keeps a developer-only ownership without the developer role', () => {
    expect(resolveOwnershipModel(['general_contractor'], 'own_development')).toBe('client_project');
    const profile = buildDeliveryProfile({
      operatingRoles: ['project_management'],
      ownershipModel: 'joint_venture',
      developerEntityName: 'SPV Ltd',
    });
    expect(profile.ownershipModel).toBe('client_project');
    expect(profile.developerEntityName).toBeNull();
  });

  it('stays in sync with the schema catalogs', () => {
    expect([...OPERATING_ROLES]).toEqual([...PROJECT_OPERATING_ROLES]);
    expect([...OWNERSHIP_MODELS]).toEqual([...PROJECT_OWNERSHIP_MODELS]);
    expect([...CONSTRUCTION_CATEGORIES]).toEqual([...SCHEMA_CATEGORIES]);
    expect([...CONSTRUCTION_METHODS]).toEqual([...SCHEMA_METHODS]);
  });
});

describe('construction characteristics', () => {
  it('treats empty input as no signal', () => {
    expect(isEmptyCharacteristics(EMPTY_CHARACTERISTICS)).toBe(true);
    expect(totalUnits(EMPTY_CHARACTERISTICS)).toBeNull();
    expect(totalUnits({ ...EMPTY_CHARACTERISTICS, residentialUnits: 10 })).toBe(10);
    expect(isEmptyCharacteristics({ ...EMPTY_CHARACTERISTICS, hasPublicAreas: true })).toBe(false);
  });

  it('normalizes custom metadata', () => {
    expect(
      normalizeCustomMetadata([
        { key: ' Lot ', value: ' 1234 ' },
        { key: '', value: 'x' },
        { key: 'empty', value: '  ' },
      ]),
    ).toEqual({ Lot: '1234' });
  });

  it('validates counts and areas (empty strings clear values)', () => {
    const parsed = updateCharacteristicsSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      category: '',
      constructionMethod: 'precast',
      buildingsCount: '3',
      floorsAboveGround: '',
      floorsBelowGround: null,
      residentialUnits: 40,
      commercialUnits: undefined,
      parkingLevels: '1',
      builtAreaSqm: '1250.50',
      commercialAreaSqm: '',
      commonAreaSqm: null,
      siteAreaSqm: undefined,
    });
    expect(parsed).toMatchObject({
      category: null,
      constructionMethod: 'precast',
      buildingsCount: 3,
      floorsAboveGround: null,
      residentialUnits: 40,
      parkingLevels: 1,
      builtAreaSqm: '1250.50',
      commercialAreaSqm: null,
      hasPublicAreas: false,
      customMetadata: [],
    });
    expect(
      updateCharacteristicsSchema.safeParse({ projectId: '00000000-0000-4000-8000-000000000001', floorsAboveGround: -1 })
        .success,
    ).toBe(false);
    expect(
      updateCharacteristicsSchema.safeParse({ projectId: '00000000-0000-4000-8000-000000000001', builtAreaSqm: '-5' })
        .success,
    ).toBe(false);
  });
});

describe('project create section', () => {
  it('returns null when the optional section is left empty', () => {
    const form = new FormData();
    form.set('name', 'Tower');
    expect(parseDeliveryCreateFormData(form)).toBeNull();
  });

  it('parses roles, category and counts', () => {
    const form = new FormData();
    form.append('deliveryProfile.roles', 'developer');
    form.append('deliveryProfile.roles', 'general_contractor');
    form.append('deliveryProfile.roles', 'hacker');
    form.set('deliveryProfile.ownershipModel', 'own_development');
    form.set('deliveryProfile.category', 'residential');
    form.set('deliveryProfile.floorsAboveGround', '8');
    form.set('deliveryProfile.buildingsCount', '-3');
    expect(parseDeliveryCreateFormData(form)).toEqual({
      operatingRoles: ['developer', 'general_contractor'],
      ownershipModel: 'own_development',
      category: 'residential',
      counts: { floorsAboveGround: 8 },
    });
  });
});
