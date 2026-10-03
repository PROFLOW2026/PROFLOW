import { describe, expect, it } from 'vitest';
import {
  ALL_PROJECT_CAPABILITIES,
  FINANCIAL_PROJECT_CAPABILITIES,
  IMPLIED_CAPABILITIES,
  PROJECT_CAPABILITIES,
  PROJECT_CAPABILITY_CATALOG,
  expandCapabilities,
  isFinancialCapability,
  isProjectCapability,
} from '@/modules/project-team/domain/capabilities';
import {
  PROJECT_CAPABILITY_TEMPLATES,
  PROJECT_TEMPLATE_KEYS,
  expandTemplate,
  projectCapabilityTemplate,
} from '@/modules/project-team/domain/templates';
import {
  capabilitiesBeyondGrantor,
  resolveProjectCapabilities,
} from '@/modules/project-team/domain/resolve';

const C = PROJECT_CAPABILITIES;

describe('project capability catalog', () => {
  it('has unique keys and classifies every capability', () => {
    expect(new Set(ALL_PROJECT_CAPABILITIES).size).toBe(PROJECT_CAPABILITY_CATALOG.length);
    expect(Object.values(C).sort()).toEqual([...ALL_PROJECT_CAPABILITIES].sort());
  });

  it('defines implications for every capability, referencing only real capabilities', () => {
    for (const capability of ALL_PROJECT_CAPABILITIES) {
      const implied = IMPLIED_CAPABILITIES[capability];
      expect(implied, capability).toBeDefined();
      for (const target of implied) expect(isProjectCapability(target)).toBe(true);
    }
  });

  it('makes every capability reach project.view', () => {
    for (const capability of ALL_PROJECT_CAPABILITIES) {
      expect(expandCapabilities([capability]).has(C.PROJECT_VIEW), capability).toBe(true);
    }
  });

  it('HARD INVARIANT: no operational or administrative capability implies a financial one', () => {
    for (const capability of ALL_PROJECT_CAPABILITIES) {
      if (isFinancialCapability(capability)) continue;
      const closure = expandCapabilities([capability]);
      const leaked = [...closure].filter(isFinancialCapability);
      expect(leaked, `${capability} must not imply financial capabilities`).toEqual([]);
    }
  });

  it('chains certify -> review -> view and manage -> view', () => {
    const certify = expandCapabilities([C.CLAIM_CERTIFY]);
    expect(certify.has(C.CLAIM_REVIEW)).toBe(true);
    expect(certify.has(C.CLAIM_VIEW)).toBe(true);
    expect(expandCapabilities([C.CONTRACT_MANAGE]).has(C.CONTRACT_FINANCIAL_VIEW)).toBe(true);
    expect(expandCapabilities([C.PAYMENT_MANAGE]).has(C.PAYMENT_VIEW)).toBe(true);
  });

  it('ignores unknown capability strings', () => {
    expect([...expandCapabilities(['nope', 'also.nope'])]).toEqual([]);
  });
});

describe('project capability templates', () => {
  it('declares exactly the advertised template keys', () => {
    expect(PROJECT_CAPABILITY_TEMPLATES.map((template) => template.key)).toEqual([...PROJECT_TEMPLATE_KEYS]);
  });

  it('HARD INVARIANT: templates with financialAccess "none" contain no financial capability, even after closure', () => {
    for (const template of PROJECT_CAPABILITY_TEMPLATES) {
      if (template.financialAccess !== 'none') continue;
      const closure = expandTemplate(template.key);
      expect(
        closure.filter(isFinancialCapability),
        `${template.key} must expose zero financial capabilities`,
      ).toEqual([]);
    }
  });

  it('gives financial templates at least one financial capability', () => {
    for (const template of PROJECT_CAPABILITY_TEMPLATES) {
      if (template.financialAccess === 'none') continue;
      expect(expandTemplate(template.key).some(isFinancialCapability), template.key).toBe(true);
    }
  });

  it('separates the operational PM from the full PM exactly on financial and administrative scope', () => {
    const full = new Set(expandTemplate('project_manager_full'));
    const operational = new Set(expandTemplate('project_manager_operational'));
    for (const capability of FINANCIAL_PROJECT_CAPABILITIES) {
      expect(full.has(capability)).toBe(true);
      expect(operational.has(capability)).toBe(false);
    }
    expect(full.size).toBe(ALL_PROJECT_CAPABILITIES.length);
  });

  it('keeps the site manager operational: no prices, claims, retention or payments', () => {
    const site = new Set(expandTemplate('site_manager'));
    for (const forbidden of [
      C.CONTRACT_FINANCIAL_VIEW,
      C.CLAIM_VIEW,
      C.CLAIM_CERTIFY,
      C.RETENTION_MANAGE,
      C.PAYMENT_VIEW,
      C.PROJECT_BUDGET_VIEW,
      C.FINANCIAL_VIEW,
    ]) {
      expect(site.has(forbidden), forbidden).toBe(false);
    }
    expect(site.has(C.PROGRESS_VERIFY)).toBe(true);
    expect(site.has(C.TASKS_MANAGE)).toBe(true);
  });

  it('exposes template lookups', () => {
    expect(projectCapabilityTemplate('foreman').name).toBe('Foreman');
    expect(() => projectCapabilityTemplate('nope' as never)).toThrow();
  });
});

describe('resolveProjectCapabilities', () => {
  it('gives org project admins everything', () => {
    const caps = resolveProjectCapabilities({ isOrgProjectAdmin: true, member: null });
    expect(caps.size).toBe(ALL_PROJECT_CAPABILITIES.length);
  });

  it('gives nothing to non-members', () => {
    expect(resolveProjectCapabilities({ isOrgProjectAdmin: false, member: null }).size).toBe(0);
  });

  it('gives nothing to inactive members', () => {
    const caps = resolveProjectCapabilities({
      isOrgProjectAdmin: false,
      member: { status: 'inactive', capabilities: [C.CLAIM_CERTIFY] },
    });
    expect(caps.size).toBe(0);
  });

  it('expands stored capabilities of active members', () => {
    const caps = resolveProjectCapabilities({
      isOrgProjectAdmin: false,
      member: { status: 'active', capabilities: [C.CLAIM_CERTIFY] },
    });
    expect(caps.has(C.CLAIM_REVIEW)).toBe(true);
    expect(caps.has(C.PROJECT_VIEW)).toBe(true);
    expect(caps.has(C.PAYMENT_MANAGE)).toBe(false);
  });
});

describe('capabilitiesBeyondGrantor (anti-escalation)', () => {
  it('allows granting a subset', () => {
    const grantor = new Set(expandCapabilities(expandTemplate('site_manager')));
    expect(capabilitiesBeyondGrantor(grantor, [C.TASKS_MANAGE, C.DEFECTS_MANAGE])).toEqual([]);
  });

  it('flags financial capabilities the grantor does not hold, including implied ones', () => {
    const grantor = new Set(expandCapabilities(expandTemplate('project_manager_operational')));
    const beyond = capabilitiesBeyondGrantor(grantor, [C.CLAIM_CERTIFY]);
    expect(beyond).toEqual(
      expect.arrayContaining([C.CLAIM_CERTIFY, C.CLAIM_REVIEW, C.CLAIM_VIEW]),
    );
  });
});
