/** Postgres check_violation. Migration 0130 adds vendor_root and employee_root; until it is applied those inserts fail this constraint. */
const CHECK_VIOLATION = '23514';

function walkErrorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

export function isSemanticFolderCheckViolation(error: unknown): boolean {
  for (const current of walkErrorChain(error)) {
    const code = (current as { code?: unknown }).code;
    if (code === CHECK_VIOLATION) return true;
    const message = (current as { message?: unknown }).message;
    if (
      typeof message === 'string' &&
      message.includes('storage_folder_mappings_semantic_known')
    ) {
      return true;
    }
  }
  return false;
}
