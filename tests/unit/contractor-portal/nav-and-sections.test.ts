import { describe, expect, it } from 'vitest';
import {
  activeContractorMobileTab,
  activePortalNavKey,
  buildPortalMobileNav,
  buildPortalPrimaryNav,
  buildPortalProjectNav,
  mergeSectionResults,
  planPortalSections,
  PORTAL_ROUTES,
  PORTAL_SECTIONS,
  PORTAL_TODAY_SECTION_IDS,
  projectIdFromPortalPath,
  resolvePortalProjects,
  type PortalProjectAccess,
  type PortalRouteDefinition,
  type PortalSectionProvider,
} from '@/modules/contractor-portal';
import { EXTERNAL_CAPABILITIES as CAP, type ExternalGrantView } from '@/shared/external';

const ORG = 'org-1';
const ALL_IMPLEMENTED: readonly PortalRouteDefinition[] = PORTAL_ROUTES.map((route) => ({
  ...route,
  implemented: true,
}));

function grant(
  overrides: Partial<Omit<ExternalGrantView, 'capabilities'>> & { capabilities: readonly string[] },
): ExternalGrantView {
  return {
    grantId: overrides.grantId ?? 'g1',
    organizationId: overrides.organizationId ?? ORG,
    vendorId: overrides.vendorId ?? 'vendor-a',
    projectId: overrides.projectId === undefined ? 'p1' : overrides.projectId,
    subcontractAgreementId: overrides.subcontractAgreementId ?? null,
    capabilities: new Set(overrides.capabilities),
    expiresAt: overrides.expiresAt ?? null,
  };
}

function project(projectId: string, capabilities: readonly string[], vendorId = 'vendor-a'): PortalProjectAccess {
  return {
    organizationId: ORG,
    organizationName: 'Builder Ltd',
    projectId,
    projectName: `Project ${projectId}`,
    projectNumber: null,
    vendors: [{ vendorId, vendorName: 'Vendor' }],
    grantIds: [`g-${projectId}`],
    capabilities: new Set(capabilities),
  };
}

function provider(
  id: string,
  section: PortalSectionProvider['section'],
  capability: PortalSectionProvider['capability'],
): PortalSectionProvider {
  return {
    id,
    section,
    capability,
    load: async () => ({ count: 0, attentionCount: 0, items: [] }),
  };
}

describe('portal navigation filtering', () => {
  it('shows only implemented routes', () => {
    const primary = buildPortalPrimaryNav().map((item) => item.key);
    expect(primary).toContain('dashboard');
    expect(primary).toContain('notifications');
    for (const key of primary) {
      expect(PORTAL_ROUTES.find((route) => route.key === key)!.implemented).toBe(true);
    }
    const unimplemented = PORTAL_ROUTES.map((route) => ({ ...route, implemented: false }));
    expect(buildPortalPrimaryNav(unimplemented)).toEqual([]);
    expect(buildPortalProjectNav('p1', new Set([CAP.PROJECT_VIEW, CAP.TASK_WORK]), unimplemented)).toEqual([]);
  });

  it('filters project nav strictly by capability', () => {
    const operational = buildPortalProjectNav('p1', new Set([CAP.PROJECT_VIEW, CAP.TASK_REPORT, CAP.PLAN_VIEW]), ALL_IMPLEMENTED);
    const keys = operational.map((item) => item.key);
    expect(keys).toEqual(['project.home', 'project.tasks', 'project.plans']);
    expect(operational.find((item) => item.key === 'project.tasks')!.href).toBe('/contractor/projects/p1/tasks');
  });

  it('never shows financial pages without financial capabilities', () => {
    const operational = buildPortalProjectNav(
      'p1',
      new Set(Object.values(CAP).filter((cap) => !/^ext\.(claim|payment|contract|change)\./.test(cap))),
      ALL_IMPLEMENTED,
    ).map((item) => item.key);
    expect(operational).not.toContain('project.claims');
    expect(operational).not.toContain('project.payments');

    const financial = buildPortalProjectNav('p1', new Set([CAP.PROJECT_VIEW, CAP.CLAIM_VIEW, CAP.PAYMENT_VIEW]), ALL_IMPLEMENTED).map(
      (item) => item.key,
    );
    expect(financial).toEqual(['project.home', 'project.claims', 'project.payments']);
  });

  it('never includes detail or auth routes', () => {
    const everything = buildPortalProjectNav('p1', new Set(Object.values(CAP)), ALL_IMPLEMENTED).map((item) => item.key);
    expect(everything).not.toContain('project.task');
    expect(everything).not.toContain('project.contract');
    expect(buildPortalPrimaryNav(ALL_IMPLEMENTED).map((item) => item.key)).not.toContain('auth.signIn');
  });

  it('resolves active item by longest prefix and project id from the path', () => {
    const items = buildPortalProjectNav('p1', new Set([CAP.PROJECT_VIEW, CAP.TASK_WORK]), ALL_IMPLEMENTED);
    expect(activePortalNavKey('/contractor/projects/p1/tasks/t9', items)).toBe('project.tasks');
    expect(activePortalNavKey('/contractor/projects/p1', items)).toBe('project.home');
    expect(projectIdFromPortalPath('/contractor/projects/p1/tasks')).toBe('p1');
    expect(projectIdFromPortalPath('/contractor/notifications')).toBeNull();
  });

  it('exposes five fixed mobile tabs with stable hrefs', () => {
    const tabs = buildPortalMobileNav();
    expect(tabs.map((item) => item.key)).toEqual(['today', 'projects', 'work', 'finance', 'more']);
    expect(tabs[0]!.href).toBe('/contractor');
    expect(tabs[1]!.href).toBe('/contractor/projects');
    expect(tabs[2]!.href).toBe('/contractor/work');
    expect(tabs[3]!.href).toBe('/contractor/finance');
    expect(tabs[4]!.href).toBe('/contractor/more');
  });

  it('highlights the correct mobile tab for hub and deep links', () => {
    expect(activeContractorMobileTab('/contractor')).toBe('today');
    expect(activeContractorMobileTab('/contractor/projects')).toBe('projects');
    expect(activeContractorMobileTab('/contractor/projects/p1')).toBe('projects');
    expect(activeContractorMobileTab('/contractor/projects/p1/tasks')).toBe('work');
    expect(activeContractorMobileTab('/contractor/projects/p1/claims')).toBe('finance');
    expect(activeContractorMobileTab('/contractor/account')).toBe('more');
    expect(activeContractorMobileTab('/contractor/work')).toBe('work');
  });

  it('limits TODAY dashboard sections to the urgent subset', () => {
    expect(PORTAL_TODAY_SECTION_IDS).toEqual(['today', 'overdueTasks', 'acknowledgements', 'notifications']);
  });
});

describe('portal project access', () => {
  it('derives capabilities from session grants and drops foreign directory rows', () => {
    const grants = [
      grant({ grantId: 'g1', projectId: 'p1', capabilities: [CAP.PROJECT_VIEW, CAP.TASK_WORK] }),
      grant({ grantId: 'g2', projectId: null, vendorId: 'vendor-a', capabilities: [CAP.PROJECT_VIEW, CAP.CLAIM_VIEW] }),
    ];
    const projects = resolvePortalProjects(grants, [
      { grantId: 'g2', organizationId: ORG, organizationName: 'Builder', vendorId: 'vendor-a', vendorName: 'A', projectId: 'p2', projectName: 'Tower', projectNumber: null },
      // Not a session grant -> ignored.
      { grantId: 'gX', organizationId: ORG, organizationName: 'Builder', vendorId: 'vendor-b', vendorName: 'B', projectId: 'p3', projectName: 'Other', projectNumber: null },
      // Vendor mismatch for g2 -> ignored.
      { grantId: 'g2', organizationId: ORG, organizationName: 'Builder', vendorId: 'vendor-b', vendorName: 'B', projectId: 'p4', projectName: 'Spoof', projectNumber: null },
    ]);
    expect(projects.map((entry) => entry.projectId).sort()).toEqual(['p1', 'p2']);
    const p1 = projects.find((entry) => entry.projectId === 'p1')!;
    expect(p1.capabilities.has(CAP.TASK_WORK)).toBe(true);
    expect(p1.capabilities.has(CAP.CLAIM_VIEW)).toBe(false);
    const p2 = projects.find((entry) => entry.projectId === 'p2')!;
    expect(p2.capabilities.has(CAP.CLAIM_VIEW)).toBe(true);
    expect(p2.capabilities.has(CAP.TASK_WORK)).toBe(false);
  });

  it('excludes expired grants and grants without ext.project.view', () => {
    const projects = resolvePortalProjects(
      [
        grant({ grantId: 'g1', projectId: 'p1', capabilities: [CAP.PROJECT_VIEW], expiresAt: new Date('2020-01-01') }),
        grant({ grantId: 'g2', projectId: 'p2', capabilities: [CAP.TASK_WORK] }),
      ],
      [],
      new Date('2026-01-01'),
    );
    expect(projects).toEqual([]);
  });
});

describe('portal section filtering', () => {
  const providers = [
    provider('collab.tasks', 'tasks', { anyOf: [CAP.TASK_WORK, CAP.TASK_REPORT] }),
    provider('claims.open', 'claims', CAP.CLAIM_VIEW),
    provider('claims.payments', 'payments', CAP.PAYMENT_VIEW),
    provider('coordination.ack', 'acknowledgements', CAP.EVENT_RESPOND),
    provider('plans.ack', 'acknowledgements', CAP.PLAN_ACKNOWLEDGE),
  ];

  it('omits sections whose capability the principal lacks', () => {
    const plans = planPortalSections([project('p1', [CAP.PROJECT_VIEW, CAP.TASK_REPORT])], providers);
    expect(plans.map((plan) => plan.section.id)).toEqual(['tasks']);
  });

  it('runs each provider only for projects where its capability is held', () => {
    const plans = planPortalSections(
      [project('p1', [CAP.PROJECT_VIEW, CAP.CLAIM_VIEW]), project('p2', [CAP.PROJECT_VIEW, CAP.TASK_WORK])],
      providers,
    );
    const claims = plans.find((plan) => plan.section.id === 'claims')!;
    expect(claims.providers[0]!.targets.map((target) => target.projectId)).toEqual(['p1']);
    const tasks = plans.find((plan) => plan.section.id === 'tasks')!;
    expect(tasks.providers[0]!.targets.map((target) => target.projectId)).toEqual(['p2']);
    expect(plans.find((plan) => plan.section.id === 'payments')).toBeUndefined();
  });

  it('composes multi-domain sections from the providers that are allowed', () => {
    const plans = planPortalSections([project('p1', [CAP.PROJECT_VIEW, CAP.PLAN_ACKNOWLEDGE])], providers);
    const ack = plans.find((plan) => plan.section.id === 'acknowledgements')!;
    expect(ack.providers.map((entry) => entry.provider.id)).toEqual(['plans.ack']);
  });

  it('keeps section order and returns nothing without providers', () => {
    expect(planPortalSections([project('p1', Object.values(CAP))], [])).toEqual([]);
    const plans = planPortalSections([project('p1', Object.values(CAP))], providers);
    const order = PORTAL_SECTIONS.map((section) => section.id);
    const ids = plans.map((plan) => plan.section.id);
    expect([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(ids);
  });

  it('strips amounts outside financial sections, drops dead links and flags partial loads', () => {
    const tasks = PORTAL_SECTIONS.find((section) => section.id === 'tasks')!;
    const merged = mergeSectionResults(tasks, [
      {
        count: 3,
        attentionCount: 1,
        items: [
          { id: 'b', projectId: 'p1', title: 'Later', dueAt: '2026-10-09', href: '/contractor/projects/p1', amount: { value: '10', currency: 'ILS' } },
          { id: 'a', projectId: 'p1', title: 'Sooner', dueAt: '2026-10-04', href: '/contractor/not-a-route' },
        ],
      },
      null,
    ]);
    expect(merged.count).toBe(3);
    expect(merged.partial).toBe(true);
    expect(merged.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(merged.items.every((item) => item.amount === null)).toBe(true);
    expect(merged.items[0]!.href).toBeNull();
    expect(merged.items[1]!.href).toBe('/contractor/projects/p1');

    const payments = PORTAL_SECTIONS.find((section) => section.id === 'payments')!;
    const financial = mergeSectionResults(payments, [
      { count: 1, attentionCount: 0, items: [{ id: 'x', projectId: 'p1', title: 'Pay', href: null, amount: { value: '10', currency: 'ILS' } }] },
    ]);
    expect(financial.items[0]!.amount).toEqual({ value: '10', currency: 'ILS' });
    expect(financial.partial).toBe(false);
  });
});
