import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { invitations, organizations } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent, writeAuditEvent } from '@/shared/audit';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { Database, DbExecutor } from '@/shared/db/types';
import { assertCanGrantRole, ensureRoleAssigned, findRoleByKey } from '@/modules/rbac';
import { findActiveMembership, insertMembership } from '../data/organizations.repository';
import { inviteMemberSchema } from '../validation/schemas';

/**
 * Invitations (doc 73 §8).
 *
 * Only the hash of the invitation token is persisted, so a database dump does
 * not hand out organization access. The plaintext token exists exactly once, in
 * the email that is sent.
 */

const INVITATION_TTL_DAYS = 14;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export interface CreateInvitationResult {
  readonly invitationId: string;
  /** Returned once so the caller can build the email link. Never stored. */
  readonly token: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export async function createInvitation(
  context: OrgContext,
  rawInput: { email: string; roleKey: string },
): Promise<CreateInvitationResult> {
  assertPermission(context, PERMISSIONS.INVITATIONS_MANAGE);

  const parsed = inviteMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  /**
   * Privilege-escalation guard (doc 73 §10): the target role's effective
   * permissions must be a subset of what the inviter already holds.
   */
  const role = await findRoleByKey(context.db, context.organizationId, input.roleKey);
  if (!role) throw new NotFoundError('Role');

  await assertCanGrantRole(context, context.db, role.id);

  const existing = await context.db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, context.organizationId),
        eq(invitations.email, input.email),
        eq(invitations.status, 'pending'),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError('An invitation is already pending for this address', 'errors.invitations.alreadyPending');
  }

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await context.db
    .insert(invitations)
    .values({
      organizationId: context.organizationId,
      email: input.email,
      roleId: role.id,
      tokenHash,
      expiresAt,
      invitedByUserId: context.userId,
    })
    .returning({ id: invitations.id });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVITATION_CREATED,
    entityType: 'invitation',
    entityId: row!.id,
    after: { email: input.email, roleKey: input.roleKey, expiresAt },
  });

  return { invitationId: row!.id, token, email: input.email, expiresAt };
}

export interface InvitationPreview {
  readonly email: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly expiresAt: Date;
}

/**
 * Describes a pending invitation to whoever holds its token, so the accept
 * screen can name the business instead of asking someone to join "an
 * organization". Possession of the token is the authorization; nothing here is
 * reachable without it, and an invalid or spent token is indistinguishable from
 * an unknown one.
 */
export async function getInvitationPreview(
  db: DbExecutor,
  token: string,
): Promise<InvitationPreview | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      email: invitations.email,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || row.status !== 'pending' || row.expiresAt.getTime() < Date.now()) return null;

  return {
    email: row.email,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    expiresAt: row.expiresAt,
  };
}

export interface AcceptInvitationResult {
  readonly organizationId: string;
  readonly membershipId: string;
}

/**
 * Redeems an invitation for an already-authenticated user.
 *
 * Runs before the accepting user is a member, so it needs an executor that is
 * not yet bound to the target organization; the caller supplies a service-role
 * handle after Supabase Auth has confirmed the identity.
 */
export async function acceptInvitation(
  db: DbExecutor,
  input: { token: string; userId: string; userEmail: string },
): Promise<AcceptInvitationResult> {
  return (db as Database).transaction(async (tx) => acceptInvitationInTransaction(tx, input));
}

async function acceptInvitationInTransaction(
  db: DbExecutor,
  input: { token: string; userId: string; userEmail: string },
): Promise<AcceptInvitationResult> {
  const tokenHash = hashToken(input.token);

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);

  if (!invitation) throw new NotFoundError('Invitation');

  // Constant-time compare on the hashes; the lookup above already narrowed to
  // one row, this guards against a timing signal on the comparison itself.
  const provided = Buffer.from(tokenHash, 'hex');
  const stored = Buffer.from(invitation.tokenHash, 'hex');
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    throw new NotFoundError('Invitation');
  }

  if (invitation.status !== 'pending') {
    throw new DomainRuleError('This invitation is no longer valid', 'errors.invitations.notPending');
  }

  if (invitation.expiresAt.getTime() < Date.now()) {
    await db.update(invitations).set({ status: 'expired' }).where(eq(invitations.id, invitation.id));
    throw new DomainRuleError('This invitation has expired', 'errors.invitations.expired');
  }

  if (invitation.email.toLowerCase() !== input.userEmail.toLowerCase()) {
    throw new DomainRuleError(
      'This invitation was issued to a different email address',
      'errors.invitations.emailMismatch',
    );
  }

  const existingMembership = await findActiveMembership(db, invitation.organizationId, input.userId);

  const membershipId =
    existingMembership?.id ??
    (
      await insertMembership(db, {
        organizationId: invitation.organizationId,
        userId: input.userId,
        status: 'active',
      })
    ).id;

  await ensureRoleAssigned(db, {
    organizationId: invitation.organizationId,
    membershipId,
    userId: input.userId,
    roleId: invitation.roleId,
  });

  await db
    .update(invitations)
    .set({ status: 'accepted', acceptedAt: new Date(), acceptedByUserId: input.userId })
    .where(eq(invitations.id, invitation.id));

  await writeAuditEvent(db, {
    organizationId: invitation.organizationId,
    actorUserId: input.userId,
    action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
    entityType: 'invitation',
    entityId: invitation.id,
    after: { userId: input.userId, membershipId },
  });

  return { organizationId: invitation.organizationId, membershipId };
}

export async function revokeInvitation(context: OrgContext, invitationId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.INVITATIONS_MANAGE);

  const [invitation] = await context.db
    .select({ id: invitations.id, status: invitations.status })
    .from(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, context.organizationId)))
    .limit(1);

  if (!invitation) throw new NotFoundError('Invitation');
  if (invitation.status !== 'pending') {
    throw new DomainRuleError('Only a pending invitation can be revoked', 'errors.invitations.notPending');
  }

  await context.db
    .update(invitations)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(eq(invitations.id, invitationId));

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INVITATION_REVOKED,
    entityType: 'invitation',
    entityId: invitationId,
  });
}

export interface PendingInvitation {
  id: string;
  email: string;
  roleId: string;
  expiresAt: Date;
  createdAt: Date;
}

export async function listPendingInvitations(context: OrgContext): Promise<PendingInvitation[]> {
  assertPermission(context, PERMISSIONS.MEMBERS_READ);

  return context.db
    .select({
      id: invitations.id,
      email: invitations.email,
      roleId: invitations.roleId,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(eq(invitations.organizationId, context.organizationId), eq(invitations.status, 'pending')),
    )
    .orderBy(invitations.createdAt);
}
