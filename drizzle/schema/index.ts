/**
 * Single Drizzle schema entry point.
 *
 * Ownership: Lead / Integrator only (doc 76 §1). Feature modules read these
 * tables through their own `data/` repositories but never add or alter tables
 * here without the migration going through the Lead.
 */

export * from './enums';
export * from './identity';
export * from './tenancy';
export * from './rbac';
export * from './audit';
export * from './documents';
export * from './clients';
export * from './vendors';
export * from './projects';
export * from './contracts';
export * from './changes';
export * from './expenses';
export * from './workforce';
export * from './billing';
export * from './tax';
export * from './crm';
export * from './portal';
export * from './compliance';
export * from './custom-fields';
export * from './api-platform';
