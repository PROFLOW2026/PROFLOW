/** Public API of the API / webhook platform foundation (doc 32). */
export {
  createApiClient,
  createApiKey,
  revokeApiKey,
  listApiPlatform,
  registerWebhookEndpoint,
  enqueueWebhookDelivery,
} from './application/manage-api';
export { authenticateApiKey, resolveApiWhoami } from './application/authenticate-api-key';
export {
  assertApiKeyHasScope,
  assertApiKeyHasAnyScope,
} from './application/assert-api-scope';

export {
  API_CLIENT_STATUSES,
  WEBHOOK_ENDPOINT_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
  API_KEY_SCOPES,
} from './domain/types';
export type {
  ApiClientStatus,
  WebhookEndpointStatus,
  WebhookDeliveryStatus,
  ApiKeyScope,
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
  generateApiKeyMaterial,
  generateWebhookSecretMaterial,
  extractKeyPrefix,
  API_KEY_PREFIX_LENGTH,
} from './domain/api-key';

export {
  createApiClientSchema,
  createApiKeySchema,
  revokeApiKeySchema,
  registerWebhookSchema,
  enqueueDeliverySchema,
} from './validation/schemas';
export type {
  CreateApiClientInput,
  CreateApiKeyInput,
  RevokeApiKeyInput,
  RegisterWebhookInput,
  EnqueueDeliveryInput,
} from './validation/schemas';
