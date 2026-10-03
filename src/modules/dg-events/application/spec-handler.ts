import { renderDgNotificationCopy, type DgCopyParams } from '@/modules/notifications/domain/dg-copy';
import type { NotificationCopyTranslator } from '@/modules/notifications/domain/copy';
import type { DbExecutor } from '@/shared/db/types';
import type { EntityScope } from '@/shared/entity-access';
import { dgCopyKey, findDgEventSpec } from '../domain/event-catalog';
import {
  DG_ADMIN_FALLBACK_CAP,
  DG_EXTERNAL_FANOUT_CAP,
  DG_MEMBER_FANOUT_CAP,
  selectExternalRecipients,
  selectInternalRecipients,
} from '../domain/recipients';
import {
  externalTargeting,
  isUuid,
  payloadIds,
  payloadReference,
  primaryAgreementId,
  primaryVendorId,
} from '../domain/scope';
import type { DgEventSpec, DgHandlerResult, DgLinkInput, DomainEventRecord } from '../domain/types';
import {
  listActiveProjectMemberIds,
  listCoveredPrincipals,
  listProjectAdminUserIds,
  listProjectCapabilityHolders,
  loadCopyContext,
} from '../data/recipients.repository';
import {
  resolveDgNotifications,
  upsertExternalDgNotification,
  upsertInternalDgNotification,
} from '../data/notification-writer.repository';

export interface DgHandlerDeps {
  readonly now: Date;
  readonly translator: (locale: string) => Promise<NotificationCopyTranslator>;
  readonly resolveScope: (
    db: DbExecutor,
    entityType: string,
    organizationId: string,
    entityId: string,
  ) => Promise<EntityScope | null>;
}

export type DgEventHandler = (
  db: DbExecutor,
  event: DomainEventRecord,
  deps: DgHandlerDeps,
) => Promise<DgHandlerResult>;

export function dgDedupeKey(eventType: string, subjectId: string): string {
  return `dg:${eventType}:${subjectId}`;
}

function hasExplicitTargets(payload: Record<string, unknown>): boolean {
  return (
    isUuid(payload.vendorId) ||
    Array.isArray(payload.vendorIds) ||
    Array.isArray(payload.targets) ||
    payload.allProjectContractors === true
  );
}

async function safeResolveScope(
  db: DbExecutor,
  event: DomainEventRecord,
  deps: DgHandlerDeps,
): Promise<EntityScope | null> {
  try {
    return await deps.resolveScope(db, event.entityType, event.organizationId, event.entityId);
  } catch {
    return null;
  }
}

async function resolveInternalRecipients(
  db: DbExecutor,
  spec: DgEventSpec,
  event: DomainEventRecord,
  projectId: string,
): Promise<string[]> {
  const audience = spec.internal!;
  const organizationId = event.organizationId;
  const capabilities = audience.capabilities;
  const named = payloadIds(event.payload, audience.namedPayloadKeys);

  const [holders, namedHolders, namedMembers, namedAdmins] = await Promise.all([
    audience.namedOnly
      ? Promise.resolve([] as string[])
      : listProjectCapabilityHolders(db, { organizationId, projectId, capabilities, limit: DG_MEMBER_FANOUT_CAP + 1 }),
    spec.financial && named.length > 0
      ? listProjectCapabilityHolders(db, { organizationId, projectId, capabilities, onlyUserIds: named, limit: named.length })
      : Promise.resolve([] as string[]),
    !spec.financial && named.length > 0
      ? listActiveProjectMemberIds(db, { organizationId, projectId, userIds: named })
      : Promise.resolve([] as string[]),
    named.length > 0
      ? listProjectAdminUserIds(db, { organizationId, onlyUserIds: named, limit: named.length })
      : Promise.resolve([] as string[]),
  ]);

  const admins =
    holders.length === 0 && !audience.namedOnly
      ? await listProjectAdminUserIds(db, { organizationId, limit: DG_ADMIN_FALLBACK_CAP + 1 })
      : [];

  return selectInternalRecipients({
    holders,
    admins,
    named,
    namedEligible: new Set([...namedHolders, ...namedMembers, ...namedAdmins]),
    namedOnly: Boolean(audience.namedOnly),
    excludeUserIds: event.actorUserId ? [event.actorUserId] : [],
  });
}

/** Turns one domain event into internal + external notifications according to its spec. */
export function createSpecHandler(spec: DgEventSpec): DgEventHandler {
  return async (db, event, deps) => {
    const payload = event.payload;
    const wantsInternal = Boolean(spec.internal) && (spec.internal?.when?.(event) ?? true);
    const wantsExternal = Boolean(spec.external) && (spec.external?.when?.(event) ?? true);

    const fallback =
      (wantsExternal && !hasExplicitTargets(payload)) || !event.projectId
        ? await safeResolveScope(db, event, deps)
        : null;
    const projectId = event.projectId ?? fallback?.projectId ?? null;
    const targeting = externalTargeting(payload, fallback);
    const subjectCandidate = spec.subjectPayloadKey ? payload[spec.subjectPayloadKey] : null;
    const subjectId = isUuid(subjectCandidate) ? subjectCandidate.toLowerCase() : event.entityId;
    const agreementId = primaryAgreementId(payload, targeting);
    const vendorId = primaryVendorId(targeting);
    const severity = typeof spec.severity === 'function' ? spec.severity(event) : spec.severity;
    const copyKey = dgCopyKey(spec.type);
    const dedupeKey = dgDedupeKey(spec.type, subjectId);
    const linkInput: DgLinkInput = { projectId, entityId: event.entityId, subjectId, agreementId, payload };
    const reference = payloadReference(payload);

    let resolved = 0;
    if (spec.resolves && spec.resolves.length > 0) {
      const resolvedSpecs = spec.resolves.map((type) => findDgEventSpec(type)).filter(Boolean) as DgEventSpec[];
      resolved = await resolveDgNotifications(db, {
        organizationId: event.organizationId,
        types: [...new Set(resolvedSpecs.map((resolvedSpec) => resolvedSpec.category))],
        dedupeKeys: spec.resolves.map((type) => dgDedupeKey(type, subjectId)),
      });
    }

    const internalRecipients =
      wantsInternal && projectId ? await resolveInternalRecipients(db, spec, event, projectId) : [];

    const covered =
      wantsExternal && targeting.mode !== 'none'
        ? await listCoveredPrincipals(db, {
            organizationId: event.organizationId,
            projectId,
            capabilities: spec.external!.capabilities,
            targeting,
            now: deps.now,
            limit: DG_EXTERNAL_FANOUT_CAP,
          })
        : [];
    const externalRecipients = wantsExternal
      ? selectExternalRecipients({
          covered,
          named: payloadIds(payload, spec.external!.namedPayloadKeys),
          namedOnly: Boolean(spec.external!.namedOnly),
          excludePrincipalIds: event.actorPrincipalId ? [event.actorPrincipalId] : [],
        })
      : [];

    if (internalRecipients.length === 0 && externalRecipients.length === 0) {
      return { internalRecipients: 0, externalRecipients: 0, resolved };
    }

    const copyContext = await loadCopyContext(db, { organizationId: event.organizationId, projectId, vendorId });

    if (internalRecipients.length > 0) {
      const params: DgCopyParams = {
        project: copyContext.projectName,
        contractor: copyContext.vendorName,
        reference,
      };
      const t = await deps.translator(copyContext.defaultLocale);
      const copy = renderDgNotificationCopy(t, { copyKey, params });
      const deepLink = spec.internalLink(linkInput);
      for (const recipientUserId of internalRecipients) {
        await upsertInternalDgNotification(db, {
          organizationId: event.organizationId,
          recipientUserId,
          type: spec.category,
          title: copy.title,
          body: copy.body,
          severity,
          entityType: event.entityType,
          entityId: event.entityId,
          deepLink,
          dedupeKey,
          eventId: event.id,
          eventType: spec.type,
          copyKey,
          params,
          projectId,
        });
      }
    }

    if (externalRecipients.length > 0) {
      const params: DgCopyParams = { project: copyContext.projectName, reference };
      const deepLink = spec.portalLink(linkInput);
      for (const recipient of externalRecipients) {
        await upsertExternalDgNotification(db, {
          organizationId: event.organizationId,
          principalId: recipient.principalId,
          projectId,
          vendorId: recipient.vendorId,
          agreementId: recipient.agreementId,
          eventId: event.id,
          eventType: spec.type,
          requiredCapabilities: spec.external!.capabilities,
          copyKey,
          entityType: event.entityType,
          entityId: event.entityId,
          severity,
          deepLink,
          params,
          dedupeKey,
          occurredAt: event.occurredAt,
        });
      }
    }

    return {
      internalRecipients: internalRecipients.length,
      externalRecipients: externalRecipients.length,
      resolved,
    };
  };
}
