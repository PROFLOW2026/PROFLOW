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
export * from './external-storage';
export * from './clients';
export * from './vendors';
export * from './projects';
export * from './contracts';
export * from './changes';
export * from './expenses';
export * from './workforce';
export * from './employee-app';
export * from './billing';
export * from './billing-plans';
export * from './tax';
export * from './crm';
export * from './portal';
export * from './connected-projects';
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
export * from './expense-ingestion';
export * from './quick-capture';
export * from './next-gen';
export * from './next-gen-ops';
export * from './next-gen-experience';
export * from './boq';
export * from './platform-ops';
export * from './notification-badge';
export * from './true-cost';
export * from './owner-financial';
export * from './payment-instruments';
export * from './workspaces';
export * from './tasks';
export * from './margin-snapshots';
export * from './material-market';
export * from './project-team';
export * from './dg-foundation';
export * from './dg-external-identity';
export * from './dg-project-profile';
export * from './dg-subcontract';
export * from './dg-claims';
export * from './dg-collaboration';
export * from './dg-coordination';
export * from './dg-documents-plans';
export * from './dg-rfi-submittals';
export * from './dg-quality';
export * from './dg-field';
export * from './dg-compliance-safety';
export * from './dg-procurement-closeout';
export * from './dg-notifications';
export * from './dg-surfaces';
export * from './connected-projects';

