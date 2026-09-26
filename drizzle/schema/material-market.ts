import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_shared';

/** Platform-global market data — not org-scoped. Writes via admin/service only. */
export const materialMarketSources = pgTable(
  'material_market_sources',
  {
    id: primaryId(),
    code: text('code').notNull(),
    nameHe: text('name_he').notNull(),
    trade: text('trade'),
    sourceType: text('source_type').notNull(),
    sourceName: text('source_name').notNull(),
    sourceSeriesId: text('source_series_id'),
    sourceUrl: text('source_url'),
    frequency: text('frequency').notNull().default('monthly'),
    unit: text('unit'),
    currency: text('currency'),
    isActive: boolean('is_active').notNull().default(true),
    isDerived: boolean('is_derived').notNull().default(false),
    lastObservationDate: date('last_observation_date', { mode: 'string' }),
    lastRefreshAt: timestamp('last_refresh_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('material_market_sources_code_uq').on(table.code),
    index('material_market_sources_active_idx').on(table.isActive, table.code),
    check(
      'material_market_sources_trade_known',
      sql`${table.trade} IS NULL OR ${table.trade} IN ('electrical', 'plumbing', 'steel_rebar')`,
    ),
    check(
      'material_market_sources_source_type_known',
      sql`${table.sourceType} IN ('fred', 'cbs', 'derived')`,
    ),
  ],
);

export const materialMarketObservations = pgTable(
  'material_market_observations',
  {
    id: primaryId(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => materialMarketSources.id, { onDelete: 'cascade' }),
    observationDate: date('observation_date', { mode: 'string' }).notNull(),
    value: numeric('value', { precision: 18, scale: 6, mode: 'number' }).notNull(),
    open: numeric('open', { precision: 18, scale: 6, mode: 'number' }),
    high: numeric('high', { precision: 18, scale: 6, mode: 'number' }),
    low: numeric('low', { precision: 18, scale: 6, mode: 'number' }),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('material_market_observations_source_date_uq').on(
      table.sourceId,
      table.observationDate,
    ),
    index('material_market_observations_source_date_idx').on(
      table.sourceId,
      table.observationDate,
    ),
  ],
);

export const materialPressureSnapshots = pgTable(
  'material_pressure_snapshots',
  {
    id: primaryId(),
    trade: text('trade').notNull(),
    snapshotDate: date('snapshot_date', { mode: 'string' }).notNull(),
    pressureScore: numeric('pressure_score', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    pressureDirection: text('pressure_direction').notNull(),
    confidence: text('confidence').notNull(),
    pressureScore1mChange: numeric('pressure_score_1m_change', {
      precision: 6,
      scale: 2,
      mode: 'number',
    }),
    pressureScore3mChange: numeric('pressure_score_3m_change', {
      precision: 6,
      scale: 2,
      mode: 'number',
    }),
    pressureMomentum: text('pressure_momentum').notNull(),
    localConfirmation: text('local_confirmation').notNull(),
    weightedDataCoverage: numeric('weighted_data_coverage', {
      precision: 6,
      scale: 4,
      mode: 'number',
    }).notNull(),
    componentsJson: jsonb('components_json').$type<Record<string, number | null>>().notNull().default({}),
    driversUpJson: jsonb('drivers_up_json').$type<string[]>().notNull().default([]),
    driversDownJson: jsonb('drivers_down_json').$type<string[]>().notNull().default([]),
    methodologyVersion: text('methodology_version').notNull().default('V1'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('material_pressure_snapshots_trade_date_version_uq').on(
      table.trade,
      table.snapshotDate,
      table.methodologyVersion,
    ),
    index('material_pressure_snapshots_trade_date_idx').on(table.trade, table.snapshotDate),
    check(
      'material_pressure_snapshots_trade_known',
      sql`${table.trade} IN ('electrical', 'plumbing', 'steel_rebar')`,
    ),
    check(
      'material_pressure_snapshots_direction_known',
      sql`${table.pressureDirection} IN ('strong_down', 'down', 'neutral', 'up', 'strong_up')`,
    ),
    check(
      'material_pressure_snapshots_confidence_known',
      sql`${table.confidence} IN ('low', 'medium', 'high')`,
    ),
    check(
      'material_pressure_snapshots_momentum_known',
      sql`${table.pressureMomentum} IN ('rising_fast', 'rising', 'stable', 'falling', 'falling_fast')`,
    ),
    check(
      'material_pressure_snapshots_local_confirmation_known',
      sql`${table.localConfirmation} IN ('confirmed_up', 'confirmed_down', 'not_confirmed', 'no_local_data')`,
    ),
    check(
      'material_pressure_snapshots_score_range',
      sql`${table.pressureScore} >= 0 AND ${table.pressureScore} <= 100`,
    ),
    check(
      'material_pressure_snapshots_coverage_range',
      sql`${table.weightedDataCoverage} >= 0 AND ${table.weightedDataCoverage} <= 1`,
    ),
  ],
);
