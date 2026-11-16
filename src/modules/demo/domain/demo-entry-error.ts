export const DEMO_ENTRY_ERROR_CODES = [
  'rateLimited',
  'disabled',
  'invalidChoice',
  'notConfigured',
  'signInUnsafe',
  'failed',
] as const;

export type DemoEntryErrorCode = (typeof DEMO_ENTRY_ERROR_CODES)[number];

export function isDemoEntryErrorCode(value: string): value is DemoEntryErrorCode {
  return (DEMO_ENTRY_ERROR_CODES as readonly string[]).includes(value);
}
