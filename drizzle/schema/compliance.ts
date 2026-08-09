import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { documents } from './documents';
import { organizations } from './tenancy';

/**
 * Insurance / licenses / certifications (doc 24).
 * Expiry/status in UI only — no notification delivery (doc 26 deferred).
 */

export const complianceArtifacts = pgTable(
  'compliance_artifacts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    artifactKind: text('artifact_kind').notNull(),
    name: text('name').notNull(),
    referenceNumber: text('reference_number'),
    issuer: text('issuer'),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    status: text('status').notNull().default('valid'),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id'),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('compliance_artifacts_org_idx').on(table.organizationId),
    index('compliance_artifacts_expires_idx').on(table.organizationId, table.expiresOn),
    check(
      'compliance_artifacts_kind_known',
      sql`${table.artifactKind} IN ('insurance', 'license', 'certification', 'other')`,
    ),
    check(
      'compliance_artifacts_status_known',
      sql`${table.status} IN ('valid', 'expiring_soon', 'expired', 'revoked', 'pending')`,
    ),
    check(
      'compliance_artifacts_subject_known',
      sql`${table.subjectType} IN ('organization', 'employee', 'vendor', 'project')`,
    ),
  ],
);
