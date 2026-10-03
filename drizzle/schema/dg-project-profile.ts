import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';
import { profiles } from './identity';
import { externalPrincipals } from './portal';
import { projects } from './projects';
import { organizations } from './tenancy';

/**
 * Developer / GC layer - Track D (migration 0157): project delivery profile, construction
 * characteristics and recommendation decisions. Locations live in the foundation table
 * `project_locations` (0155).
 *
 * Everything here is optional: a project without rows behaves exactly like before.
 * No money columns (areas are physical quantities, not values).
 */

export const PROJECT_OPERATING_ROLES = [
  'developer',
  'general_contractor',
  'project_management',
  'subcontractor',
] as const;
export type ProjectOperatingRole = (typeof PROJECT_OPERATING_ROLES)[number];

export const PROJECT_OWNERSHIP_MODELS = ['client_project', 'own_development', 'joint_venture'] as const;
export type ProjectOwnershipModel = (typeof PROJECT_OWNERSHIP_MODELS)[number];

export const projectDeliveryProfiles = pgTable(
  'project_delivery_profiles',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    /** Empty = standard project. Any combination is allowed (never an exclusive org type). */
    operatingRoles: text('operating_roles')
      .array()
      .$type<ProjectOperatingRole[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** own_development / joint_venture require the developer role and need no client. */
    ownershipModel: text('ownership_model')
      .$type<ProjectOwnershipModel>()
      .notNull()
      .default('client_project'),
    developerEntityName: text('developer_entity_name'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    updatedByUserId: uuid('updated_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_delivery_profiles_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('project_delivery_profiles_project_uq').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'project_delivery_profiles_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'project_delivery_profiles_roles_known',
      sql`${table.operatingRoles} <@ ARRAY['developer','general_contractor','project_management','subcontractor']::text[]`,
    ),
    check(
      'project_delivery_profiles_ownership_known',
      sql`${table.ownershipModel} IN ('client_project','own_development','joint_venture')`,
    ),
    check(
      'project_delivery_profiles_ownership_requires_developer',
      sql`${table.ownershipModel} = 'client_project' OR 'developer' = ANY(${table.operatingRoles})`,
    ),
  ],
);

export const CONSTRUCTION_CATEGORIES = [
  'residential',
  'commercial',
  'mixed_use',
  'office',
  'industrial',
  'public',
  'infrastructure',
  'renovation',
  'urban_renewal',
  'other',
] as const;
export type ConstructionCategory = (typeof CONSTRUCTION_CATEGORIES)[number];

export const CONSTRUCTION_METHODS = [
  'cast_in_place',
  'precast',
  'tunnel_formwork',
  'steel_structure',
  'timber',
  'light_construction',
  'mixed',
  'other',
] as const;
export type ConstructionMethod = (typeof CONSTRUCTION_METHODS)[number];

const areaColumn = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'string' });

export const projectConstructionCharacteristics = pgTable(
  'project_construction_characteristics',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    category: text('category').$type<ConstructionCategory>(),
    constructionMethod: text('construction_method').$type<ConstructionMethod>(),
    buildingsCount: integer('buildings_count'),
    floorsAboveGround: integer('floors_above_ground'),
    floorsBelowGround: integer('floors_below_ground'),
    residentialUnits: integer('residential_units'),
    commercialUnits: integer('commercial_units'),
    parkingLevels: integer('parking_levels'),
    hasPublicAreas: boolean('has_public_areas').notNull().default(false),
    builtAreaSqm: areaColumn('built_area_sqm'),
    commercialAreaSqm: areaColumn('commercial_area_sqm'),
    commonAreaSqm: areaColumn('common_area_sqm'),
    siteAreaSqm: areaColumn('site_area_sqm'),
    customMetadata: jsonb('custom_metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    updatedByUserId: uuid('updated_by_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('project_construction_characteristics_id_organization_id_uq').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('project_construction_characteristics_project_uq').on(
      table.organizationId,
      table.projectId,
    ),
    foreignKey({
      name: 'project_construction_characteristics_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'project_construction_characteristics_category_known',
      sql`${table.category} IS NULL OR ${table.category} IN ('residential','commercial','mixed_use','office','industrial','public','infrastructure','renovation','urban_renewal','other')`,
    ),
    check(
      'project_construction_characteristics_method_known',
      sql`${table.constructionMethod} IS NULL OR ${table.constructionMethod} IN ('cast_in_place','precast','tunnel_formwork','steel_structure','timber','light_construction','mixed','other')`,
    ),
    check(
      'project_construction_characteristics_counts_range',
      sql`(${table.buildingsCount} IS NULL OR ${table.buildingsCount} BETWEEN 0 AND 500)
        AND (${table.floorsAboveGround} IS NULL OR ${table.floorsAboveGround} BETWEEN 0 AND 200)
        AND (${table.floorsBelowGround} IS NULL OR ${table.floorsBelowGround} BETWEEN 0 AND 30)
        AND (${table.residentialUnits} IS NULL OR ${table.residentialUnits} BETWEEN 0 AND 100000)
        AND (${table.commercialUnits} IS NULL OR ${table.commercialUnits} BETWEEN 0 AND 100000)
        AND (${table.parkingLevels} IS NULL OR ${table.parkingLevels} BETWEEN 0 AND 30)`,
    ),
    check(
      'project_construction_characteristics_areas_non_negative',
      sql`(${table.builtAreaSqm} IS NULL OR ${table.builtAreaSqm} >= 0)
        AND (${table.commercialAreaSqm} IS NULL OR ${table.commercialAreaSqm} >= 0)
        AND (${table.commonAreaSqm} IS NULL OR ${table.commonAreaSqm} >= 0)
        AND (${table.siteAreaSqm} IS NULL OR ${table.siteAreaSqm} >= 0)`,
    ),
    check(
      'project_construction_characteristics_metadata_object',
      sql`jsonb_typeof(${table.customMetadata}) = 'object'`,
    ),
  ],
);

export const RECOMMENDATION_KINDS = [
  'trade',
  'work_package',
  'milestone',
  'coordination_event',
  'inspection',
  'handover_requirement',
  'task_template',
] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export const RECOMMENDATION_DECISIONS = ['accepted', 'dismissed'] as const;
export type RecommendationDecision = (typeof RECOMMENDATION_DECISIONS)[number];

/** Non-financial records an accepted recommendation may create. */
export const RECOMMENDATION_CREATED_ENTITY_TYPES = ['work_package', 'project_milestone', 'task'] as const;
export type RecommendationCreatedEntityType = (typeof RECOMMENDATION_CREATED_ENTITY_TYPES)[number];

/**
 * One decision per (project, recommendation key). UPDATE is denied by trigger; only a
 * dismissed decision may be deleted (restore). Accepted decisions are permanent.
 */
export const projectRecommendationDecisions = pgTable(
  'project_recommendation_decisions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').notNull(),
    recommendationKey: text('recommendation_key').notNull(),
    kind: text('kind').$type<RecommendationKind>().notNull(),
    decision: text('decision').$type<RecommendationDecision>().notNull(),
    rulesetVersion: text('ruleset_version').notNull(),
    createdEntityType: text('created_entity_type').$type<RecommendationCreatedEntityType>(),
    createdEntityId: uuid('created_entity_id'),
    decidedActorType: text('decided_actor_type')
      .$type<'internal' | 'external' | 'system'>()
      .notNull()
      .default('internal'),
    decidedUserId: uuid('decided_user_id').references(() => profiles.id, { onDelete: 'set null' }),
    decidedPrincipalId: uuid('decided_principal_id').references(() => externalPrincipals.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('project_recommendation_decisions_key_uq').on(
      table.organizationId,
      table.projectId,
      table.recommendationKey,
    ),
    index('project_recommendation_decisions_project_idx').on(table.organizationId, table.projectId),
    foreignKey({
      name: 'project_recommendation_decisions_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('cascade'),
    check(
      'project_recommendation_decisions_key_shape',
      sql`${table.recommendationKey} ~ '^[a-z][a-z_]*:[a-z0-9_:]+$'`,
    ),
    check(
      'project_recommendation_decisions_kind_known',
      sql`${table.kind} IN ('trade','work_package','milestone','coordination_event','inspection','handover_requirement','task_template')`,
    ),
    check(
      'project_recommendation_decisions_decision_known',
      sql`${table.decision} IN ('accepted','dismissed')`,
    ),
    check(
      'project_recommendation_decisions_created_entity_shape',
      sql`(${table.decision} = 'accepted' AND ${table.createdEntityType} IN ('work_package','project_milestone','task') AND ${table.createdEntityId} IS NOT NULL)
        OR (${table.decision} = 'dismissed' AND ${table.createdEntityType} IS NULL AND ${table.createdEntityId} IS NULL)`,
    ),
    check(
      'project_recommendation_decisions_actor_shape',
      sql`(${table.decidedActorType} = 'internal' AND ${table.decidedPrincipalId} IS NULL)
        OR (${table.decidedActorType} = 'external' AND ${table.decidedPrincipalId} IS NOT NULL AND ${table.decidedUserId} IS NULL)
        OR (${table.decidedActorType} = 'system' AND ${table.decidedUserId} IS NULL AND ${table.decidedPrincipalId} IS NULL)`,
    ),
  ],
);
