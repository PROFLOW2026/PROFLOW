import { sql } from 'drizzle-orm';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb } from '@/shared/db';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getEmailPort } from '@/shared/ports/email';
import { findOutboundCommunication } from '../data/communications.repository';
import { isTerminalCommunicationStatus, resolveSendOutcome } from '../domain/send-policy';
import type { OutboundCommunicationRecord } from '../domain/types';

async function attemptDelivery(
  context: OrgContext,
  communicationId: string,
): Promise<OutboundCommunicationRecord> {
  assertPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE);
  const existing = await findOutboundCommunication(
    context.db,
    context.organizationId,
    communicationId,
  );
  if (!existing) throw new NotFoundError('Communication');
  if (existing.status === 'sent') {
    throw new DomainRuleError(
      'Already confirmed delivered',
      'communications.errors.cannotMarkSent',
    );
  }
  if (isTerminalCommunicationStatus(existing.status)) {
    throw new DomainRuleError('This message cannot be sent', 'communications.errors.cannotMarkSent');
  }

  await context.db.execute(sql`
    SELECT app.request_outbound_communication_send(
      ${context.organizationId}::uuid,
      ${existing.id}::uuid
    )
  `);

  const port = getEmailPort();
  const { resolveDocumentBrand, wrapCommunicationHtmlWithBrand } = await import(
    '@/modules/branding'
  );
  let html = existing.bodyHtml ?? undefined;
  let text = existing.bodyText;
  try {
    const brand = await resolveDocumentBrand(context, {
      theme: 'customer',
      locale: context.locale,
      entityType: 'communication',
      entityId: existing.id,
      useSnapshotIfPresent: true,
    });
    const wrapped = wrapCommunicationHtmlWithBrand(
      brand.context,
      existing.bodyHtml,
      existing.bodyText,
    );
    html = wrapped.html;
    text = wrapped.text;
  } catch {
    // Keep original body if brand resolve fails.
  }
  const result = await port.send({
    to: existing.recipientEmail,
    subject: existing.subject,
    text,
    html,
  });
  const outcome = resolveSendOutcome(result);
  const trustedDb = getAdminDb();

  if (outcome.status === 'sent' && outcome.providerMessageId) {
    await trustedDb.execute(sql`
      SELECT app.confirm_outbound_communication_delivery(
        ${context.organizationId}::uuid,
        ${existing.id}::uuid,
        ${port.configured ? 'resend' : 'email'},
        ${outcome.providerMessageId}
      )
    `);
    const updated = await findOutboundCommunication(
      context.db,
      context.organizationId,
      existing.id,
    );
    if (!updated) throw new NotFoundError('Communication');

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COMMUNICATION_SENT,
      entityType: 'outbound_communication',
      entityId: updated.id,
      after: {
        status: updated.status,
        attemptResult: outcome.attemptResult,
        providerMessageId: outcome.providerMessageId,
      },
    });

    const { captureBrandSnapshot } = await import('@/modules/branding');
    await captureBrandSnapshot(context, {
      entityType: 'communication',
      entityId: updated.id,
    });

    return updated;
  }

  await trustedDb.execute(sql`
    SELECT app.record_outbound_communication_failure(
      ${context.organizationId}::uuid,
      ${existing.id}::uuid,
      ${outcome.attemptResult},
      ${outcome.lastError}
    )
  `);
  const updated = await findOutboundCommunication(
    context.db,
    context.organizationId,
    existing.id,
  );
  if (!updated) throw new NotFoundError('Communication');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMMUNICATION_FAILED,
    entityType: 'outbound_communication',
    entityId: updated.id,
    after: {
      status: updated.status,
      attemptResult: outcome.attemptResult,
      providerMessageId: null,
    },
  });

  return updated;
}

export async function sendCommunication(
  context: OrgContext,
  communicationId: string,
): Promise<OutboundCommunicationRecord> {
  return attemptDelivery(context, communicationId);
}

export async function retryCommunication(
  context: OrgContext,
  communicationId: string,
): Promise<OutboundCommunicationRecord> {
  return attemptDelivery(context, communicationId);
}
