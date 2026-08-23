import type { AppError } from './app-error';
import {
  AuthorizationError,
  DomainRuleError,
  ValidationError,
  isAppError,
} from './app-error';

/** next-intl (or compatible) translator: key → localized string. */
export type MessageTranslator = (key: string) => string;

export interface MapServerActionErrorOptions {
  /** Translator for the `errors` namespace (keys without the `errors.` prefix). */
  readonly tErrors: MessageTranslator;
  /**
   * Domain translators keyed by messageKey namespace root.
   * For `assets.errors.foo`, calls `namespaces.assets('errors.foo')`.
   */
  readonly namespaces?: Readonly<Record<string, MessageTranslator>>;
  /**
   * Legacy field `issue.message` → localized override (e.g. DATE_ORDER_MESSAGE).
   * Prefer issue.messageKey when present; never use raw English as the primary form error.
   */
  readonly fieldMessageOverrides?: Readonly<Record<string, string>>;
  /**
   * When true (default), non-AppError values are rethrown.
   * When false, they map to `errors.unexpected`.
   */
  readonly rethrowUnknown?: boolean;
}

export interface MappedServerActionError {
  readonly error: string;
  readonly fieldErrors?: Record<string, string>;
}

function isUnresolvedTranslation(
  translated: string,
  key: string,
  fullMessageKey: string,
): boolean {
  if (!translated) return true;
  if (translated === key || translated === fullMessageKey) return true;
  if (translated.includes(fullMessageKey)) return true;
  return false;
}

/**
 * Attempt to resolve a dotted messageKey without ever returning AppError.message.
 * Returns null when no translator can resolve it.
 */
export function translateMessageKey(
  messageKey: string,
  options: Pick<MapServerActionErrorOptions, 'tErrors' | 'namespaces'>,
): string | null {
  if (!messageKey) return null;

  if (messageKey.startsWith('errors.')) {
    const short = messageKey.slice('errors.'.length);
    try {
      const translated = options.tErrors(short);
      if (!isUnresolvedTranslation(translated, short, messageKey)) return translated;
    } catch {
      /* fall through */
    }
    return null;
  }

  const dot = messageKey.indexOf('.');
  if (dot <= 0) return null;
  const root = messageKey.slice(0, dot);
  const rest = messageKey.slice(dot + 1);
  const tNs = options.namespaces?.[root];
  if (!tNs) return null;

  try {
    const translated = tNs(rest);
    if (!isUnresolvedTranslation(translated, rest, messageKey)) return translated;
  } catch {
    /* fall through */
  }
  return null;
}

function mapValidationFieldErrors(
  error: ValidationError,
  options: MapServerActionErrorOptions,
): Record<string, string> | undefined {
  const fieldErrors: Record<string, string> = {};
  const fallback = options.tErrors('validationFailed');

  for (const issue of error.issues) {
    if (!issue.path) continue;

    if (issue.messageKey) {
      fieldErrors[issue.path] =
        translateMessageKey(issue.messageKey, options) ?? fallback;
      continue;
    }

    const override = options.fieldMessageOverrides?.[issue.message];
    if (override) {
      fieldErrors[issue.path] = override;
      continue;
    }

    fieldErrors[issue.path] = fallback;
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

/**
 * Maps AppError / ValidationError / DomainRuleError to a UI-safe action state.
 *
 * Never returns English `AppError.message` when a messageKey or `errors.*`
 * fallback exists. Prefer domain namespace translation, then `errors.*`, then
 * `errors.unexpected` / `errors.validationFailed`.
 */
export function mapServerActionError(
  error: unknown,
  options: MapServerActionErrorOptions,
): MappedServerActionError {
  const rethrowUnknown = options.rethrowUnknown !== false;

  if (error instanceof ValidationError) {
    return {
      error: options.tErrors('validationFailed'),
      fieldErrors: mapValidationFieldErrors(error, options),
    };
  }

  if (error instanceof AuthorizationError) {
    return { error: options.tErrors('notAllowed') };
  }

  if (error instanceof DomainRuleError || isAppError(error)) {
    const translated = translateMessageKey(error.messageKey, options);
    if (translated) return { error: translated };

    if (error.messageKey.startsWith('errors.')) {
      return { error: options.tErrors('unexpected') };
    }

    // Known AppError codes with stable errors.* keys even if messageKey is odd.
    if (error.code === 'not_found') return { error: options.tErrors('notFound') };
    if (error.code === 'authentication_required') {
      return { error: options.tErrors('authenticationRequired') };
    }
    if (error.code === 'organization_context_required') {
      return { error: options.tErrors('organizationContextRequired') };
    }
    if (error.code === 'conflict') return { error: options.tErrors('conflict') };

    return { error: options.tErrors('unexpected') };
  }

  if (rethrowUnknown) throw error;
  return { error: options.tErrors('unexpected') };
}

/** Convenience: map and return only the localized error string. */
export function mapServerActionErrorMessage(
  error: unknown,
  options: MapServerActionErrorOptions,
): string {
  return mapServerActionError(error, options).error;
}

/** Type guard helper for callers that still branch before mapping. */
export function isMappableServerActionError(error: unknown): error is AppError {
  return isAppError(error);
}
