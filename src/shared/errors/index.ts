/**
 * Application error vocabulary + server-action UI mapping.
 *
 * Domain/application layers throw AppError subclasses (see app-error.ts).
 * Server actions use mapServerActionError so English AppError.message never
 * reaches the client when a messageKey or errors.* fallback exists.
 */

export {
  AppError,
  AuthenticationRequiredError,
  AuthorizationError,
  OrganizationContextRequiredError,
  NotFoundError,
  ValidationError,
  ConflictError,
  DomainRuleError,
  ServiceUnavailableError,
  isAppError,
  serializeError,
  type AppErrorCode,
  type ValidationIssue,
  type SerializedError,
} from './app-error';

export {
  mapServerActionError,
  mapServerActionErrorMessage,
  translateMessageKey,
  isMappableServerActionError,
  type MessageTranslator,
  type MapServerActionErrorOptions,
  type MappedServerActionError,
} from './map-server-action-error';
