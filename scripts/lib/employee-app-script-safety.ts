/**
 * Guards against accidental production employee credential mutations from scripts.
 */

export const PROD_CREDENTIAL_RESET_FLAG = '--allow-prod-credential-reset';

export function hasProdCredentialResetFlag(argv: readonly string[] = process.argv): boolean {
  return argv.includes(PROD_CREDENTIAL_RESET_FLAG);
}

/** True when the active script targets the production database. */
export function isProductionCredentialTarget(): boolean {
  if (process.env.APP_ENV?.trim() === 'production') return true;
  const dbUrl = process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? '';
  return /supabase\.com|pooler\.supabase/.test(dbUrl);
}

export function assertProdCredentialResetAllowed(scriptName: string, action: string): void {
  if (!isProductionCredentialTarget()) return;
  if (hasProdCredentialResetFlag()) return;
  throw new Error(
    [
      `Refusing ${action} in ${scriptName}.`,
      `Production employee credential mutations are blocked by default.`,
      `Pass ${PROD_CREDENTIAL_RESET_FLAG} only for a dedicated test employee — never real staff accounts.`,
    ].join(' '),
  );
}

export function warnProdCredentialReset(scriptName: string, action: string): void {
  console.warn('');
  console.warn('⚠️  PRODUCTION EMPLOYEE CREDENTIAL MUTATION');
  console.warn(`    script: ${scriptName}`);
  console.warn(`    action: ${action}`);
  console.warn(`    flag:   ${PROD_CREDENTIAL_RESET_FLAG} was provided`);
  console.warn('');
}

export function requireProdCredentialResetFlag(scriptName: string, action: string): void {
  assertProdCredentialResetAllowed(scriptName, action);
  if (isProductionCredentialTarget() && hasProdCredentialResetFlag()) {
    warnProdCredentialReset(scriptName, action);
  }
}

export function resolveSmokeUsername(label = 'EMPLOYEE_APP_SMOKE_USERNAME'): string {
  const username = process.env.EMPLOYEE_APP_SMOKE_USERNAME?.trim();
  if (!username) {
    throw new Error(
      `Set ${label} to a dedicated test employee username (never a real production employee).`,
    );
  }
  return username;
}

export function resolveOptionalSmokeUsername(): string | null {
  return process.env.EMPLOYEE_APP_SMOKE_USERNAME?.trim() || null;
}
