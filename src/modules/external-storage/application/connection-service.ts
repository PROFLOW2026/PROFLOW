import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, ServiceUnavailableError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  clearPrimaryExcept,
  findStorageConnectionById,
  findStorageConnectionByProvider,
  getPrimaryStorageConnection,
  listStorageConnections,
  updateStorageConnection,
  upsertStorageConnection,
} from '../data/connections.repository';
import { runCommittedStorageWrite } from '../data/storage-admin-write';
import {
  deleteStorageConnectionCredentials,
  loadStorageConnectionCredentials,
  saveStorageConnectionCredentials,
} from '../data/credentials.repository';
import type { StorageConnectionRecord, StorageProviderKey } from '../domain/types';
import {
  isUsableStorageConnection,
  shouldPromoteConnectedStorageToPrimary,
} from '../domain/connection-rules';
import { ensureUsablePrimaryStorageConnection } from './reconcile-primary-storage';
import { ProviderHttpError } from '../providers/http-utils';
import { getStorageProviderAdapter, isStorageProviderConfigured } from '../providers/registry';
import { bootstrapOrganizationStorageTree } from './bootstrap';
import { deleteFolderMappingsForConnection } from '../data/folder-mappings.repository';
import { ensureOrganizationRootFolder } from './folder-provisioning';
import {
  formatGoogleDriveOAuthScope,
  googleDriveGrantedFullScope,
  resolveGoogleDriveOAuthAuthorizeOptions,
} from '../providers/google-drive-oauth-url';
import { resolveOneDriveOAuthAuthorizeOptions } from '../providers/onedrive-oauth-url';
import { buildOAuthRedirectUri, createOAuthState, verifyOAuthState } from './oauth-state';

export async function listOrganizationStorageConnections(
  context: OrgContext,
): Promise<StorageConnectionRecord[]> {
  assertPermission(context, PERMISSIONS.INTEGRATIONS_READ);
  return listStorageConnections(context.db, context.organizationId);
}

export async function getOrganizationPrimaryStorage(
  context: OrgContext,
): Promise<StorageConnectionRecord | null> {
  return ensureUsablePrimaryStorageConnection(context.db, context.organizationId);
}

export function organizationHasActiveStorage(connection: StorageConnectionRecord | null): boolean {
  return isUsableStorageConnection(connection);
}

export async function assertOrganizationStorageAvailable(context: OrgContext): Promise<StorageConnectionRecord> {
  const primary = await ensureUsablePrimaryStorageConnection(
    context.db,
    context.organizationId,
  );
  if (!organizationHasActiveStorage(primary)) {
    throw new ServiceUnavailableError(
      'Organization storage is not connected',
      'externalStorage.errors.notConnected',
    );
  }
  return primary!;
}

export async function beginStorageOAuth(
  context: OrgContext,
  provider: StorageProviderKey,
): Promise<{ authorizationUrl: string }> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  if (!isStorageProviderConfigured(provider)) {
    throw new ServiceUnavailableError(
      'Storage provider is not configured',
      'externalStorage.errors.providerNotConfigured',
    );
  }

  const priorConnection = await findStorageConnectionByProvider(
    context.db,
    context.organizationId,
    provider,
  );
  const priorCreds = priorConnection
    ? await loadStorageConnectionCredentials(
        context.db,
        context.organizationId,
        priorConnection.id,
      )
    : null;

  const connection = await upsertStorageConnection(context.db, {
    organizationId: context.organizationId,
    provider,
    status: 'connecting',
  });

  const state = createOAuthState({
    organizationId: context.organizationId,
    userId: context.userId,
    connectionId: connection.id,
    provider,
  });

  const adapter = getStorageProviderAdapter(provider);
  const onedriveOAuth = provider === 'onedrive' ? resolveOneDriveOAuthAuthorizeOptions() : null;
  const googleOAuth =
    provider === 'google_drive'
      ? resolveGoogleDriveOAuthAuthorizeOptions({
          connectionStatus: priorConnection?.status ?? 'disconnected',
          priorScopes: priorCreds?.scopes?.length
            ? priorCreds.scopes
            : (priorConnection?.scopesJson ?? []),
          priorRefreshTokenPresent: Boolean(priorCreds?.refreshToken),
          lastError: priorConnection?.lastError ?? null,
        })
      : null;

  if (provider === 'google_drive' && googleOAuth?.prompt === 'consent' && priorConnection) {
    await deleteStorageConnectionCredentials(
      context.db,
      context.organizationId,
      priorConnection.id,
    );
  }

  const authorizationUrl = adapter.buildAuthorizationUrl({
    redirectUri: buildOAuthRedirectUri(provider),
    state,
    loginHint: onedriveOAuth?.loginHint ?? googleOAuth?.loginHint ?? null,
    prompt: onedriveOAuth?.prompt ?? googleOAuth?.prompt ?? null,
  });

  return { authorizationUrl };
}

export async function failStorageOAuthCallback(input: {
  provider: StorageProviderKey;
  state: string;
  detail: string;
}): Promise<void> {
  let parsed: ReturnType<typeof verifyOAuthState>;
  try {
    parsed = verifyOAuthState(input.state);
  } catch {
    return;
  }
  if (parsed.provider !== input.provider) return;

  const { withUserContext } = await import('@/shared/db/client');
  await withUserContext(parsed.userId, async (db) => {
    const connection = await findStorageConnectionByProvider(db, parsed.organizationId, input.provider);
    if (!connection || connection.id !== parsed.connectionId) return;
    if (connection.status === 'connected') return;
    await updateStorageConnection(db, parsed.organizationId, connection.id, {
      status: 'error',
      lastError: input.detail.slice(0, 500),
    });
  });
}

function sanitizeOAuthLogDetail(error: unknown): string {
  if (error instanceof ProviderHttpError) {
    return error.bodySnippet.slice(0, 500);
  }
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return String(error).slice(0, 500);
}

export async function provisionConnectedStorage(input: {
  userId: string;
  organizationId: string;
  connectionId: string;
  /** Same Microsoft account as before disconnect — reuse folder mappings, skip full bootstrap. */
  reconnectSameAccount?: boolean;
  /** Different Microsoft account — drop stale external folder IDs before provisioning. */
  accountChanged?: boolean;
}): Promise<void> {
  const { withUserContext } = await import('@/shared/db/client');
  await withUserContext(input.userId, async (db) => {
    const connection = await findStorageConnectionById(db, input.organizationId, input.connectionId);
    if (!connection || connection.status !== 'connected') return;

    if (input.accountChanged) {
      await deleteFolderMappingsForConnection(db, input.organizationId, connection.id);
      await updateStorageConnection(db, input.organizationId, connection.id, {
        rootFolderExternalId: null,
      });
    }

    const accessToken = await resolveValidAccessToken(db, input.organizationId, connection);
    console.info('[org-storage/oauth/provision] step=root_folder begin', {
      connectionId: input.connectionId,
      reconnectSameAccount: Boolean(input.reconnectSameAccount),
    });
    await ensureOrganizationRootFolder(db, input.organizationId, connection, accessToken);
    console.info('[org-storage/oauth/provision] step=root_folder pass', {
      connectionId: input.connectionId,
    });

    if (!input.reconnectSameAccount || input.accountChanged) {
      console.info('[org-storage/oauth/provision] step=bootstrap begin', {
        connectionId: input.connectionId,
      });
      const bootstrapped = await bootstrapOrganizationStorageTree(
        db,
        input.organizationId,
        connection.id,
        accessToken,
      );
      console.info('[org-storage/oauth/provision] step=bootstrap pass', {
        connectionId: input.connectionId,
        clients: bootstrapped.clients,
        projects: bootstrapped.projects,
      });
    } else {
      console.info('[org-storage/oauth/provision] step=bootstrap skipped', {
        connectionId: input.connectionId,
        reason: 'same_account_reconnect',
      });
    }

    await updateStorageConnection(db, input.organizationId, connection.id, {
      lastError: null,
    });
    await ensureUsablePrimaryStorageConnection(db, input.organizationId, input.connectionId);
  });
}

export async function completeStorageOAuth(input: {
  provider: StorageProviderKey;
  code: string;
  state: string;
}): Promise<{ organizationId: string; connectionId: string }> {
  const parsed = verifyOAuthState(input.state);
  if (parsed.provider !== input.provider) {
    throw new DomainRuleError('OAuth state mismatch', 'externalStorage.errors.oauthState');
  }

  const adapter = getStorageProviderAdapter(input.provider);
  console.info('[org-storage/oauth/callback] step=token_exchange begin', {
    provider: input.provider,
    connectionId: parsed.connectionId,
  });
  const tokens = await adapter.exchangeAuthorizationCode({
    code: input.code,
    redirectUri: buildOAuthRedirectUri(input.provider),
  });
  console.info('[org-storage/oauth/callback] step=token_exchange pass', {
    provider: input.provider,
    hasRefreshToken: Boolean(tokens.refreshToken),
    scopeCount: tokens.scopes.length,
    grantedScopes: tokens.scopes,
  });

  if (input.provider === 'google_drive') {
    if (tokens.scopes.length > 0 && !googleDriveGrantedFullScope(tokens.scopes)) {
      throw new DomainRuleError(
        'Google OAuth did not grant full Drive scope',
        'externalStorage.errors.reconnectRequired',
      );
    }
    if (!adapter.getQuotaInfo) {
      throw new DomainRuleError(
        'Google Drive adapter missing quota probe',
        'externalStorage.errors.reconnectRequired',
      );
    }
    console.info('[org-storage/oauth/callback] step=google_drive_probe begin', {
      provider: input.provider,
    });
    try {
      await adapter.getQuotaInfo(tokens.accessToken);
    } catch (error) {
      const detail = sanitizeOAuthLogDetail(error);
      throw new DomainRuleError(
        detail.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
          ? 'Google Drive scope insufficient — reconnect with consent'
          : `Google Drive probe failed: ${detail}`,
        'externalStorage.errors.reconnectRequired',
      );
    }
    console.info('[org-storage/oauth/callback] step=google_drive_probe pass', {
      provider: input.provider,
    });
  }

  console.info('[org-storage/oauth/callback] step=graph_me begin', {
    provider: input.provider,
  });
  const account = await adapter.getAccountInfo(tokens.accessToken);
  console.info('[org-storage/oauth/callback] step=graph_me pass', {
    provider: input.provider,
    accountId: account.accountId,
    email: account.email,
  });

  let quota = { usedBytes: null as number | null, totalBytes: null as number | null };
  if (adapter.getQuotaInfo) {
    try {
      console.info('[org-storage/oauth/callback] step=onedrive_drive begin', {
        provider: input.provider,
      });
      quota = await adapter.getQuotaInfo(tokens.accessToken);
      console.info('[org-storage/oauth/callback] step=onedrive_drive pass', {
        provider: input.provider,
        usedBytes: quota.usedBytes,
        totalBytes: quota.totalBytes,
      });
    } catch (error) {
      console.warn('[org-storage/oauth/callback] step=onedrive_drive optional_fail', {
        provider: input.provider,
        detail: sanitizeOAuthLogDetail(error),
      });
    }
  }

  const { withUserContext } = await import('@/shared/db/client');
  let priorExternalAccountId: string | null = null;
  const connected = await withUserContext(parsed.userId, async (db) => {
    const connection = await findStorageConnectionByProvider(db, parsed.organizationId, input.provider);
    if (!connection || connection.id !== parsed.connectionId) {
      throw new DomainRuleError('Connection not found', 'externalStorage.errors.connectionNotFound');
    }
    priorExternalAccountId = connection.externalAccountId;

    console.info('[org-storage/oauth/callback] step=credential_persist begin', {
      connectionId: connection.id,
    });
    const priorCreds = await loadStorageConnectionCredentials(db, parsed.organizationId, connection.id);
    let refreshToken = tokens.refreshToken ?? null;
    if (
      !refreshToken &&
      priorCreds?.refreshToken &&
      input.provider === 'google_drive'
    ) {
      const priorScopes = priorCreds.scopes.length
        ? priorCreds.scopes
        : connection.scopesJson;
      const grantedScopes = tokens.scopes.length ? tokens.scopes : priorScopes;
      if (
        googleDriveGrantedFullScope(priorScopes) &&
        googleDriveGrantedFullScope(grantedScopes)
      ) {
        refreshToken = priorCreds.refreshToken;
      }
    } else if (!refreshToken && input.provider !== 'google_drive') {
      refreshToken = priorCreds?.refreshToken ?? null;
    }
    if (!refreshToken) {
      throw new DomainRuleError(
        'OAuth did not return a refresh token',
        'externalStorage.errors.reconnectRequired',
      );
    }
    await saveStorageConnectionCredentials(db, {
      organizationId: parsed.organizationId,
      connectionId: connection.id,
      payload: {
        accessToken: tokens.accessToken,
        refreshToken,
        expiresAt: tokens.expiresAt?.toISOString() ?? null,
        scopes:
          tokens.scopes.length > 0
            ? [...tokens.scopes]
            : input.provider === 'google_drive'
              ? formatGoogleDriveOAuthScope().split(' ')
              : [],
      },
      tokenExpiresAt: tokens.expiresAt,
    });
    console.info('[org-storage/oauth/callback] step=credential_persist pass', {
      connectionId: connection.id,
    });

    const existingPrimary = await getPrimaryStorageConnection(db, parsed.organizationId);
    const promoteToPrimary = shouldPromoteConnectedStorageToPrimary(existingPrimary);
    const persistedScopes =
      tokens.scopes.length > 0
        ? [...tokens.scopes]
        : input.provider === 'google_drive'
          ? formatGoogleDriveOAuthScope().split(' ')
          : [];
    const updated = await updateStorageConnection(db, parsed.organizationId, connection.id, {
      status: 'connected',
      isPrimary: promoteToPrimary,
      externalAccountId: account.accountId,
      externalAccountName: account.displayName,
      externalAccountEmail: account.email,
      externalTenantId: account.tenantId ?? null,
      scopesJson: persistedScopes,
      tokenExpiresAt: tokens.expiresAt,
      connectedByUserId: parsed.userId,
      connectedAt: new Date(),
      lastValidatedAt: new Date(),
      lastError: null,
      quotaUsedBytes: quota.usedBytes,
      quotaTotalBytes: quota.totalBytes,
    });

    if (!updated) throw new DomainRuleError('Connection update failed', 'externalStorage.errors.connectionNotFound');

    if (promoteToPrimary) {
      await clearPrimaryExcept(db, parsed.organizationId, connection.id);
    }

    console.info('[org-storage/oauth/callback] step=connection_write pass', {
      connectionId: connection.id,
      status: updated.status,
      isPrimary: promoteToPrimary,
    });

    return { organizationId: parsed.organizationId, connectionId: connection.id };
  });

  const accountChanged = Boolean(
    priorExternalAccountId && priorExternalAccountId !== account.accountId,
  );
  const reconnectSameAccount = Boolean(
    priorExternalAccountId && priorExternalAccountId === account.accountId,
  );

  try {
    await provisionConnectedStorage({
      userId: parsed.userId,
      organizationId: connected.organizationId,
      connectionId: connected.connectionId,
      reconnectSameAccount,
      accountChanged,
    });
  } catch (error) {
    const detail = sanitizeOAuthLogDetail(error);
    console.error('[org-storage/oauth/provision] failed', {
      provider: input.provider,
      connectionId: connected.connectionId,
      detail,
    });
    await withUserContext(parsed.userId, async (db) => {
      await updateStorageConnection(db, connected.organizationId, connected.connectionId, {
        lastError: `provision: ${detail}`.slice(0, 500),
      });
    });
  }

  return connected;
}

function resolveTokenExpiryMs(
  creds: { expiresAt: string | null },
  connection: StorageConnectionRecord,
): number | null {
  const sealedExpiry = creds.expiresAt ? Date.parse(creds.expiresAt) : null;
  const rowExpiry = connection.tokenExpiresAt ? connection.tokenExpiresAt.getTime() : null;
  if (sealedExpiry !== null && rowExpiry !== null) {
    return Math.min(sealedExpiry, rowExpiry);
  }
  return sealedExpiry ?? rowExpiry;
}

async function markStorageReconnectRequired(
  db: OrgContext['db'],
  organizationId: string,
  connection: StorageConnectionRecord,
  lastError: string,
): Promise<void> {
  const wasPrimary = connection.isPrimary;
  await runCommittedStorageWrite(async (adminDb) => {
    await updateStorageConnection(adminDb, organizationId, connection.id, {
      status: 'reconnect_required',
      lastError,
      ...(wasPrimary ? { isPrimary: false } : {}),
    });
  });
  if (wasPrimary) {
    await ensureUsablePrimaryStorageConnection(db, organizationId);
  }
}

async function persistRefreshedStorageToken(
  db: OrgContext['db'],
  organizationId: string,
  connectionId: string,
  creds: { refreshToken: string | null; scopes: string[] },
  refreshed: Awaited<ReturnType<ReturnType<typeof getStorageProviderAdapter>['refreshAccessToken']>>,
): Promise<string> {
  await saveStorageConnectionCredentials(db, {
    organizationId,
    connectionId,
    payload: {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? creds.refreshToken,
      expiresAt: refreshed.expiresAt?.toISOString() ?? null,
      scopes: refreshed.scopes.length ? [...refreshed.scopes] : creds.scopes,
    },
    tokenExpiresAt: refreshed.expiresAt,
  });
  await runCommittedStorageWrite(async (adminDb) => {
    await updateStorageConnection(adminDb, organizationId, connectionId, {
      tokenExpiresAt: refreshed.expiresAt,
      lastValidatedAt: new Date(),
      status: 'connected',
      lastError: null,
    });
  });
  return refreshed.accessToken;
}

export async function refreshStorageAccessToken(
  db: OrgContext['db'],
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<string> {
  const creds = await loadStorageConnectionCredentials(db, organizationId, connection.id);
  if (!creds?.refreshToken) {
    await markStorageReconnectRequired(db, organizationId, connection, 'token_expired');
    throw new ServiceUnavailableError(
      'Storage token expired',
      'externalStorage.errors.reconnectRequired',
    );
  }
  const adapter = getStorageProviderAdapter(connection.provider);
  try {
    const refreshed = await adapter.refreshAccessToken(creds.refreshToken);
    return persistRefreshedStorageToken(db, organizationId, connection.id, creds, refreshed);
  } catch (error) {
    const lastError =
      error instanceof ProviderHttpError && error.isUnauthorized()
        ? 'unauthorized'
        : 'token_refresh_failed';
    await markStorageReconnectRequired(db, organizationId, connection, lastError);
    throw new ServiceUnavailableError(
      'Storage token refresh failed',
      'externalStorage.errors.reconnectRequired',
    );
  }
}

export async function resolveValidAccessToken(
  db: OrgContext['db'],
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<string> {
  const creds = await loadStorageConnectionCredentials(db, organizationId, connection.id);
  if (!creds) {
    await markStorageReconnectRequired(db, organizationId, connection, 'missing_credentials');
    throw new ServiceUnavailableError(
      'Storage credentials missing',
      'externalStorage.errors.reconnectRequired',
    );
  }

  const expiresAtMs = resolveTokenExpiryMs(creds, connection);
  const needsRefresh = expiresAtMs !== null && expiresAtMs <= Date.now() + 60_000;
  if (!needsRefresh) return creds.accessToken;
  return refreshStorageAccessToken(db, organizationId, connection);
}

/** Run a provider call; on 401/403 refresh the token once and retry. */
export async function withStorageAccessToken<T>(
  db: OrgContext['db'],
  organizationId: string,
  connection: StorageConnectionRecord,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  let accessToken = await resolveValidAccessToken(db, organizationId, connection);
  try {
    return await fn(accessToken);
  } catch (error) {
    if (!(error instanceof ProviderHttpError) || !error.isUnauthorized()) {
      throw error;
    }
    accessToken = await refreshStorageAccessToken(db, organizationId, connection);
    return fn(accessToken);
  }
}

export async function validateStorageConnection(
  context: OrgContext,
  connectionId: string,
): Promise<StorageConnectionRecord> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const connection = await findStorageConnectionById(context.db, context.organizationId, connectionId);
  if (!connection) {
    throw new DomainRuleError('Connection not found', 'externalStorage.errors.connectionNotFound');
  }

  try {
    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    await adapter.getAccountInfo(accessToken);
    let quota = { usedBytes: null as number | null, totalBytes: null as number | null };
    if (adapter.getQuotaInfo) {
      quota = await adapter.getQuotaInfo(accessToken);
    }
    const updated = await updateStorageConnection(context.db, context.organizationId, connectionId, {
      status: 'connected',
      lastValidatedAt: new Date(),
      lastError: null,
      quotaUsedBytes: quota.usedBytes,
      quotaTotalBytes: quota.totalBytes,
    });
    return updated ?? connection;
  } catch (error) {
    const message = error instanceof ProviderHttpError && error.isUnauthorized()
      ? 'unauthorized'
      : 'validation_failed';
    await markStorageReconnectRequired(context.db, context.organizationId, connection, message);
    throw new ServiceUnavailableError(
      'Storage connection validation failed',
      'externalStorage.errors.reconnectRequired',
    );
  }
}

export async function disconnectStorageConnection(
  context: OrgContext,
  connectionId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const connection = await findStorageConnectionById(context.db, context.organizationId, connectionId);
  if (!connection) return;

  const creds = await loadStorageConnectionCredentials(context.db, context.organizationId, connectionId);
  if (creds) {
    try {
      const adapter = getStorageProviderAdapter(connection.provider);
      if (adapter.revokeConnection) {
        await adapter.revokeConnection(creds.accessToken);
      }
    } catch {
      // Revocation is best-effort; external files remain untouched.
    }
  }

  const wasPrimary = connection.isPrimary;
  await deleteStorageConnectionCredentials(context.db, context.organizationId, connectionId);
  await updateStorageConnection(context.db, context.organizationId, connectionId, {
    status: 'disconnected',
    isPrimary: false,
    tokenExpiresAt: null,
    lastError: null,
  });

  if (wasPrimary) {
    await ensureUsablePrimaryStorageConnection(context.db, context.organizationId);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.STORAGE_CONNECTION_DISCONNECTED,
    entityType: 'storage_connection',
    entityId: connectionId,
    after: { provider: connection.provider },
  });
}

export async function setPrimaryStorageConnection(
  context: OrgContext,
  connectionId: string,
): Promise<StorageConnectionRecord> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const connection = await findStorageConnectionById(context.db, context.organizationId, connectionId);
  if (!connection || connection.status !== 'connected') {
    throw new DomainRuleError('Connection not active', 'externalStorage.errors.connectionNotFound');
  }
  if (!connection.rootFolderExternalId) {
    throw new DomainRuleError(
      'Storage root folder is not provisioned',
      'externalStorage.errors.rootNotReady',
    );
  }
  await clearPrimaryExcept(context.db, context.organizationId, connectionId);
  const updated = await updateStorageConnection(context.db, context.organizationId, connectionId, {
    isPrimary: true,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.STORAGE_PRIMARY_CHANGED,
    entityType: 'storage_connection',
    entityId: connectionId,
    after: { provider: connection.provider },
  });
  return updated ?? connection;
}
