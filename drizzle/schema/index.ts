/**
 * Single Drizzle schema entry point.
 *
 * Ownership: Lead / Integrator only (doc 76 §1). Feature modules read these
 * tables through their own `data/` repositories but never add or alter tables
 * here without the migration going through the Lead.
 *
 * Server-only: a client import of this barrel is a bundle leak (ORM table
 * definitions in the browser). Keep schema behind repositories / 'use server'.
 */
import 'server-only';

export * from './enums';
export * from './identity';
export * from './tenancy';
export * from './branding';
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
export * from './billing-plans';
export * from './tax';
export * from './crm';
export * from './portal';
export * from './compliance';
export * from './custom-fields';
export * from './business-catalog';
export * from './api-platform';
export * from './procurement';
export * from './field-ops';
export * from './ap';
export * from './banking';
export * from './planning';
export * from './ocr';
export * from './ops-finance';
export * from './invoicing-integration';
export * from './next-gen';
export * from './next-gen-ops';
export * from './next-gen-experience';
export * from './boq';
export * from './platform-ops';
