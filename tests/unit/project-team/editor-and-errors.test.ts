import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_PROJECT_CAPABILITIES,
  PROJECT_CAPABILITIES as C,
  PROJECT_CAPABILITY_GROUPS,
  expandCapabilities,
  isFinancialCapability,
} from '@/modules/project-team/domain/capabilities';
import { PROJECT_TEMPLATE_KEYS, expandTemplate } from '@/modules/project-team/domain/templates';
import {
  CAPABILITIES_BY_GROUP,
  capabilitiesImplying,
  capabilityMessageKey,
  parseCapabilityList,
  planCapabilityChange,
  toggleCapability,
} from '@/modules/project-team/domain/editor';
import { classifyProjectTeamError } from '@/modules/project-team/application/action-errors';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors';
import { LOCALES } from '@/shared/i18n/config';

describe('capability editor rules', () => {
  it('groups every capability exactly once', () => {
    const grouped = PROJECT_CAPABILITY_GROUPS.flatMap((group) => CAPABILITIES_BY_GROUP[group]);
    expect(grouped.sort()).toEqual([...ALL_PROJECT_CAPABILITIES].sort());
    expect(CAPABILITIES_BY_GROUP.financial.every(isFinancialCapability)).toBe(true);
  });

  it('uses collision-free message keys', () => {
    const keys = ALL_PROJECT_CAPABILITIES.map(capabilityMessageKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => !key.includes('.'))).toBe(true);
  });

  it('turning a capability on adds its implications', () => {
    expect(toggleCapability([], C.CLAIM_CERTIFY, true)).toEqual(
      [...expandCapabilities([C.CLAIM_CERTIFY])].sort(),
    );
  });

  it('turning a capability off also removes everything that implies it', () => {
    const start = toggleCapability([], C.TASKS_MANAGE, true);
    const next = toggleCapability(start, C.TASKS_VIEW, false);
    expect(next).not.toContain(C.TASKS_VIEW);
    expect(next).not.toContain(C.TASKS_MANAGE);
    expect(next).toContain(C.PROJECT_VIEW);
    // Re-expanding must not bring it back (the server stores the closure).
    expect([...expandCapabilities(next)].sort()).toEqual(next);
  });

  it('turning project.view off clears the whole selection', () => {
    const all = toggleCapability(expandTemplate('project_manager_full'), C.PROJECT_VIEW, false);
    expect(all).toEqual([]);
  });

  it('never makes an operational capability imply a financial one', () => {
    for (const financial of CAPABILITIES_BY_GROUP.financial) {
      for (const implying of capabilitiesImplying(financial)) {
        expect(isFinancialCapability(implying), `${implying} -> ${financial}`).toBe(true);
      }
    }
  });

  it('plans changes and flags edits beyond the actor (both directions)', () => {
    const actor = new Set<string>(expandTemplate('project_manager_operational'));
    const accountant = expandTemplate('project_accountant');
    const stripFinancial = planCapabilityChange({
      current: accountant,
      next: [C.PROJECT_VIEW, C.CONTRACTOR_VIEW],
      actor,
      isFinancial: isFinancialCapability,
    });
    expect(stripFinancial.removed).toContain(C.PAYMENT_MANAGE);
    expect(stripFinancial.beyondActor).toContain(C.PAYMENT_MANAGE);
    expect(stripFinancial.addsFinancial).toBe(false);

    const grantFinancial = planCapabilityChange({
      current: [C.PROJECT_VIEW],
      next: [C.PROJECT_VIEW, C.CLAIM_VIEW],
      actor,
      isFinancial: isFinancialCapability,
    });
    expect(grantFinancial.addsFinancial).toBe(true);
    expect(grantFinancial.beyondActor).toContain(C.CLAIM_VIEW);

    const allowed = planCapabilityChange({
      current: [C.PROJECT_VIEW],
      next: [C.TASKS_MANAGE],
      actor,
      isFinancial: isFinancialCapability,
    });
    expect(allowed.beyondActor).toEqual([]);
    expect(allowed.added).toEqual([C.TASKS_MANAGE, C.TASKS_VIEW]);
  });

  it('parses capability lists and drops unknown values', () => {
    expect(parseCapabilityList('claim.certify, nope ,payment.view')).toEqual([C.CLAIM_CERTIFY, C.PAYMENT_VIEW]);
    expect(parseCapabilityList(undefined)).toEqual([]);
  });
});

describe('classifyProjectTeamError (anti-escalation surfaced to the UI)', () => {
  it('maps grant / revoke / deactivate refusals with the blocking capabilities', () => {
    expect(classifyProjectTeamError(new AuthorizationError('project:grant:claim.certify,claim.review'))).toEqual({
      code: 'grantBeyondAuthority',
      capabilities: [C.CLAIM_CERTIFY, C.CLAIM_REVIEW],
    });
    expect(classifyProjectTeamError(new AuthorizationError('project:revoke:payment.manage'))).toEqual({
      code: 'revokeBeyondAuthority',
      capabilities: [C.PAYMENT_MANAGE],
    });
    expect(classifyProjectTeamError(new AuthorizationError('project:deactivate-higher-authority'))?.code).toBe(
      'deactivateHigherAuthority',
    );
    expect(classifyProjectTeamError(new AuthorizationError('project:project_team.manage'))?.code).toBe('notAllowed');
  });

  it('maps validation, conflict, not-found and DB guard errors', () => {
    expect(classifyProjectTeamError(new ConflictError('dup', 'projectTeam.errors.alreadyMember'))?.code).toBe(
      'alreadyMember',
    );
    expect(classifyProjectTeamError(new NotFoundError('Project'))?.code).toBe('notFound');
    expect(
      classifyProjectTeamError(new ValidationError([{ path: 'userId', message: 'Only active organization members' }]))
        ?.code,
    ).toBe('notOrgMember');
    expect(
      classifyProjectTeamError(new ValidationError([{ path: 'capabilities', message: 'needs one' }]))?.code,
    ).toBe('noCapabilities');
    expect(
      classifyProjectTeamError(
        new ValidationError([{ path: 'capabilities', message: 'Unknown project capability' }]),
      )?.code,
    ).toBe('invalidInput');
    expect(classifyProjectTeamError(Object.assign(new Error('x'), { code: '42501' }))?.code).toBe(
      'grantBeyondAuthority',
    );
    expect(
      classifyProjectTeamError(Object.assign(new Error('wrap'), { cause: { code: '23514' } }))?.code,
    ).toBe('notOrgMember');
  });

  it('returns null for unexpected errors so actions rethrow them', () => {
    expect(classifyProjectTeamError(new Error('boom'))).toBeNull();
  });
});

describe('projectTeam locale namespace', () => {
  const load = (locale: string) =>
    JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'src/locales', locale, 'projectTeam.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;

  function flatten(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  }

  const reference = flatten(load('he-IL')).sort();

  it.each(LOCALES)('%s has the same keys as Hebrew and no empty strings', (locale) => {
    const messages = load(locale);
    expect(flatten(messages).sort()).toEqual(reference);
    for (const key of flatten(messages)) {
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
      expect(typeof value === 'string' && value.trim().length > 0, `${locale}:${key}`).toBe(true);
    }
  });

  it('covers every capability, hint, template, group and error code', () => {
    const he = load('he-IL');
    for (const capability of ALL_PROJECT_CAPABILITIES) {
      expect(he.capabilities![capabilityMessageKey(capability)], capability).toBeTruthy();
      expect(he.capabilityHints![capabilityMessageKey(capability)], capability).toBeTruthy();
    }
    for (const key of PROJECT_TEMPLATE_KEYS) expect(he.templates![key], key).toBeTruthy();
    for (const group of PROJECT_CAPABILITY_GROUPS) {
      expect(he.groups![group]).toBeTruthy();
      expect(he.groupDescriptions![group]).toBeTruthy();
    }
    for (const code of [
      'grantBeyondAuthority',
      'revokeBeyondAuthority',
      'deactivateHigherAuthority',
      'notAllowed',
      'alreadyMember',
      'notOrgMember',
      'noCapabilities',
      'unknownTemplate',
      'invalidInput',
      'notFound',
      'someCapabilities',
    ]) {
      expect(he.errors![code], code).toBeTruthy();
    }
  });
});
