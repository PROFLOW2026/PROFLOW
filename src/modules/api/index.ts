/** Public API of the API / webhook platform foundation (doc 32). */
export {
  createApiClient,
  createApiKey,
  revokeApiKey,
  rotateApiKey,
  listApiPlatform,
  registerWebhookEndpoint,
  revokeWebhookEndpoint,
  rotateWebhookSecret,
  enqueueWebhookDelivery,
  recordWebhookDeliveryAttempt,
  prepareSignedWebhookDelivery,
} from './application/manage-api';
export { authenticateApiKey, resolveApiWhoami } from './application/authenticate-api-key';
export {
  assertApiKeyHasScope,
  assertApiKeyHasAnyScope,
} from './application/assert-api-scope';
export { withApiKeyOrgContext } from './application/with-api-key-context';

export {
  API_CLIENT_STATUSES,
  WEBHOOK_ENDPOINT_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
  API_KEY_SCOPES,
  WEBHOOK_EVENT_TYPES,
} from './domain/types';
export type {
  ApiClientStatus,
  WebhookEndpointStatus,
  WebhookDeliveryStatus,
  ApiKeyScope,
  WebhookEventType,
  ApiClientRecord,
  ApiKeyRecord,
  ApiKeyListItem,
  WebhookEndpointRecord,
  WebhookEndpointListItem,
  WebhookDeliveryRecord,
  AuthenticatedApiKey,
} from './domain/types';

export {
  hashSecret,
  secretsEqual,
  isSha256HexDigest,
  generateApiKeyMaterial,
  generateWebhookSecretMaterial,
  extractKeyPrefix,
  looksLikeApiKey,
  API_KEY_PREFIX_LENGTH,
} from './domain/api-key';

export {
  isAllowedWebhookEventType,
  assertAllowedWebhookEventType,
} from './domain/webhook-events';

export {
  validateWebhookEndpointUrl,
  isPrivateOrLocalIpv4,
  isPrivateOrLocalIpv6,
  isLoopbackHost,
} from './domain/webhook-url';

export {
  MAX_WEBHOOK_DELIVERY_ATTEMPTS,
  isTerminalDeliveryStatus,
  canTransitionDeliveryStatus,
  assertDeliveryStatusTransition,
  applyDeliveryAttempt,
  scheduleDeliveryRetry,
  initialDeliveryState,
  formatDeliveryAttemptError,
  parseDeliveryHttpStatus,
} from './domain/delivery-state';

export {
  permissionForApiScope,
  permissionsForApiScopes,
  apiScopesArePermissionEquivalent,
} from './domain/scope-permissions';

export {
  createWebhookEventId,
  isWebhookEventId,
  buildWebhookEventEnvelope,
  extractWebhookEventId,
  serializeWebhookEventBody,
} from './domain/webhook-envelope';
export type { WebhookEventEnvelope } from './domain/webhook-envelope';

export {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_EVENT_ID_HEADER,
  DEFAULT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
  signWebhookPayload,
  formatWebhookSignatureHeader,
  parseWebhookSignatureHeader,
  buildWebhookSignatureHeaders,
  verifyWebhookSignature,
  verifyWebhookSecretMatchesHash,
} from './domain/webhook-signature';

export {
  WEBHOOK_SECRET_SEAL_PREFIX,
  deriveWebhookSecretKek,
  isSealedWebhookSecret,
  sealWebhookSecret,
  openWebhookSecret,
  webhookSecretMatchesStored,
} from './domain/webhook-secret-seal';

export {
  createApiClientSchema,
  createApiKeySchema,
  revokeApiKeySchema,
  rotateApiKeySchema,
  registerWebhookSchema,
  revokeWebhookSchema,
  rotateWebhookSecretSchema,
  enqueueDeliverySchema,
  recordDeliveryAttemptSchema,
} from './validation/schemas';
export type {
  CreateApiClientInput,
  CreateApiKeyInput,
  RevokeApiKeyInput,
  RotateApiKeyInput,
  RegisterWebhookInput,
  RevokeWebhookInput,
  RotateWebhookSecretInput,
  EnqueueDeliveryInput,
  RecordDeliveryAttemptInput,
} from './validation/schemas';

export {
  API_VERSION,
  apiSuccess,
  apiError,
  apiErrorCode,
} from './http/api-response';
export type { ApiErrorBody } from './http/api-response';

export {
  API_DEFAULT_PAGE_SIZE,
  API_MAX_PAGE_SIZE,
  parseApiPagination,
  nextCursorFromItems,
} from './http/pagination';
export type { ApiPaginationInput, ApiPage } from './http/pagination';

export { extractBearerToken, requireApiKeyAuth } from './http/bearer';
export { assertNoClientOrganizationOverride } from './http/tenant-guard';
