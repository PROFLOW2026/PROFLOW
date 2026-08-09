import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { taxRules } from '@drizzle/schema';
import { businessDate, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type { TaxRuleRecord } from '../domain/types';

function mapRow(row: {
  id: string;
  organizationId: string | null;
  countryCode: string;
  key: string;
  name: string;
  method: 'percentage' | 'exempt' | 'zero_rated';
  ratePercent: string | null;
  validFrom: string;
  validTo: string | null;
  isDefault: boolean;
}): TaxRuleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    countryCode: row.countryCode,
    key: row.key,
    name: row.name,
    method: row.method,
    ratePercent: row.ratePercent,
    validFrom: businessDate(row.validFrom),
    validTo: row.validTo ? businessDate(row.validTo) : null,
    isDefault: row.isDefault,
  };
}

/** Country-pack rules plus organization overrides for the org's country. */
export async function listTaxRulesForOrganization(
  db: DbExecutor,
  organizationId: string,
  countryCode: string,
): Promise<TaxRuleRecord[]> {
  const rows = await db
    .select({
      id: taxRules.id,
      organizationId: taxRules.organizationId,
      countryCode: taxRules.countryCode,
      key: taxRules.key,
      name: taxRules.name,
      method: taxRules.method,
      ratePercent: taxRules.ratePercent,
      validFrom: taxRules.validFrom,
      validTo: taxRules.validTo,
      isDefault: taxRules.isDefault,
    })
    .from(taxRules)
    .where(
      or(
        and(isNull(taxRules.organizationId), eq(taxRules.countryCode, countryCode)),
        eq(taxRules.organizationId, organizationId),
      ),
    )
    .orderBy(desc(taxRules.validFrom));

  return rows.map(mapRow);
}

export async function findTaxRuleById(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
): Promise<TaxRuleRecord | null> {
  const [row] = await db
    .select({
      id: taxRules.id,
      organizationId: taxRules.organizationId,
      countryCode: taxRules.countryCode,
      key: taxRules.key,
      name: taxRules.name,
      method: taxRules.method,
      ratePercent: taxRules.ratePercent,
      validFrom: taxRules.validFrom,
      validTo: taxRules.validTo,
      isDefault: taxRules.isDefault,
    })
    .from(taxRules)
    .where(and(eq(taxRules.id, ruleId), eq(taxRules.organizationId, organizationId)))
    .limit(1);

  return row ? mapRow(row) : null;
}

export interface TaxRuleInsert {
  readonly organizationId: string;
  readonly countryCode: string;
  readonly key: string;
  readonly name: string;
  readonly method: 'percentage' | 'exempt' | 'zero_rated';
  readonly ratePercent: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate | null;
  readonly isDefault: boolean;
}

export async function insertOrgTaxRule(db: DbExecutor, input: TaxRuleInsert): Promise<TaxRuleRecord> {
  const [row] = await db
    .insert(taxRules)
    .values({
      organizationId: input.organizationId,
      countryCode: input.countryCode,
      key: input.key,
      name: input.name,
      method: input.method,
      ratePercent: input.ratePercent,
      validFrom: input.validFrom,
      validTo: input.validTo,
      isDefault: input.isDefault,
    })
    .returning({
      id: taxRules.id,
      organizationId: taxRules.organizationId,
      countryCode: taxRules.countryCode,
      key: taxRules.key,
      name: taxRules.name,
      method: taxRules.method,
      ratePercent: taxRules.ratePercent,
      validFrom: taxRules.validFrom,
      validTo: taxRules.validTo,
      isDefault: taxRules.isDefault,
    });

  return mapRow(row!);
}

export interface TaxRuleUpdate {
  readonly name?: string;
  readonly ratePercent?: string | null;
  readonly validFrom?: BusinessDate;
  readonly validTo?: BusinessDate | null;
  readonly isDefault?: boolean;
}

export async function updateOrgTaxRule(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
  patch: TaxRuleUpdate,
): Promise<TaxRuleRecord | null> {
  const [row] = await db
    .update(taxRules)
    .set(patch)
    .where(and(eq(taxRules.id, ruleId), eq(taxRules.organizationId, organizationId)))
    .returning({
      id: taxRules.id,
      organizationId: taxRules.organizationId,
      countryCode: taxRules.countryCode,
      key: taxRules.key,
      name: taxRules.name,
      method: taxRules.method,
      ratePercent: taxRules.ratePercent,
      validFrom: taxRules.validFrom,
      validTo: taxRules.validTo,
      isDefault: taxRules.isDefault,
    });

  return row ? mapRow(row) : null;
}
