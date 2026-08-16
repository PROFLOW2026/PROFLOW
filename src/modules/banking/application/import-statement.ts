import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getBankingRepository } from '../data/banking.repository';
import {
  detectBankImportDuplicates,
  isDuplicateRow,
} from '../domain/duplicates';
import { bankTransactionFingerprint } from '../domain/fingerprint';
import { parseBankStatementCsv } from '../domain/parse-statement';
import { areBankingPersistenceAvailable } from '../domain/persistence';
import type { BankImportBatch, BankTransaction } from '../domain/types';
import {
  importBankStatementSchema,
  type ImportBankStatementInput,
} from '../validation/schemas';

export interface ImportBankStatementResult {
  readonly batch: BankImportBatch;
  readonly imported: readonly BankTransaction[];
  readonly skippedDuplicates: number;
  readonly invalidRows: number;
  /** Always false - import never writes payments/bills/expenses. */
  readonly financialMutationPerformed: false;
}

function assertBankingSchemaReady(): void {
  if (!areBankingPersistenceAvailable()) {
    throw new DomainRuleError(
      'Banking schema is not available yet',
      'banking.errors.schemaPending',
    );
  }
}

/**
 * Import CSV/XLSX-normalized statement text. Skips duplicate fingerprints.
 * Does not create payments, bills, expenses, or project costs.
 * Durable via Drizzle when BANKING_PERSISTENCE_READY is true (no live feed).
 */
export async function importBankStatement(
  context: OrgContext,
  raw: ImportBankStatementInput,
): Promise<ImportBankStatementResult> {
  assertPermission(context, PERMISSIONS.BANKING_MANAGE);
  assertBankingSchemaReady();
  const input = importBankStatementSchema.parse(raw);
  const repo = getBankingRepository();
  const account = await repo.findAccount(context.db, context.organizationId, input.bankAccountId);
  if (!account) throw new NotFoundError('Bank account');
  if (account.status !== 'active') {
    throw new DomainRuleError(
      'Cannot import into an archived bank account',
      'banking.errors.accountArchived',
    );
  }

  const parsed = parseBankStatementCsv({
    csvText: input.csvText,
    currency: account.currency,
  });

  const validRows = parsed.rows.filter((row) => row.issues.length === 0);
  const invalidRows = parsed.rows.length - validRows.length;

  const existing = await repo.listTransactions(context.db, context.organizationId, {
    bankAccountId: account.id,
  });
  const dupHits = detectBankImportDuplicates({
    bankAccountId: account.id,
    rows: validRows.map((row) => ({
      rowNumber: row.rowNumber,
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      description: row.description,
      reference: row.reference,
    })),
    existing,
  });

  const toInsert = validRows.filter((row) => !isDuplicateRow(dupHits, row.rowNumber));

  const batch = await repo.createImportBatch(context.db, {
    organizationId: context.organizationId,
    bankAccountId: account.id,
    source: input.source,
    fileName: input.fileName ?? null,
    rowCount: parsed.rows.length,
    importedCount: toInsert.length,
    duplicateCount: dupHits.length,
  });

  const imported = await repo.insertTransactions(
    context.db,
    toInsert.map((row) => ({
      organizationId: context.organizationId,
      bankAccountId: account.id,
      date: row.date,
      valueDate: row.valueDate,
      description: row.description,
      amount: row.amount,
      currency: account.currency,
      direction: row.direction,
      reference: row.reference,
      source: input.source,
      fingerprint: bankTransactionFingerprint({
        bankAccountId: account.id,
        date: row.date,
        amount: row.amount,
        direction: row.direction,
        description: row.description,
        reference: row.reference,
      }),
      matchStatus: 'unmatched',
      importBatchId: batch.id,
    })),
  );

  return {
    batch,
    imported,
    skippedDuplicates: dupHits.length,
    invalidRows,
    financialMutationPerformed: false,
  };
}
