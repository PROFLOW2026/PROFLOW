/**
 * Application error vocabulary.
 *
 * Framework-free on purpose: the domain and application layers throw these, and
 * only the outermost Next.js boundary decides how to turn them into an HTTP
 * status or a rendered message.
 *
 * `messageKey` is an i18n key so errors surface in Hebrew without any layer
 * below the UI knowing about locales.
 */

export type AppErrorCode =
  | 'authentication_required'
  | 'authorization_denied'
  | 'organization_context_required'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'domain_rule_violated'
  | 'unavailable';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly messageKey: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    status: number,
    message: string,
    messageKey: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.messageKey = messageKey;
    this.details = details;
  }
}

export class AuthenticationRequiredError extends AppError {
  constructor(message = 'Authentication is required') {
    super('authentication_required', 401, message, 'errors.authenticationRequired');
  }
}

/**
 * Deliberately does not reveal whether the resource exists — an attacker
 * probing another tenant learns nothing from the difference.
 */
export class AuthorizationError extends AppError {
  constructor(permission?: string) {
    super(
      'authorization_denied',
      403,
      permission ? `Missing permission: ${permission}` : 'Not allowed',
      'errors.notAllowed',
      permission ? { permission } : undefined,
    );
  }
}

export class OrganizationContextRequiredError extends AppError {
  constructor() {
    super(
      'organization_context_required',
      409,
      'No active organization selected',
      'errors.organizationContextRequired',
    );
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('not_found', 404, `${resource} not found`, 'errors.notFound', { resource });
  }
}

export interface ValidationIssue {
  readonly path: string;
  readonly messageKey?: string;
  readonly message: string;
}

export class ValidationError extends AppError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[], message = 'Validation failed') {
    super('validation_failed', 422, message, 'errors.validationFailed', { issues });
    this.issues = issues;
  }
}

export class ConflictError extends AppError {
  constructor(message: string, messageKey = 'errors.conflict', details?: Record<string, unknown>) {
    super('conflict', 409, message, messageKey, details);
  }
}

/** A business rule refused the operation — for example editing a finalized record. */
export class DomainRuleError extends AppError {
  constructor(message: string, messageKey: string, details?: Record<string, unknown>) {
    super('domain_rule_violated', 422, message, messageKey, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, messageKey = 'errors.serviceUnavailable') {
    super('unavailable', 503, message, messageKey);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Shape safe to send to the browser: never leaks stack traces or SQL. */
export interface SerializedError {
  readonly code: AppErrorCode | 'unexpected';
  readonly messageKey: string;
  readonly issues?: readonly ValidationIssue[];
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof ValidationError) {
    return { code: error.code, messageKey: error.messageKey, issues: error.issues };
  }
  if (isAppError(error)) {
    return { code: error.code, messageKey: error.messageKey };
  }
  return { code: 'unexpected', messageKey: 'errors.unexpected' };
}
