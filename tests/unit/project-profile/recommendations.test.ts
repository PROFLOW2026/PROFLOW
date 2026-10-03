import { describe, expect, it } from 'vitest';
import {
  RECOMMENDATION_DECISIONS,
  RECOMMENDATION_KINDS as SCHEMA_KINDS,
  RECOMMENDATION_CREATED_ENTITY_TYPES,
} from '@drizzle/schema';
import { EMPTY_CHARACTERISTICS, type ConstructionCharacteristics } from '@/modules/project-profile/domain/characteristics';
import { STANDARD_PROFILE, type OperatingRole } from '@/modules/project-profile/domain/profile';
import {
  RECOMMENDATION_KINDS,
  RECOMMENDATION_TARGET_BY_KIND,
  REASON_CODES,
  applyDecisions,
  groupByKind,
  recommend,
  selectAcceptable,
} from '@/modules/project-profile/domain/recommendations';

function chars(overrides: Partial<ConstructionCharacteristics>): ConstructionCharacteristics {
  return { ...EMPTY_CHARACTERISTICS, ...overrides };
}

function profile(...roles: OperatingRole[]) {
  return { operatingRoles: roles };
}

const TOWER = chars({
  category: 'residential',
  constructionMethod: 'cast_in_place',
  buildingsCount: 3,
  floorsAboveGround: 12,
  floorsBelowGround: 2,
  residentialUnits: 120,
  commercialUnits: 4,
  parkingLevels: 2,
  hasPublicAreas: true,
  siteAreaSqm: '4500',
});

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('recommendation engine', () => {
  it('returns nothing for a standard project with no characteristics', () => {
    expect(recommend({ profile: STANDARD_PROFILE, characteristics: EMPTY_CHARACTERISTICS })).toEqual([]);
  });

  it('is deterministic (same input -> identical output, order included)', () => {
    const a = recommend({ profile: profile('developer', 'general_contractor'), characteristics: TOWER });
    const b = recommend({ profile: profile('developer', 'general_contractor'), characteristics: TOWER });
    expect(b).toEqual(a);
    expect(new Set(keys(a)).size).toBe(a.length);
  });

  it('orders by kind and gives every item a known reason and a non-financial target', () => {
    const items = recommend({ profile: profile('developer', 'general_contractor', 'project_management', 'subcontractor'), characteristics: TOWER });
    const kindIndexes = items.map((item) => RECOMMENDATION_KINDS.indexOf(item.kind));
    expect(kindIndexes).toEqual([...kindIndexes].sort((x, y) => x - y));
    for (const item of items) {
      expect(item.reasons.length).toBeGreaterThan(0);
      for (const reason of item.reasons) expect(REASON_CODES).toContain(reason);
      expect(['work_package', 'project_milestone', 'task']).toContain(item.target);
      expect(item.key).toMatch(/^[a-z][a-z_]*:[a-z0-9_:]+$/);
    }
  });

  it('never targets anything financial', () => {
    for (const target of Object.values(RECOMMENDATION_TARGET_BY_KIND)) {
      expect(['work_package', 'project_milestone', 'task']).toContain(target);
    }
    expect([...RECOMMENDATION_CREATED_ENTITY_TYPES].sort()).toEqual(['project_milestone', 'task', 'work_package']);
  });

  it('derives trades from the building characteristics', () => {
    const items = recommend({ profile: STANDARD_PROFILE, characteristics: TOWER });
    const k = keys(items);
    expect(k).toEqual(
      expect.arrayContaining([
        'trade:earthworks',
        'trade:shoring',
        'trade:concrete_frame',
        'trade:elevators',
        'trade:fire_protection',
        'trade:facade_cladding',
        'trade:parking_systems',
        'trade:gas',
        'trade:landscaping',
      ]),
    );
    expect(k).not.toContain('trade:precast_erection');
    expect(k).not.toContain('trade:demolition');
    const elevators = items.find((item) => item.key === 'trade:elevators')!;
    expect(elevators.reasons).toEqual(['mid_rise']);
  });

  it('adds one work package per building for multi-building projects (capped)', () => {
    const items = recommend({ profile: STANDARD_PROFILE, characteristics: TOWER });
    expect(keys(items).filter((key) => key.startsWith('work_package:building:'))).toEqual([
      'work_package:building:1',
      'work_package:building:2',
      'work_package:building:3',
    ]);
    const estate = recommend({ profile: STANDARD_PROFILE, characteristics: chars({ category: 'residential', buildingsCount: 80 }) });
    expect(keys(estate).filter((key) => key.startsWith('work_package:building:'))).toHaveLength(20);
  });

  it('switches structural trades and inspections with the construction method', () => {
    const precast = recommend({
      profile: STANDARD_PROFILE,
      characteristics: chars({ category: 'industrial', constructionMethod: 'precast', floorsAboveGround: 2 }),
    });
    expect(keys(precast)).toEqual(expect.arrayContaining(['trade:precast_erection', 'inspection:precast_connections']));
    expect(keys(precast)).not.toContain('trade:concrete_frame');
    expect(keys(precast)).not.toContain('inspection:rebar_pre_pour');
  });

  it('adds buyer-facing items only for a residential developer', () => {
    const developer = keys(recommend({ profile: profile('developer'), characteristics: TOWER }));
    expect(developer).toEqual(
      expect.arrayContaining([
        'milestone:building_permit',
        'milestone:buyers_handover',
        'coordination_event:buyers_walkthrough',
        'task_template:buyers_changes_window',
        'handover_requirement:buyer_handover_protocols',
      ]),
    );
    expect(developer).not.toContain('milestone:project_handover');

    const gc = keys(recommend({ profile: profile('general_contractor'), characteristics: TOWER }));
    expect(gc).not.toContain('milestone:buyers_handover');
    expect(gc).toContain('milestone:project_handover');
    expect(gc).toEqual(expect.arrayContaining(['task_template:site_opening_notice', 'milestone:site_mobilization']));
  });

  it('gives role-only recommendations when characteristics are empty', () => {
    const items = recommend({ profile: profile('subcontractor'), characteristics: EMPTY_CHARACTERISTICS });
    expect(keys(items)).toEqual(['task_template:subcontract_scope_review', 'task_template:subcontractor_daily_report']);
    expect(items[0]!.reasons).toEqual(['role_subcontractor']);
  });

  it('handles renovation and infrastructure without new-build items', () => {
    const renovation = keys(recommend({ profile: STANDARD_PROFILE, characteristics: chars({ category: 'renovation', floorsAboveGround: 3 }) }));
    expect(renovation).toContain('trade:demolition');
    expect(renovation).not.toContain('milestone:foundations_complete');
    expect(renovation).not.toContain('trade:concrete_frame');

    const infra = keys(recommend({ profile: STANDARD_PROFILE, characteristics: chars({ category: 'infrastructure' }) }));
    expect(infra).toEqual(
      expect.arrayContaining(['trade:roads_paving', 'work_package:infrastructure_works', 'milestone:infrastructure_acceptance']),
    );
    expect(infra).not.toContain('trade:plumbing');
  });

  it('joins decisions, keeps orphan decisions apart and only accepts open items', () => {
    const items = recommend({ profile: profile('general_contractor'), characteristics: TOWER });
    const { items: withStatus, orphanDecisions } = applyDecisions(items, [
      { recommendationKey: 'trade:elevators', decision: 'accepted', createdEntityType: 'work_package', createdEntityId: 'x' },
      { recommendationKey: 'trade:gas', decision: 'dismissed', createdEntityType: null, createdEntityId: null },
      { recommendationKey: 'trade:removed_rule', decision: 'dismissed', createdEntityType: null, createdEntityId: null },
    ]);
    expect(withStatus.find((item) => item.key === 'trade:elevators')!.status).toBe('accepted');
    expect(withStatus.find((item) => item.key === 'trade:gas')!.status).toBe('dismissed');
    expect(orphanDecisions.map((decision) => decision.recommendationKey)).toEqual(['trade:removed_rule']);
    const acceptable = selectAcceptable(withStatus, ['trade:elevators', 'trade:gas', 'trade:plumbing', 'trade:unknown']);
    expect(acceptable.map((item) => item.key)).toEqual(['trade:plumbing']);
  });

  it('groups by kind with every kind present', () => {
    const groups = groupByKind(recommend({ profile: STANDARD_PROFILE, characteristics: TOWER }));
    expect([...groups.keys()]).toEqual([...RECOMMENDATION_KINDS]);
    expect(groups.get('trade')!.length).toBeGreaterThan(5);
  });

  it('stays in sync with the schema catalogs', () => {
    expect([...SCHEMA_KINDS]).toEqual([...RECOMMENDATION_KINDS]);
    expect([...RECOMMENDATION_DECISIONS]).toEqual(['accepted', 'dismissed']);
  });
});
