/**
 * Detect dotted i18n keys embedded in Zod `.message` / ValidationIssue.message.
 * Keeps English literals from leaking when callers forgot explicit messageKey.
 */
export function inferMessageKey(raw: string): string | null {
  const message = raw.trim();
  if (!message) return null;

  if (message.startsWith('errors.') || message.startsWith('validation.')) {
    return message;
  }

  // e.g. assets.errors.foo, workforce.errors.bar, externalStorage.errors.quotaFull
  if (/^[a-z][a-z0-9_-]*(\.[a-zA-Z][\w.-]*)+$/.test(message) && !/\s/.test(message)) {
    return message;
  }

  return null;
}
