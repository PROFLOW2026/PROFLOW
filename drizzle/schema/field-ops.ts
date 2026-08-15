import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  archivedAt,
  currencyCode,
  moneyAmount,
  primaryId,
  quantityAmount,
  timestamps,
} from './_shared';
import { profiles } from './identity';
import { materialItems } from './procurement';
import { projects, workPackages } from './projects';
import { organizations } from './tenancy';
import { vendors } from './vendors';

/**
 * Field operations, assets/fleet/maintenance, and inventory foundations (Wave 3).
 * Maintenance cost_amount is operational metadata — not an Expense posting.
 * Inventory quantity tracking is not GL and not Expense.
 */

export const dailyLogs = pgTable(
  'daily_logs',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    logDate: date('log_date', { mode: 'string' }).notNull(),
    weather: text('weather'),
    summary: text('summary').notNull(),
    workforceNotes: text('workforce_notes'),
    status: text('status').notNull().default('draft'),
    workPerformed: text('work_performed'),
    delays: text('delays'),
    incidents: text('incidents'),
    safetyNotes: text('safety_notes'),
    visitorNotes: text('visitor_notes'),
    managerNotes: text('manager_notes'),
    workersOnSite: text('workers_on_site'),
    subcontractorsOnSite: text('subcontractors_on_site'),
    equipmentOnSite: text('equipment_on_site'),
    deliveries: text('deliveries'),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
    submittedByUserId: uuid('submitted_by_user_id'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'date' }),
    correctionNotes: text('correction_notes'),
    linkedSafetyRecordId: uuid('linked_safety_record_id'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('daily_logs_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('daily_logs_project_date_active_uq')
      .on(table.organizationId, table.projectId, table.logDate)
      .where(sql`${table.archivedAt} is null`),
    index('daily_logs_project_date_idx').on(table.projectId, table.logDate),
    check(
      'daily_logs_status_known',
      sql`${table.status} IN ('draft', 'submitted', 'finalized')`,
    ),
  ],
);

export const punchListItems = pgTable(
  'punch_list_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('normal'),
    location: text('location'),
    dueDate: date('due_date', { mode: 'string' }),
    assigneeEmployeeId: uuid('assignee_employee_id'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('punch_list_items_project_idx').on(table.projectId),
    check(
      'punch_list_items_status_known',
      sql`${table.status} IN ('open', 'in_progress', 'done', 'cancelled')`,
    ),
    check(
      'punch_list_items_priority_known',
      sql`${table.priority} IN ('low', 'normal', 'high', 'critical')`,
    ),
  ],
);

export const inspections = pgTable(
  'inspections',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workPackageId: uuid('work_package_id').references(() => workPackages.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('general'),
    status: text('status').notNull().default('scheduled'),
    scheduledOn: date('scheduled_on', { mode: 'string' }),
    completedOn: date('completed_on', { mode: 'string' }),
    result: text('result'),
    notes: text('notes'),
    inspectorEmployeeId: uuid('inspector_employee_id'),
    formTemplateId: uuid('form_template_id'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('inspections_project_idx').on(table.projectId),
    check(
      'inspections_status_known',
      sql`${table.status} IN ('scheduled', 'in_progress', 'passed', 'failed', 'cancelled')`,
    ),
  ],
);

export const assets = pgTable(
  'assets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    assetKind: text('asset_kind').notNull().default('equipment'),
    status: text('status').notNull().default('active'),
    identifier: text('identifier'),
    manufacturer: text('manufacturer'),
    model: text('model'),
    serialNumber: text('serial_number'),
    assignedProjectId: uuid('assigned_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('assets_id_organization_id_uq').on(table.id, table.organizationId),
    index('assets_org_idx').on(table.organizationId),
    check(
      'assets_kind_known',
      sql`${table.assetKind} IN ('equipment', 'vehicle', 'tool', 'other')`,
    ),
    check(
      'assets_status_known',
      sql`${table.status} IN ('active', 'in_maintenance', 'retired', 'disposed')`,
    ),
  ],
);

export const fleetVehicles = pgTable(
  'fleet_vehicles',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    plateNumber: text('plate_number'),
    vin: text('vin'),
    odometer: quantityAmount('odometer'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('fleet_vehicles_org_idx').on(table.organizationId),
    uniqueIndex('fleet_vehicles_asset_uq').on(table.assetId),
  ],
);

export const maintenanceRecords = pgTable(
  'maintenance_records',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('planned'),
    performedOn: date('performed_on', { mode: 'string' }),
    costAmount: moneyAmount('cost_amount'),
    currency: currencyCode(),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('maintenance_records_asset_idx').on(table.assetId),
    check(
      'maintenance_records_status_known',
      sql`${table.status} IN ('planned', 'in_progress', 'completed', 'cancelled')`,
    ),
  ],
);

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    materialItemId: uuid('material_item_id').references(() => materialItems.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    unit: text('unit').notNull().default('ea'),
    quantityOnHand: quantityAmount('quantity_on_hand').notNull().default('0'),
    reorderLevel: quantityAmount('reorder_level'),
    minStockLevel: quantityAmount('min_stock_level'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_items_id_organization_id_uq').on(table.id, table.organizationId),
    index('inventory_items_org_idx').on(table.organizationId),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    movementType: text('movement_type').notNull(),
    quantity: quantityAmount('quantity').notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    fromLocationId: uuid('from_location_id'),
    toLocationId: uuid('to_location_id'),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    index('inventory_movements_item_idx').on(table.inventoryItemId),
    check(
      'inventory_movements_type_known',
      sql`${table.movementType} IN ('receive', 'issue', 'adjust', 'return', 'transfer')`,
    ),
  ],
);

export const inventoryLocations = pgTable(
  'inventory_locations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    locationKind: text('location_kind').notNull().default('warehouse'),
    projectId: uuid('project_id'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_locations_id_organization_id_uq').on(table.id, table.organizationId),
    uniqueIndex('inventory_locations_org_name_uq')
      .on(table.organizationId, table.name)
      .where(sql`${table.archivedAt} is null`),
    check(
      'inventory_locations_kind_known',
      sql`${table.locationKind} IN ('warehouse', 'site', 'vehicle')`,
    ),
    foreignKey({
      name: 'inventory_locations_project_org_fk',
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete('set null'),
  ],
);

export const inventoryLocationBalances = pgTable(
  'inventory_location_balances',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid('inventory_item_id').notNull(),
    locationId: uuid('location_id').notNull(),
    quantity: quantityAmount('quantity').notNull().default('0'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('inventory_location_balances_item_loc_uq').on(table.inventoryItemId, table.locationId),
  ],
);
