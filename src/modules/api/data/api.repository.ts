import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { apiClients, apiKeys, organizations, webhookDeliveries, webhookEndpoints } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { parseDeliveryHttpStatus } from '../domain/delivery-state';
import type {
  ApiClientRecord,
  ApiClientStatus,
  ApiKeyListItem,
  ApiKeyRecord,
  AuthenticatedApiKey,
  WebhookDeliveryRecord,
  WebhookDeliveryStatus,
  WebhookEndpointListItem,
  WebhookEndpointRecord,
  WebhookEndpointStatus,
} from '../domain/types';

function mapClient(row: typeof apiClients.$inferSelect): ApiClientRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status as ApiClientStatus,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapKey(row: typeof apiKeys.$inferSelect): ApiKeyRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    apiClientId: row.apiClientId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    keyHash: row.keyHash,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toKeyListItem(key: ApiKeyRecord): ApiKeyListItem {
  const { keyHash: _hash, ...rest } = key;
  return rest;
}

function mapEndpoint(row: typeof webhookEndpoints.$inferSelect): WebhookEndpointRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    url: row.url,
    secretHash: row.secretHash,
    eventTypes: Array.isArray(row.eventTypes) ? row.eventTypes : [],
    status: row.status as WebhookEndpointStatus,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toEndpointListItem(endpoint: WebhookEndpointRecord): WebhookEndpointListItem {
  const { secretHash: _secret, ...rest } = endpoint;
  return rest;
}

function mapDelivery(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    endpointId: row.endpointId,
    eventType: row.eventType,
    payload: row.payload,
    status: row.status as WebhookDeliveryStatus,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    lastHttpStatus: parseDeliveryHttpStatus(row.lastError),
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertApiClient(
  db: DbExecutor,
  input: { organizationId: string; name: string },
): Promise<ApiClientRecord> {
  const [row] = await db
    .insert(apiClients)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      status: 'active',
    })
    .returning();
  return mapClient(row!);
}

export async function findApiClientById(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<ApiClientRecord | null> {
  const [row] = await db
    .select()
    .from(apiClients)
    .where(and(eq(apiClients.id, clientId), eq(apiClients.organizationId, organizationId)))
    .limit(1);
  return row ? mapClient(row) : null;
}

export async function listApiClients(
  db: DbExecutor,
  organizationId: string,
): Promise<ApiClientRecord[]> {
  const rows = await db
    .select()
    .from(apiClients)
    .where(and(eq(apiClients.organizationId, organizationId), isNull(apiClients.archivedAt)))
    .orderBy(desc(apiClients.createdAt));
  return rows.map(mapClient);
}

export async function insertApiKey(
  db: DbExecutor,
  input: {
    organizationId: string;
    apiClientId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: readonly string[];
    expiresAt?: Date | null;
  },
): Promise<ApiKeyRecord> {
  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId: input.organizationId,
      apiClientId: input.apiClientId,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      scopes: [...input.scopes],
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return mapKey(row!);
}

export async function findApiKeyById(
  db: DbExecutor,
  organizationId: string,
  keyId: string,
): Promise<ApiKeyRecord | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.organizationId, organizationId)))
    .limit(1);
  return row ? mapKey(row) : null;
}

export async function listApiKeysForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<ApiKeyListItem[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map((row) => toKeyListItem(mapKey(row)));
}

export async function revokeApiKeyById(
  db: DbExecutor,
  organizationId: string,
  keyId: string,
): Promise<ApiKeyListItem | null> {
  const now = new Date();
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.organizationId, organizationId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning();
  return row ? toKeyListItem(mapKey(row)) : null;
}

export async function findApiKeyByPrefix(
  db: DbExecutor,
  keyPrefix: string,
): Promise<(ApiKeyRecord & { clientName: string; clientStatus: ApiClientStatus }) | null> {
  const [row] = await db
    .select({
      key: apiKeys,
      clientName: apiClients.name,
      clientStatus: apiClients.status,
      clientArchivedAt: apiClients.archivedAt,
      clientOrganizationId: apiClients.organizationId,
    })
    .from(apiKeys)
    .innerJoin(apiClients, eq(apiKeys.apiClientId, apiClients.id))
    .where(eq(apiKeys.keyPrefix, keyPrefix))
    .limit(1);

  // Defense in depth: refuse cross-tenant key/client mismatches.
  if (!row || row.clientArchivedAt) return null;
  if (row.key.organizationId !== row.clientOrganizationId) return null;

  return {
    ...mapKey(row.key),
    clientName: row.clientName,
    clientStatus: row.clientStatus as ApiClientStatus,
  };
}

export async function touchApiKeyLastUsed(db: DbExecutor, keyId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(apiKeys.id, keyId));
}

export async function insertWebhookEndpoint(
  db: DbExecutor,
  input: {
    organizationId: string;
    url: string;
    secretHash: string;
    eventTypes: readonly string[];
  },
): Promise<WebhookEndpointRecord> {
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      organizationId: input.organizationId,
      url: input.url,
      secretHash: input.secretHash,
      eventTypes: [...input.eventTypes],
      status: 'active',
    })
    .returning();
  return mapEndpoint(row!);
}

export async function listWebhookEndpoints(
  db: DbExecutor,
  organizationId: string,
): Promise<WebhookEndpointListItem[]> {
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(eq(webhookEndpoints.organizationId, organizationId), isNull(webhookEndpoints.archivedAt)),
    )
    .orderBy(desc(webhookEndpoints.createdAt));
  return rows.map((row) => toEndpointListItem(mapEndpoint(row)));
}

export async function findWebhookEndpointById(
  db: DbExecutor,
  organizationId: string,
  endpointId: string,
): Promise<WebhookEndpointRecord | null> {
  const [row] = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapEndpoint(row) : null;
}

export async function revokeWebhookEndpointById(
  db: DbExecutor,
  organizationId: string,
  endpointId: string,
): Promise<WebhookEndpointListItem | null> {
  const now = new Date();
  const [row] = await db
    .update(webhookEndpoints)
    .set({
      status: 'disabled',
      archivedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.organizationId, organizationId),
        isNull(webhookEndpoints.archivedAt),
      ),
    )
    .returning();
  return row ? toEndpointListItem(mapEndpoint(row)) : null;
}

export async function updateWebhookEndpointSecret(
  db: DbExecutor,
  organizationId: string,
  endpointId: string,
  secretHash: string,
): Promise<WebhookEndpointRecord | null> {
  const now = new Date();
  const [row] = await db
    .update(webhookEndpoints)
    .set({ secretHash, updatedAt: now })
    .where(
      and(
        eq(webhookEndpoints.id, endpointId),
        eq(webhookEndpoints.organizationId, organizationId),
        eq(webhookEndpoints.status, 'active'),
        isNull(webhookEndpoints.archivedAt),
      ),
    )
    .returning();
  return row ? mapEndpoint(row) : null;
}

export async function insertWebhookDelivery(
  db: DbExecutor,
  input: {
    organizationId: string;
    endpointId: string;
    eventType: string;
    payload: unknown;
    status?: WebhookDeliveryStatus;
  },
): Promise<WebhookDeliveryRecord> {
  const [row] = await db
    .insert(webhookDeliveries)
    .values({
      organizationId: input.organizationId,
      endpointId: input.endpointId,
      eventType: input.eventType,
      payload: input.payload as Record<string, unknown>,
      status: input.status ?? 'pending',
      attemptCount: 0,
      lastError: null,
      deliveredAt: null,
    })
    .returning();
  return mapDelivery(row!);
}

export async function findWebhookDeliveryByEventId(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<WebhookDeliveryRecord | null> {
  const [row] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.organizationId, organizationId),
        sql`${webhookDeliveries.payload}->>'eventId' = ${eventId}`,
      ),
    )
    .limit(1);
  return row ? mapDelivery(row) : null;
}

export async function findWebhookDeliveryById(
  db: DbExecutor,
  organizationId: string,
  deliveryId: string,
): Promise<WebhookDeliveryRecord | null> {
  const [row] = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapDelivery(row) : null;
}

export async function updateWebhookDeliveryAttempt(
  db: DbExecutor,
  organizationId: string,
  deliveryId: string,
  next: {
    status: WebhookDeliveryStatus;
    attemptCount: number;
    lastError: string | null;
    deliveredAt: Date | null;
  },
): Promise<WebhookDeliveryRecord | null> {
  const now = new Date();
  const [row] = await db
    .update(webhookDeliveries)
    .set({
      status: next.status,
      attemptCount: next.attemptCount,
      lastError: next.lastError,
      deliveredAt: next.deliveredAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(webhookDeliveries.id, deliveryId),
        eq(webhookDeliveries.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapDelivery(row) : null;
}

export async function listWebhookDeliveries(
  db: DbExecutor,
  organizationId: string,
  limit = 50,
  cursor?: string | null,
): Promise<WebhookDeliveryRecord[]> {
  const conditions = [eq(webhookDeliveries.organizationId, organizationId)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(webhookDeliveries.createdAt, cursorDate));
    }
  }

  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(and(...conditions))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
  return rows.map(mapDelivery);
}

export async function findOrganizationName(
  db: DbExecutor,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row?.name ?? null;
}

export type { AuthenticatedApiKey };
