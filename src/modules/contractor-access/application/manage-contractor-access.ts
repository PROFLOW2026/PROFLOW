import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { profiles, projects, subcontractAgreements, vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { recordAuditEvent } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { internalActor } from '@/shared/actor';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import type { ExternalCapability } from '@/shared/external';
import { isLocale } from '@/shared/i18n/config';
import {
  PROJECT_CAPABILITIES,
  isOrgProjectAdmin,
  loadProjectCapabilities,
  type ProjectCapability,
} from '@/modules/project-team';
import {
  findContractorGrant,
  findContractorPrincipalById,
  insertContractorGrant,
  insertContractorPrincipal,
  insertContractorToken,
  isUsernameTaken,
  latestOpenTokenExpiry,
  listOrgContractorPrincipalsForVendors,
  listOrgGrantsForPrincipal,
  listProjectContractorGrants,
  revokeOpenContractorTokens,
  updateContractorGrant,
  updateContractorPrincipal,
  type ContractorPrincipalRow,
} from '../data/contractor-access.repository';
import {
  GrantRuleError,
  assertGrantAllowed,
  isGrantTemplateChoice,
  resolveGrantCapabilities,
  type GrantTemplateChoice,
} from '../domain/grant-policy';
import { contractorAuthEmail, suggestContractorUsername, validateContractorUsername } from '../domain/username';
import {
  contractorTokenPath,
  generateContractorToken,
  hashContractorToken,
  tokenExpiry,
  type ContractorTokenPurpose,
} from '../domain/tokens';
import type { ContractorAuthPort } from './auth-port';

/**
 * Internal (Owner / Employee app) management of contractor accounts and grants for ONE project.
 *
 * Authorization: project capabilities `contractor.invite` (new accounts) / `external_access.manage`
 * (grants, links, disable) via `@/modules/project-team`; the DB mirrors it with the RESTRICTIVE
 * policies of 0156 (`app.can_manage_contractor_access`). Account identity rows (`profiles`,
 * `external_principals`) have no organization, so they are written with the service role inside the
 * caller's transaction AFTER the capability check (same pattern as `asServiceRoleWrite` elsewhere).
 */

export interface ContractorAccessDeps {
  readonly auth: ContractorAuthPort;
}

const err = (key: string, message = key) => new DomainRuleError(message, `contractorAccess.errors.${key}`);

function mapGrantRule(error: unknown): never {
  if (error instanceof GrantRuleError) throw err(error.violation);
  throw error;
}

export interface ContractorAccessAuthority {
  readonly canView: boolean;
  readonly canInvite: boolean;
  readonly canManage: boolean;
  readonly canGrantFinancial: boolean;
  readonly isOrgAdmin: boolean;
}

export async function loadContractorAccessAuthority(
  context: OrgContext,
  projectId: string,
): Promise<ContractorAccessAuthority> {
  const held = await loadProjectCapabilities(context, projectId);
  const isOrgAdmin = isOrgProjectAdmin(context);
  const canInvite = held.has(PROJECT_CAPABILITIES.CONTRACTOR_INVITE as ProjectCapability);
  const canManage = held.has(PROJECT_CAPABILITIES.EXTERNAL_ACCESS_MANAGE as ProjectCapability);
  return {
    canView: canInvite || canManage,
    canInvite,
    canManage,
    canGrantFinancial: isOrgAdmin || held.has(PROJECT_CAPABILITIES.CONTRACT_FINANCIAL_VIEW as ProjectCapability),
    isOrgAdmin,
  };
}

async function requireAuthority(
  context: OrgContext,
  projectId: string,
  need: 'view' | 'invite' | 'manage',
): Promise<ContractorAccessAuthority> {
  const authority = await loadContractorAccessAuthority(context, projectId);
  const ok = need === 'view' ? authority.canView : need === 'invite' ? authority.canInvite : authority.canManage;
  if (!ok) {
    throw new AuthorizationError(
      need === 'invite' ? `project:${PROJECT_CAPABILITIES.CONTRACTOR_INVITE}` : `project:${PROJECT_CAPABILITIES.EXTERNAL_ACCESS_MANAGE}`,
    );
  }
  const [project] = await context.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);
  if (!project) throw new NotFoundError('Project');
  return authority;
}

async function assertVendorAndAgreement(
  context: OrgContext,
  input: { projectId: string; vendorId: string; subcontractAgreementId: string | null },
): Promise<{ vendorName: string }> {
  return asServiceRoleWrite(context.db, async () => {
    const [vendor] = await context.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.id, input.vendorId), eq(vendors.organizationId, context.organizationId)))
      .limit(1);
    if (!vendor) throw new NotFoundError('Vendor');
    if (input.subcontractAgreementId) {
      const [agreement] = await context.db
        .select({ id: subcontractAgreements.id })
        .from(subcontractAgreements)
        .where(
          and(
            eq(subcontractAgreements.id, input.subcontractAgreementId),
            eq(subcontractAgreements.organizationId, context.organizationId),
            eq(subcontractAgreements.vendorId, input.vendorId),
            eq(subcontractAgreements.projectId, input.projectId),
            isNull(subcontractAgreements.archivedAt),
          ),
        )
        .limit(1);
      if (!agreement) throw new NotFoundError('Subcontract agreement');
    }
    return { vendorName: vendor.name };
  });
}

function unusablePassword(): string {
  // Random, never shown; replaced at activation. Satisfies any Supabase password policy.
  return `${randomBytes(24).toString('base64url')}Aa1!`;
}

async function issueToken(
  context: OrgContext,
  input: { projectId: string; principalId: string; purpose: ContractorTokenPurpose },
): Promise<{ path: string; expiresAt: Date }> {
  const token = generateContractorToken();
  const expiresAt = tokenExpiry(input.purpose);
  await revokeOpenContractorTokens(context.db, input.principalId, input.purpose);
  await insertContractorToken(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    principalId: input.principalId,
    purpose: input.purpose,
    tokenHash: hashContractorToken(token),
    expiresAt,
    createdByUserId: context.userId,
  });
  const locale = isLocale(context.locale) ? context.locale : 'he-IL';
  return { path: contractorTokenPath(locale, input.purpose, token), expiresAt };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface ContractorGrantSummary {
  readonly grantId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly projectId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly agreementTitle: string | null;
  readonly templateKey: string | null;
  readonly capabilities: readonly string[];
  readonly status: string;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export interface ContractorAccountSummary {
  readonly principalId: string;
  readonly displayName: string | null;
  readonly username: string | null;
  readonly contactEmail: string | null;
  readonly phone: string | null;
  readonly status: string;
  readonly isHomeOrganization: boolean;
  readonly lastSignInAt: Date | null;
  readonly passwordResetRequestedAt: Date | null;
  readonly lockedUntil: Date | null;
  readonly openLink: { readonly purpose: string; readonly expiresAt: Date } | null;
  readonly grants: readonly ContractorGrantSummary[];
}

export interface ContractorAccessOverview {
  readonly authority: ContractorAccessAuthority;
  readonly vendors: ReadonlyArray<{ id: string; name: string }>;
  readonly agreements: ReadonlyArray<{ id: string; title: string; vendorId: string }>;
  readonly accounts: readonly ContractorAccountSummary[];
  readonly existingPrincipals: ReadonlyArray<{ principalId: string; vendorId: string; label: string }>;
}

/** Read-only grant rows for a project contractor list (no service-role write). */
export async function listProjectContractorGrantsForProject(
  context: OrgContext,
  projectId: string,
): Promise<Awaited<ReturnType<typeof listProjectContractorGrants>>> {
  return listProjectContractorGrants(context.db, context.organizationId, projectId);
}

export async function getContractorAccessOverview(
  context: OrgContext,
  projectId: string,
): Promise<ContractorAccessOverview> {
  const authority = await requireAuthority(context, projectId, 'view');

  return asServiceRoleWrite(context.db, async () => {
    const vendorRows = await context.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.organizationId, context.organizationId), eq(vendors.status, 'active')))
      .orderBy(asc(vendors.name))
      .limit(500);
    const agreementRows = await context.db
      .select({ id: subcontractAgreements.id, title: subcontractAgreements.title, vendorId: subcontractAgreements.vendorId })
      .from(subcontractAgreements)
      .where(
        and(
          eq(subcontractAgreements.organizationId, context.organizationId),
          eq(subcontractAgreements.projectId, projectId),
          isNull(subcontractAgreements.archivedAt),
          ne(subcontractAgreements.status, 'cancelled'),
        ),
      )
      .orderBy(asc(subcontractAgreements.title))
      .limit(500);
    const grantRows = await listProjectContractorGrants(context.db, context.organizationId, projectId);

    const byPrincipal = new Map<string, { principal: ContractorPrincipalRow; grants: ContractorGrantSummary[] }>();
    for (const row of grantRows) {
      const entry = byPrincipal.get(row.principal.id) ?? { principal: row.principal, grants: [] };
      entry.grants.push({
        grantId: row.grant.id,
        vendorId: row.grant.vendorId!,
        vendorName: row.vendorName,
        projectId: row.grant.projectId,
        subcontractAgreementId: row.grant.subcontractAgreementId,
        agreementTitle: row.agreementTitle,
        templateKey: row.grant.templateKey,
        capabilities: row.grant.scopes,
        status: row.grant.status,
        expiresAt: row.grant.expiresAt,
        revokedAt: row.grant.revokedAt,
        createdAt: row.grant.createdAt,
      });
      byPrincipal.set(row.principal.id, entry);
    }
    const openLinks = await latestOpenTokenExpiry(context.db, [...byPrincipal.keys()]);
    const accounts: ContractorAccountSummary[] = [...byPrincipal.values()].map(({ principal, grants }) => ({
      principalId: principal.id,
      displayName: principal.displayName,
      username: principal.username,
      contactEmail: principal.contactEmail,
      phone: principal.phone,
      status: principal.status,
      isHomeOrganization: principal.homeOrganizationId === context.organizationId,
      lastSignInAt: principal.lastSignInAt,
      passwordResetRequestedAt: principal.passwordResetRequestedAt,
      lockedUntil: principal.lockedUntil,
      openLink: openLinks.get(principal.id) ?? null,
      grants,
    }));

    const existing = await listOrgContractorPrincipalsForVendors(
      context.db,
      context.organizationId,
      vendorRows.map((vendor) => vendor.id),
    );

    return {
      authority,
      vendors: vendorRows,
      agreements: agreementRows,
      accounts,
      existingPrincipals: existing.map((row) => ({
        principalId: row.principalId,
        vendorId: row.vendorId,
        label: row.displayName ? `${row.displayName} (${row.username ?? ''})` : (row.username ?? row.principalId),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Invite (new account + first grant + activation link)
// ---------------------------------------------------------------------------

export interface GrantScopeChoice {
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId?: string | null;
  /** Vendor-wide in this organization (all projects). Org project admins only. */
  readonly allProjects?: boolean;
  readonly template: string;
  readonly capabilities?: readonly string[];
  readonly expiresAt?: Date | null;
}

export interface InviteContractorInput extends GrantScopeChoice {
  readonly displayName: string;
  readonly username?: string | null;
  readonly contactEmail?: string | null;
  readonly phone?: string | null;
  readonly locale?: string | null;
}

export interface InviteContractorResult {
  readonly principalId: string;
  readonly grantId: string;
  readonly username: string;
  readonly activationPath: string;
  readonly activationExpiresAt: Date;
}

function resolveScope(input: GrantScopeChoice, authority: ContractorAccessAuthority) {
  if (!isGrantTemplateChoice(input.template)) throw err('unknown_template');
  let capabilities: ExternalCapability[];
  try {
    capabilities = resolveGrantCapabilities(input.template as GrantTemplateChoice, input.capabilities);
  } catch (error) {
    mapGrantRule(error);
  }
  const scope = {
    projectId: input.allProjects ? null : input.projectId,
    subcontractAgreementId: input.allProjects ? null : (input.subcontractAgreementId ?? null),
    expiresAt: input.expiresAt ?? null,
  };
  try {
    assertGrantAllowed(scope, capabilities, {
      isOrgProjectAdmin: authority.isOrgAdmin,
      canGrantFinancial: authority.canGrantFinancial,
    });
  } catch (error) {
    mapGrantRule(error);
  }
  return { scope, capabilities, templateKey: input.template };
}

export async function inviteContractor(
  context: OrgContext,
  deps: ContractorAccessDeps,
  input: InviteContractorInput,
): Promise<InviteContractorResult> {
  const authority = await requireAuthority(context, input.projectId, 'invite');
  const displayName = input.displayName.trim();
  if (!displayName) throw err('display_name_required');
  const { scope, capabilities, templateKey } = resolveScope(input, authority);
  const { vendorName } = await assertVendorAndAgreement(context, {
    projectId: input.projectId,
    vendorId: input.vendorId,
    subcontractAgreementId: scope.subcontractAgreementId,
  });

  const requested = input.username?.trim() || suggestContractorUsername(displayName, vendorName);
  const check = validateContractorUsername(requested);
  if (!check.valid) throw err('invalid_username');
  const usernameTaken = await asServiceRoleWrite(context.db, () => isUsernameTaken(context.db, check.normalized));
  if (usernameTaken) throw new ConflictError('Username taken', 'contractorAccess.errors.username_taken');

  const locale = input.locale && isLocale(input.locale) ? input.locale : isLocale(context.locale) ? context.locale : 'he-IL';
  const email = contractorAuthEmail(check.normalized);
  const { authUserId } = await deps.auth.createUser({ email, password: unusablePassword(), displayName });

  try {
    const principalId = await asServiceRoleWrite(context.db, async () => {
      await context.db
        .insert(profiles)
        .values({ id: authUserId, email, displayName, localePreference: locale })
        .onConflictDoNothing({ target: profiles.id });
      return insertContractorPrincipal(context.db, {
        email,
        displayName,
        authUserId,
        status: 'invited',
        username: requested.trim(),
        usernameNormalized: check.normalized,
        contactEmail: input.contactEmail?.trim() || null,
        phone: input.phone?.trim() || null,
        locale,
        homeOrganizationId: context.organizationId,
        homeProjectId: input.projectId,
        createdByUserId: context.userId,
      });
    });

    const grantId = await insertContractorGrant(context.db, {
      organizationId: context.organizationId,
      principalId,
      vendorId: input.vendorId,
      projectId: scope.projectId,
      subcontractAgreementId: scope.subcontractAgreementId,
      scopes: [...capabilities],
      expiresAt: scope.expiresAt,
      templateKey,
      grantedByUserId: context.userId,
    });
    const link = await issueToken(context, { projectId: input.projectId, principalId, purpose: 'invite' });

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_INVITED,
      entityType: 'external_principal',
      entityId: principalId,
      after: { username: check.normalized, vendorId: input.vendorId, projectId: input.projectId },
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.EXTERNAL_GRANT_CREATED,
      entityType: 'external_access_grant',
      entityId: grantId,
      after: { principalId, ...scope, capabilities, templateKey },
    });
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.EXTERNAL_PRINCIPAL_INVITED,
      entityType: 'external_principal',
      entityId: principalId,
      actor: internalActor(context.userId),
      payload: { vendorId: input.vendorId, grantId },
    });
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.EXTERNAL_GRANT_CREATED,
      entityType: 'external_access_grant',
      entityId: grantId,
      actor: internalActor(context.userId),
      payload: { principalId, vendorId: input.vendorId, subcontractAgreementId: scope.subcontractAgreementId },
    });

    return {
      principalId,
      grantId,
      username: check.normalized,
      activationPath: link.path,
      activationExpiresAt: link.expiresAt,
    };
  } catch (error) {
    await deps.auth.deleteUser(authUserId).catch(() => undefined);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Grants for existing accounts
// ---------------------------------------------------------------------------

async function loadManageablePrincipal(
  context: OrgContext,
  principalId: string,
  options: { requireHome: boolean },
): Promise<ContractorPrincipalRow> {
  const principal = await asServiceRoleWrite(context.db, async () => {
    const row = await findContractorPrincipalById(context.db, principalId);
    if (!row) return null;
    const isHome = row.homeOrganizationId === context.organizationId;
    if (options.requireHome) return isHome ? row : null;
    if (isHome) return row;
    const grants = await listOrgGrantsForPrincipal(context.db, context.organizationId, principalId);
    return grants.length > 0 ? row : null;
  });
  // No existence oracle across organizations.
  if (!principal) throw new NotFoundError('Contractor account');
  return principal;
}

export interface GrantContractorAccessInput extends GrantScopeChoice {
  readonly principalId: string;
}

export async function grantContractorAccess(
  context: OrgContext,
  input: GrantContractorAccessInput,
): Promise<{ grantId: string }> {
  const authority = await requireAuthority(context, input.projectId, 'manage');
  await loadManageablePrincipal(context, input.principalId, { requireHome: false });
  const { scope, capabilities, templateKey } = resolveScope(input, authority);
  await assertVendorAndAgreement(context, {
    projectId: input.projectId,
    vendorId: input.vendorId,
    subcontractAgreementId: scope.subcontractAgreementId,
  });

  const live = await asServiceRoleWrite(context.db, () =>
    listOrgGrantsForPrincipal(context.db, context.organizationId, input.principalId),
  );
  const duplicate = live.some(
    (grant) =>
      grant.vendorId === input.vendorId &&
      grant.projectId === scope.projectId &&
      grant.subcontractAgreementId === scope.subcontractAgreementId,
  );
  if (duplicate) throw new ConflictError('Grant exists', 'contractorAccess.errors.grant_exists');

  const grantId = await insertContractorGrant(context.db, {
    organizationId: context.organizationId,
    principalId: input.principalId,
    vendorId: input.vendorId,
    projectId: scope.projectId,
    subcontractAgreementId: scope.subcontractAgreementId,
    scopes: [...capabilities],
    expiresAt: scope.expiresAt,
    templateKey,
    grantedByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXTERNAL_GRANT_CREATED,
    entityType: 'external_access_grant',
    entityId: grantId,
    after: { principalId: input.principalId, ...scope, capabilities, templateKey },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.EXTERNAL_GRANT_CREATED,
    entityType: 'external_access_grant',
    entityId: grantId,
    actor: internalActor(context.userId),
    payload: { principalId: input.principalId, vendorId: input.vendorId, subcontractAgreementId: scope.subcontractAgreementId },
  });
  return { grantId };
}

async function loadManageableGrant(context: OrgContext, projectId: string, grantId: string) {
  const authority = await requireAuthority(context, projectId, 'manage');
  const grant = await findContractorGrant(context.db, context.organizationId, grantId);
  if (!grant || (grant.projectId !== null && grant.projectId !== projectId)) throw new NotFoundError('Contractor grant');
  if (grant.projectId === null && !authority.isOrgAdmin) {
    throw new AuthorizationError(`permission:project_team.admin`);
  }
  return { authority, grant };
}

export interface UpdateContractorGrantInput {
  readonly projectId: string;
  readonly grantId: string;
  readonly template: string;
  readonly capabilities?: readonly string[];
  readonly expiresAt?: Date | null;
}

export async function updateContractorGrantCapabilities(
  context: OrgContext,
  input: UpdateContractorGrantInput,
): Promise<void> {
  const { authority, grant } = await loadManageableGrant(context, input.projectId, input.grantId);
  if (grant.status !== 'active') throw err('grant_not_active');
  if (!isGrantTemplateChoice(input.template)) throw err('unknown_template');
  let capabilities: ExternalCapability[];
  try {
    capabilities = resolveGrantCapabilities(input.template as GrantTemplateChoice, input.capabilities);
    assertGrantAllowed(
      { projectId: grant.projectId, subcontractAgreementId: grant.subcontractAgreementId, expiresAt: input.expiresAt ?? null },
      capabilities,
      { isOrgProjectAdmin: authority.isOrgAdmin, canGrantFinancial: authority.canGrantFinancial },
    );
  } catch (error) {
    mapGrantRule(error);
  }
  await updateContractorGrant(context.db, context.organizationId, grant.id, {
    scopes: [...capabilities],
    templateKey: input.template,
    expiresAt: input.expiresAt ?? null,
    updatedByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXTERNAL_GRANT_UPDATED,
    entityType: 'external_access_grant',
    entityId: grant.id,
    before: { capabilities: grant.scopes, templateKey: grant.templateKey, expiresAt: grant.expiresAt },
    after: { capabilities, templateKey: input.template, expiresAt: input.expiresAt ?? null },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.EXTERNAL_GRANT_UPDATED,
    entityType: 'external_access_grant',
    entityId: grant.id,
    actor: internalActor(context.userId),
    payload: { principalId: grant.principalId },
  });
}

export async function revokeContractorGrant(
  context: OrgContext,
  input: { projectId: string; grantId: string; reason?: string | null },
): Promise<void> {
  const { grant } = await loadManageableGrant(context, input.projectId, input.grantId);
  if (grant.status !== 'active') return;
  const now = new Date();
  await updateContractorGrant(context.db, context.organizationId, grant.id, {
    status: 'revoked',
    revokedAt: now,
    revokedByUserId: context.userId,
    revokeReason: input.reason?.trim() || null,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXTERNAL_GRANT_REVOKED,
    entityType: 'external_access_grant',
    entityId: grant.id,
    before: { status: grant.status },
    after: { status: 'revoked', reason: input.reason?.trim() || null },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.EXTERNAL_GRANT_REVOKED,
    entityType: 'external_access_grant',
    entityId: grant.id,
    actor: internalActor(context.userId),
    payload: { principalId: grant.principalId },
  });
}

// ---------------------------------------------------------------------------
// Account lifecycle (home organization only)
// ---------------------------------------------------------------------------

export async function reissueContractorInvite(
  context: OrgContext,
  input: { projectId: string; principalId: string },
): Promise<{ activationPath: string; expiresAt: Date }> {
  await requireAuthority(context, input.projectId, 'invite');
  const principal = await loadManageablePrincipal(context, input.principalId, { requireHome: true });
  if (principal.status !== 'invited') throw err('not_invited');
  const link = await issueToken(context, { projectId: input.projectId, principalId: principal.id, purpose: 'invite' });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_INVITE_REISSUED,
    entityType: 'external_principal',
    entityId: principal.id,
  });
  return { activationPath: link.path, expiresAt: link.expiresAt };
}

export async function issueContractorPasswordReset(
  context: OrgContext,
  input: { projectId: string; principalId: string },
): Promise<{ resetPath: string; expiresAt: Date }> {
  await requireAuthority(context, input.projectId, 'manage');
  const principal = await loadManageablePrincipal(context, input.principalId, { requireHome: true });
  if (principal.status !== 'active') throw err('not_active');
  const link = await issueToken(context, { projectId: input.projectId, principalId: principal.id, purpose: 'password_reset' });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_PASSWORD_RESET_ISSUED,
    entityType: 'external_principal',
    entityId: principal.id,
  });
  return { resetPath: link.path, expiresAt: link.expiresAt };
}

export async function revokeContractorSessions(
  context: OrgContext,
  input: { projectId: string; principalId: string },
): Promise<void> {
  await requireAuthority(context, input.projectId, 'manage');
  const principal = await loadManageablePrincipal(context, input.principalId, { requireHome: true });
  await asServiceRoleWrite(context.db, () =>
    updateContractorPrincipal(context.db, principal.id, { sessionsRevokedAt: new Date() }),
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_SESSIONS_REVOKED,
    entityType: 'external_principal',
    entityId: principal.id,
  });
}

export async function setContractorAccountDisabled(
  context: OrgContext,
  deps: ContractorAccessDeps,
  input: { projectId: string; principalId: string; disabled: boolean },
): Promise<void> {
  await requireAuthority(context, input.projectId, 'manage');
  const principal = await loadManageablePrincipal(context, input.principalId, { requireHome: true });
  if (!principal.authUserId) throw new NotFoundError('Contractor account');
  const now = new Date();
  if (input.disabled) {
    if (principal.status === 'disabled') return;
    await asServiceRoleWrite(context.db, async () => {
      await updateContractorPrincipal(context.db, principal.id, {
        status: 'disabled',
        disabledAt: now,
        disabledByUserId: context.userId,
        sessionsRevokedAt: now,
      });
      await revokeOpenContractorTokens(context.db, principal.id, undefined, now);
    });
  } else {
    if (principal.status !== 'disabled') return;
    await asServiceRoleWrite(context.db, () =>
      updateContractorPrincipal(context.db, principal.id, {
        // Re-enabled accounts that never activated go back to "invited".
        status: principal.passwordSetAt ? 'active' : 'invited',
        disabledAt: null,
        disabledByUserId: null,
        failedSignInCount: 0,
        lockedUntil: null,
      }),
    );
  }
  await recordAuditEvent(context, {
    action: input.disabled ? AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_DISABLED : AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_ENABLED,
    entityType: 'external_principal',
    entityId: principal.id,
    before: { status: principal.status },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: input.disabled ? DOMAIN_EVENTS.EXTERNAL_PRINCIPAL_DISABLED : DOMAIN_EVENTS.EXTERNAL_PRINCIPAL_ENABLED,
    entityType: 'external_principal',
    entityId: principal.id,
    actor: internalActor(context.userId),
  });
  // Auth-side ban last: if it fails the DB state (authoritative for every request) is already correct.
  await deps.auth.setBanned(principal.authUserId, input.disabled);
}
