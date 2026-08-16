import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { generateApiKeyMaterial, generateWebhookSecretMaterial } from '../domain/api-key';
import {
  applyDeliveryAttempt,
  initialDeliveryState,
  type DeliveryAttemptState,
} from '../domain/delivery-state';
import { apiScopesArePermissionEquivalent } from '../domain/scope-permissions';
import {
  buildWebhookEventEnvelope,
  serializeWebhookEventBody,
} from '../domain/webhook-envelope';
import { isSealedWebhookSecret, openWebhookSecret, sealWebhookSecret } from '../domain/webhook-secret-seal';
import { buildWebhookSignatureHeaders } from '../domain/webhook-signature';
import { validateWebhookEndpointUrl } from '../domain/webhook-url';
import type {
  ApiClientRecord,
  ApiKeyListItem,
  WebhookDeliveryRecord,
  WebhookEndpointListItem,
} from '../domain/types';
import { API_KEY_SCOPES } from '../domain/types';
import {
  findApiClientById,
  findApiKeyById,
  findWebhookDeliveryByEventId,
  findWebhookDeliveryById,
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
  revokeWebhookEndpointById,
  updateWebhookDeliveryAttempt,
  updateWebhookEndpointSecret,
} from '../data/api.repository';
import { resolveWebhookSecretKek } from './webhook-kek';
import {
  createApiClientSchema,
  createApiKeySchema,
  enqueueDeliverySchema,
  recordDeliveryAttemptSchema,
  registerWebhookSchema,
  revokeApiKeySchema,
  revokeWebhookSchema,
  rotateApiKeySchema,
  rotateWebhookSecretSchema,
  type CreateApiClientInput,
  type CreateApiKeyInput,
  type EnqueueDeliveryInput,
  type RecordDeliveryAttemptInput,
  type RegisterWebhookInput,
  type RevokeApiKeyInput,
  type RevokeWebhookInput,
  type RotateApiKeyInput,
  type RotateWebhookSecretInput,
} from '../validation/schemas';

function sealedWebhookMaterial(plaintext: string): string {
  return sealWebhookSecret(plaintext, resolveWebhookSecretKek());
}

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
  if (!apiScopesArePermissionEquivalent(input.scopes)) {
    throw new ValidationError([{ path: 'scopes', message: 'Unknown API scope' }]);
  }

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

/**
 * Issues a replacement key with the same client/scopes, then revokes the old key.
 * Plaintext of the new key is returned once.
 */
export async function rotateApiKey(
  context: OrgContext,
  rawInput: RotateApiKeyInput,
): Promise<{ key: ApiKeyListItem; plaintext: string; revokedKeyId: string }> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = rotateApiKeySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findApiKeyById(context.db, context.organizationId, parsed.data.keyId);
  if (!existing || existing.revokedAt) throw new NotFoundError('API key');

  // Re-normalize scopes on rotate so legacy/unknown scopes cannot be re-issued.
  const scopes = existing.scopes.filter((scope) =>
    (API_KEY_SCOPES as readonly string[]).includes(scope),
  );
  if (!apiScopesArePermissionEquivalent(scopes)) {
    throw new DomainRuleError(
      'API key has no valid scopes to rotate',
      'errors.notAllowed',
    );
  }

  const client = await findApiClientById(context.db, context.organizationId, existing.apiClientId);
  if (!client || client.status !== 'active') throw new NotFoundError('API client');

  const material = generateApiKeyMaterial();
  const key = await insertApiKey(context.db, {
    organizationId: context.organizationId,
    apiClientId: existing.apiClientId,
    name: parsed.data.name ?? existing.name,
    keyPrefix: material.keyPrefix,
    keyHash: material.keyHash,
    scopes,
    expiresAt: existing.expiresAt,
  });

  const revoked = await revokeApiKeyById(context.db, context.organizationId, existing.id);
  if (!revoked) throw new NotFoundError('API key');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.API_KEY_ROTATED,
    entityType: 'api_key',
    entityId: key.id,
    after: {
      previousKeyId: existing.id,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
    },
  });

  const { keyHash: _hash, ...listItem } = key;
  return { key: listItem, plaintext: material.plaintext, revokedKeyId: existing.id };
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

  const urlCheck = validateWebhookEndpointUrl(parsed.data.url);
  if (!urlCheck.ok) {
    throw new ValidationError([{ path: 'url', message: `Unsafe webhook URL (${urlCheck.reason})` }]);
  }

  const material = generateWebhookSecretMaterial();
  const sealed = sealedWebhookMaterial(material.plaintext);
  const endpoint = await insertWebhookEndpoint(context.db, {
    organizationId: context.organizationId,
    url: urlCheck.url,
    secretHash: sealed,
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

export async function revokeWebhookEndpoint(
  context: OrgContext,
  rawInput: RevokeWebhookInput,
): Promise<WebhookEndpointListItem> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = revokeWebhookSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const revoked = await revokeWebhookEndpointById(
    context.db,
    context.organizationId,
    parsed.data.endpointId,
  );
  if (!revoked) throw new NotFoundError('Webhook endpoint');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WEBHOOK_ENDPOINT_REVOKED,
    entityType: 'webhook_endpoint',
    entityId: revoked.id,
    after: { status: revoked.status, archivedAt: revoked.archivedAt },
  });

  return revoked;
}

export async function rotateWebhookSecret(
  context: OrgContext,
  rawInput: RotateWebhookSecretInput,
): Promise<{ endpoint: WebhookEndpointListItem; plaintextSecret: string }> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = rotateWebhookSecretSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findWebhookEndpointById(
    context.db,
    context.organizationId,
    parsed.data.endpointId,
  );
  if (!existing || existing.status !== 'active' || existing.archivedAt) {
    throw new NotFoundError('Webhook endpoint');
  }

  const material = generateWebhookSecretMaterial();
  const sealed = sealedWebhookMaterial(material.plaintext);
  const updated = await updateWebhookEndpointSecret(
    context.db,
    context.organizationId,
    existing.id,
    sealed,
  );
  if (!updated) throw new NotFoundError('Webhook endpoint');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WEBHOOK_SECRET_ROTATED,
    entityType: 'webhook_endpoint',
    entityId: updated.id,
    after: { rotated: true },
  });

  const { secretHash: _secret, ...listItem } = updated;
  return { endpoint: listItem, plaintextSecret: material.plaintext };
}

/**
 * Records a pending delivery row with a canonical event envelope (eventId).
 * Idempotent when the same eventId is presented again for this tenant.
 * No HTTP fan-out in this foundation.
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
  if (!endpoint || endpoint.status !== 'active' || endpoint.archivedAt) {
    throw new NotFoundError('Webhook endpoint');
  }

  if (!endpoint.eventTypes.includes(parsed.data.eventType)) {
    throw new DomainRuleError(
      'Event type is not subscribed on this endpoint',
      'errors.notAllowed',
      { eventType: parsed.data.eventType },
    );
  }

  const envelope = buildWebhookEventEnvelope({
    eventType: parsed.data.eventType,
    data: parsed.data.payload,
    eventId: parsed.data.eventId,
  });

  const existing = await findWebhookDeliveryByEventId(
    context.db,
    context.organizationId,
    envelope.eventId,
  );
  if (existing) {
    return existing;
  }

  const initial = initialDeliveryState();
  const delivery = await insertWebhookDelivery(context.db, {
    organizationId: context.organizationId,
    endpointId: parsed.data.endpointId,
    eventType: parsed.data.eventType,
    payload: envelope,
    status: initial.status,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WEBHOOK_DELIVERY_ENQUEUED,
    entityType: 'webhook_delivery',
    entityId: delivery.id,
    after: {
      endpointId: delivery.endpointId,
      eventType: delivery.eventType,
      eventId: envelope.eventId,
      status: delivery.status,
      attemptCount: delivery.attemptCount,
    },
  });

  return delivery;
}

/**
 * Applies one delivery attempt outcome (worker / test harness foundation).
 * Persists status, attemptCount, lastError (incl. HTTP status encoding), deliveredAt.
 */
export async function recordWebhookDeliveryAttempt(
  context: OrgContext,
  rawInput: RecordDeliveryAttemptInput,
): Promise<WebhookDeliveryRecord> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const parsed = recordDeliveryAttemptSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const current = await findWebhookDeliveryById(
    context.db,
    context.organizationId,
    parsed.data.deliveryId,
  );
  if (!current) throw new NotFoundError('Webhook delivery');

  const state: DeliveryAttemptState = {
    status: current.status,
    attemptCount: current.attemptCount,
    lastError: current.lastError,
    deliveredAt: current.deliveredAt,
    lastHttpStatus: current.lastHttpStatus,
  };

  const next = applyDeliveryAttempt(state, parsed.data.outcome, {
    error: parsed.data.error,
    httpStatus: parsed.data.httpStatus,
  });

  const updated = await updateWebhookDeliveryAttempt(
    context.db,
    context.organizationId,
    current.id,
    {
      status: next.status,
      attemptCount: next.attemptCount,
      lastError: next.lastError,
      deliveredAt: next.deliveredAt,
    },
  );
  if (!updated) throw new NotFoundError('Webhook delivery');
  return updated;
}

/**
 * Builds signed outbound headers + body for a delivery without performing HTTP.
 * Requires sealed secret storage (or legacy hash rows cannot sign - rotate first).
 */
export async function prepareSignedWebhookDelivery(
  context: OrgContext,
  deliveryId: string,
): Promise<{
  url: string;
  body: string;
  headers: Record<string, string>;
  eventId: string;
}> {
  assertPermission(context, PERMISSIONS.API_MANAGE);

  const delivery = await findWebhookDeliveryById(context.db, context.organizationId, deliveryId);
  if (!delivery) throw new NotFoundError('Webhook delivery');

  const endpoint = await findWebhookEndpointById(
    context.db,
    context.organizationId,
    delivery.endpointId,
  );
  if (!endpoint || endpoint.status !== 'active' || endpoint.archivedAt) {
    throw new NotFoundError('Webhook endpoint');
  }

  if (!isSealedWebhookSecret(endpoint.secretHash)) {
    throw new DomainRuleError(
      'Webhook secret must be rotated before signed delivery (legacy hash-only storage)',
      'errors.notAllowed',
    );
  }

  const plaintextSecret = openWebhookSecret(endpoint.secretHash, resolveWebhookSecretKek());
  const envelope =
    delivery.payload && typeof delivery.payload === 'object' && !Array.isArray(delivery.payload)
      ? (delivery.payload as {
          eventId: string;
          eventType: string;
          occurredAt: string;
          data: Record<string, unknown>;
        })
      : buildWebhookEventEnvelope({
          eventType: delivery.eventType,
          data: {},
        });

  const body = serializeWebhookEventBody(envelope);
  const signed = buildWebhookSignatureHeaders({
    plaintextSecret,
    body,
    eventId: envelope.eventId,
  });

  // Never return plaintextSecret.
  return {
    url: endpoint.url,
    body,
    headers: signed.headers,
    eventId: envelope.eventId,
  };
}
