import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { generateApiKeyMaterial, generateWebhookSecretMaterial } from '../domain/api-key';
import type {
  ApiClientRecord,
  ApiKeyListItem,
  WebhookDeliveryRecord,
  WebhookEndpointListItem,
} from '../domain/types';
import {
  findApiClientById,
  findWebhookEndpointById,
  insertApiClient,
  insertApiKey,
  insertWebhookDelivery,
  insertWebhookEndpoint,
  listApiClients,
  listApiKeysForOrg,
  listWebhookDeliveries,
  listWebhookEndpoints,
  revokeApiKeyById,
} from '../data/api.repository';
import {
  createApiClientSchema,
  createApiKeySchema,
  enqueueDeliverySchema,
  registerWebhookSchema,
  revokeApiKeySchema,
  type CreateApiClientInput,
  type CreateApiKeyInput,
  type EnqueueDeliveryInput,
  type RegisterWebhookInput,
  type RevokeApiKeyInput,
} from '../validation/schemas';

export async function createApiClient(
  context: OrgContext,
  rawInput: CreateApiClientInput,
): Promise<ApiClientRecord> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = createApiClientSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const client = await insertApiClient(context.db, {
    organizationId: context.organizationId,
    name: parsed.data.name,
  });

  await noteModuleUsage(context.db, context.organizationId, 'api');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.API_CLIENT_CREATED,
    entityType: 'api_client',
    entityId: client.id,
    after: { name: client.name, status: client.status },
  });

  return client;
}

export async function createApiKey(
  context: OrgContext,
  rawInput: CreateApiKeyInput,
): Promise<{ key: ApiKeyListItem; plaintext: string }> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = createApiKeySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const client = await findApiClientById(context.db, context.organizationId, input.apiClientId);
  if (!client || client.status !== 'active') throw new NotFoundError('API client');

  const material = generateApiKeyMaterial();
  const key = await insertApiKey(context.db, {
    organizationId: context.organizationId,
    apiClientId: input.apiClientId,
    name: input.name,
    keyPrefix: material.keyPrefix,
    keyHash: material.keyHash,
    scopes: input.scopes,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'api');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.API_KEY_CREATED,
    entityType: 'api_key',
    entityId: key.id,
    after: {
      apiClientId: key.apiClientId,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
    },
  });

  const { keyHash: _hash, ...listItem } = key;
  return { key: listItem, plaintext: material.plaintext };
}

export async function revokeApiKey(
  context: OrgContext,
  rawInput: RevokeApiKeyInput,
): Promise<ApiKeyListItem> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = revokeApiKeySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const revoked = await revokeApiKeyById(context.db, context.organizationId, parsed.data.keyId);
  if (!revoked) throw new NotFoundError('API key');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.API_KEY_REVOKED,
    entityType: 'api_key',
    entityId: revoked.id,
    after: { revokedAt: revoked.revokedAt, keyPrefix: revoked.keyPrefix },
  });

  return revoked;
}

export async function listApiPlatform(
  context: OrgContext,
): Promise<{
  clients: ApiClientRecord[];
  keys: ApiKeyListItem[];
  endpoints: WebhookEndpointListItem[];
  deliveries: WebhookDeliveryRecord[];
}> {
  assertPermission(context, PERMISSIONS.API_MANAGE);
  const [clients, keys, endpoints, deliveries] = await Promise.all([
    listApiClients(context.db, context.organizationId),
    listApiKeysForOrg(context.db, context.organizationId),
    listWebhookEndpoints(context.db, context.organizationId),
    listWebhookDeliveries(context.db, context.organizationId, 25),
  ]);
  return { clients, keys, endpoints, deliveries };
}

export async function registerWebhookEndpoint(
  context: OrgContext,
  rawInput: RegisterWebhookInput,
): Promise<{ endpoint: WebhookEndpointListItem; plaintextSecret: string }> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = registerWebhookSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const material = generateWebhookSecretMaterial();
  const endpoint = await insertWebhookEndpoint(context.db, {
    organizationId: context.organizationId,
    url: parsed.data.url,
    secretHash: material.secretHash,
    eventTypes: parsed.data.eventTypes,
  });

  await noteModuleUsage(context.db, context.organizationId, 'api');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WEBHOOK_ENDPOINT_CREATED,
    entityType: 'webhook_endpoint',
    entityId: endpoint.id,
    after: { url: endpoint.url, eventTypes: endpoint.eventTypes },
  });

  const { secretHash: _secret, ...listItem } = endpoint;
  return { endpoint: listItem, plaintextSecret: material.plaintext };
}

/**
 * Records a pending delivery row. No HTTP fan-out in this foundation.
 */
export async function enqueueWebhookDelivery(
  context: OrgContext,
  rawInput: EnqueueDeliveryInput,
): Promise<WebhookDeliveryRecord> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = enqueueDeliverySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const endpoint = await findWebhookEndpointById(
    context.db,
    context.organizationId,
    parsed.data.endpointId,
  );
  if (!endpoint || endpoint.status !== 'active') throw new NotFoundError('Webhook endpoint');

  return insertWebhookDelivery(context.db, {
    organizationId: context.organizationId,
    endpointId: parsed.data.endpointId,
    eventType: parsed.data.eventType,
    payload: parsed.data.payload,
    status: 'pending',
  });
}
