import { EXTERNAL_CAPABILITIES as CAP } from '@/shared/external';
import type { PortalCapabilityRequirement } from './capability-requirement';

/**
 * Single source of truth for every contractor portal route in the frozen route table
 * (docs/implementation/dev-gc-track-briefs.md section 2). Navigation, "view all" links and
 * deep-link validation are all derived from this list.
 *
 * `implemented` must only be true when `src/app/[locale]/contractor/<pageFile>` exists on disk;
 * `tests/unit/contractor-portal/routes.test.ts` enforces it so the portal never renders a dead link.
 */

export const PORTAL_BASE_PATH = '/contractor';

export type PortalRouteScope = 'auth' | 'portal' | 'project';

/**
 * - `primary`: portal-level destination (dashboard, notifications, account)
 * - `project`: list page inside a project (shown in the project nav)
 * - `detail`: needs an entity id; reached only through deep links
 * - `hidden`: auth flow pages, never in navigation
 */
export type PortalNavPlacement = 'primary' | 'project' | 'detail' | 'hidden';

export interface PortalRouteDefinition {
  readonly key: string;
  readonly track: string;
  readonly scope: PortalRouteScope;
  /** Path below `/contractor`, using the App Router segment names (`[projectId]`, ...). */
  readonly path: string;
  /** Page file relative to `src/app/[locale]/contractor`. */
  readonly pageFile: string;
  /** null = any authenticated principal (still subject to project visibility for project routes). */
  readonly capability: PortalCapabilityRequirement | null;
  readonly placement: PortalNavPlacement;
  /** Key inside the `contractorPortal` namespace. */
  readonly labelKey: string;
  readonly implemented: boolean;
}

export const PORTAL_ROUTES = [
  // Track C - auth (never in navigation)
  { key: 'auth.signIn', track: 'C', scope: 'auth', path: 'sign-in', pageFile: '(auth)/sign-in/page.tsx', capability: null, placement: 'hidden', labelKey: 'nav.signIn', implemented: true },
  { key: 'auth.activate', track: 'C', scope: 'auth', path: 'activate', pageFile: '(auth)/activate/page.tsx', capability: null, placement: 'hidden', labelKey: 'nav.activate', implemented: true },
  { key: 'auth.forgotPassword', track: 'C', scope: 'auth', path: 'forgot-password', pageFile: '(auth)/forgot-password/page.tsx', capability: null, placement: 'hidden', labelKey: 'nav.forgotPassword', implemented: true },
  { key: 'auth.resetPassword', track: 'C', scope: 'auth', path: 'reset-password', pageFile: '(auth)/reset-password/page.tsx', capability: null, placement: 'hidden', labelKey: 'nav.resetPassword', implemented: true },

  // Track R - shell
  { key: 'dashboard', track: 'R', scope: 'portal', path: '', pageFile: '(portal)/page.tsx', capability: null, placement: 'primary', labelKey: 'nav.dashboard', implemented: true },
  { key: 'notifications', track: 'R', scope: 'portal', path: 'notifications', pageFile: '(portal)/notifications/page.tsx', capability: null, placement: 'primary', labelKey: 'nav.notifications', implemented: true },
  { key: 'account', track: 'C', scope: 'portal', path: 'account', pageFile: '(portal)/account/page.tsx', capability: null, placement: 'primary', labelKey: 'nav.account', implemented: true },
  { key: 'project.home', track: 'R', scope: 'project', path: 'projects/[projectId]', pageFile: '(portal)/projects/[projectId]/page.tsx', capability: CAP.PROJECT_VIEW, placement: 'project', labelKey: 'nav.projectHome', implemented: true },

  // Track G - tasks
  { key: 'project.tasks', track: 'G', scope: 'project', path: 'projects/[projectId]/tasks', pageFile: '(portal)/projects/[projectId]/tasks/page.tsx', capability: { anyOf: [CAP.TASK_WORK, CAP.TASK_REPORT] }, placement: 'project', labelKey: 'nav.tasks', implemented: true },
  { key: 'project.task', track: 'G', scope: 'project', path: 'projects/[projectId]/tasks/[taskId]', pageFile: '(portal)/projects/[projectId]/tasks/[taskId]/page.tsx', capability: { anyOf: [CAP.TASK_WORK, CAP.TASK_REPORT] }, placement: 'detail', labelKey: 'nav.tasks', implemented: true },

  // Track H - schedule / coordination events
  { key: 'project.schedule', track: 'H', scope: 'project', path: 'projects/[projectId]/schedule', pageFile: '(portal)/projects/[projectId]/schedule/page.tsx', capability: CAP.SCHEDULE_VIEW, placement: 'project', labelKey: 'nav.schedule', implemented: true },
  { key: 'project.event', track: 'H', scope: 'project', path: 'projects/[projectId]/events/[eventId]', pageFile: '(portal)/projects/[projectId]/events/[eventId]/page.tsx', capability: CAP.SCHEDULE_VIEW, placement: 'detail', labelKey: 'nav.schedule', implemented: true },

  // Track IJ - documents / plans
  { key: 'project.documents', track: 'IJ', scope: 'project', path: 'projects/[projectId]/documents', pageFile: '(portal)/projects/[projectId]/documents/page.tsx', capability: CAP.DOCUMENT_VIEW, placement: 'project', labelKey: 'nav.documents', implemented: true },
  { key: 'project.plans', track: 'IJ', scope: 'project', path: 'projects/[projectId]/plans', pageFile: '(portal)/projects/[projectId]/plans/page.tsx', capability: CAP.PLAN_VIEW, placement: 'project', labelKey: 'nav.plans', implemented: true },
  { key: 'project.plan', track: 'IJ', scope: 'project', path: 'projects/[projectId]/plans/[drawingId]', pageFile: '(portal)/projects/[projectId]/plans/[drawingId]/page.tsx', capability: CAP.PLAN_VIEW, placement: 'detail', labelKey: 'nav.plans', implemented: true },

  // Track KL - RFI / submittals
  { key: 'project.rfi', track: 'KL', scope: 'project', path: 'projects/[projectId]/rfi', pageFile: '(portal)/projects/[projectId]/rfi/page.tsx', capability: { anyOf: [CAP.RFI_VIEW, CAP.RFI_RAISE] }, placement: 'project', labelKey: 'nav.rfi', implemented: true },
  { key: 'project.rfiDetail', track: 'KL', scope: 'project', path: 'projects/[projectId]/rfi/[rfiId]', pageFile: '(portal)/projects/[projectId]/rfi/[rfiId]/page.tsx', capability: { anyOf: [CAP.RFI_VIEW, CAP.RFI_RAISE] }, placement: 'detail', labelKey: 'nav.rfi', implemented: true },
  { key: 'project.submittals', track: 'KL', scope: 'project', path: 'projects/[projectId]/submittals', pageFile: '(portal)/projects/[projectId]/submittals/page.tsx', capability: CAP.SUBMITTAL_SUBMIT, placement: 'project', labelKey: 'nav.submittals', implemented: true },
  { key: 'project.submittal', track: 'KL', scope: 'project', path: 'projects/[projectId]/submittals/[submittalId]', pageFile: '(portal)/projects/[projectId]/submittals/[submittalId]/page.tsx', capability: CAP.SUBMITTAL_SUBMIT, placement: 'detail', labelKey: 'nav.submittals', implemented: true },

  // Track MN - quality
  { key: 'project.defects', track: 'MN', scope: 'project', path: 'projects/[projectId]/defects', pageFile: '(portal)/projects/[projectId]/defects/page.tsx', capability: CAP.DEFECT_WORK, placement: 'project', labelKey: 'nav.defects', implemented: true },
  { key: 'project.defect', track: 'MN', scope: 'project', path: 'projects/[projectId]/defects/[defectId]', pageFile: '(portal)/projects/[projectId]/defects/[defectId]/page.tsx', capability: CAP.DEFECT_WORK, placement: 'detail', labelKey: 'nav.defects', implemented: true },
  { key: 'project.inspections', track: 'MN', scope: 'project', path: 'projects/[projectId]/inspections', pageFile: '(portal)/projects/[projectId]/inspections/page.tsx', capability: CAP.INSPECTION_VIEW, placement: 'project', labelKey: 'nav.inspections', implemented: true },
  { key: 'project.inspection', track: 'MN', scope: 'project', path: 'projects/[projectId]/inspections/[inspectionId]', pageFile: '(portal)/projects/[projectId]/inspections/[inspectionId]/page.tsx', capability: CAP.INSPECTION_VIEW, placement: 'detail', labelKey: 'nav.inspections', implemented: true },

  // Track O - field
  { key: 'project.instructions', track: 'O', scope: 'project', path: 'projects/[projectId]/instructions', pageFile: '(portal)/projects/[projectId]/instructions/page.tsx', capability: CAP.SITE_INSTRUCTION_ACK, placement: 'project', labelKey: 'nav.instructions', implemented: true },
  { key: 'project.instruction', track: 'O', scope: 'project', path: 'projects/[projectId]/instructions/[instructionId]', pageFile: '(portal)/projects/[projectId]/instructions/[instructionId]/page.tsx', capability: CAP.SITE_INSTRUCTION_ACK, placement: 'detail', labelKey: 'nav.instructions', implemented: true },
  { key: 'project.siteLog', track: 'O', scope: 'project', path: 'projects/[projectId]/site-log', pageFile: '(portal)/projects/[projectId]/site-log/page.tsx', capability: CAP.DAILY_LOG_SUBMIT, placement: 'project', labelKey: 'nav.siteLog', implemented: true },

  // Track P - compliance / safety / deliveries
  { key: 'project.compliance', track: 'P', scope: 'project', path: 'projects/[projectId]/compliance', pageFile: '(portal)/projects/[projectId]/compliance/page.tsx', capability: CAP.COMPLIANCE_SUBMIT, placement: 'project', labelKey: 'nav.compliance', implemented: true },
  { key: 'project.deliveries', track: 'P', scope: 'project', path: 'projects/[projectId]/deliveries', pageFile: '(portal)/projects/[projectId]/deliveries/page.tsx', capability: CAP.DELIVERY_REPORT, placement: 'project', labelKey: 'nav.deliveries', implemented: true },
  { key: 'project.safety', track: 'P', scope: 'project', path: 'projects/[projectId]/safety', pageFile: '(portal)/projects/[projectId]/safety/page.tsx', capability: CAP.SAFETY_REPORT, placement: 'project', labelKey: 'nav.safety', implemented: true },

  // Track E - contract lines / changes (agreement-scoped: deep links only)
  { key: 'project.contract', track: 'E', scope: 'project', path: 'projects/[projectId]/contracts/[agreementId]', pageFile: '(portal)/projects/[projectId]/contracts/[agreementId]/page.tsx', capability: CAP.PROJECT_VIEW, placement: 'detail', labelKey: 'nav.contract', implemented: true },
  { key: 'project.contractChanges', track: 'E', scope: 'project', path: 'projects/[projectId]/contracts/[agreementId]/changes', pageFile: '(portal)/projects/[projectId]/contracts/[agreementId]/changes/page.tsx', capability: CAP.CHANGE_REQUEST, placement: 'detail', labelKey: 'nav.contractChanges', implemented: true },

  // Track F - claims / payments (financial)
  { key: 'project.claims', track: 'F', scope: 'project', path: 'projects/[projectId]/claims', pageFile: '(portal)/projects/[projectId]/claims/page.tsx', capability: { anyOf: [CAP.CLAIM_VIEW, CAP.CLAIM_SUBMIT] }, placement: 'project', labelKey: 'nav.claims', implemented: true },
  { key: 'project.claim', track: 'F', scope: 'project', path: 'projects/[projectId]/claims/[claimId]', pageFile: '(portal)/projects/[projectId]/claims/[claimId]/page.tsx', capability: { anyOf: [CAP.CLAIM_VIEW, CAP.CLAIM_SUBMIT] }, placement: 'detail', labelKey: 'nav.claims', implemented: true },
  { key: 'project.payments', track: 'F', scope: 'project', path: 'projects/[projectId]/payments', pageFile: '(portal)/projects/[projectId]/payments/page.tsx', capability: CAP.PAYMENT_VIEW, placement: 'project', labelKey: 'nav.payments', implemented: true },

  // Track Q - tenders / handover
  { key: 'project.tenders', track: 'Q', scope: 'project', path: 'projects/[projectId]/tenders', pageFile: '(portal)/projects/[projectId]/tenders/page.tsx', capability: CAP.BID_SUBMIT, placement: 'project', labelKey: 'nav.tenders', implemented: true },
  { key: 'project.tender', track: 'Q', scope: 'project', path: 'projects/[projectId]/tenders/[packageId]', pageFile: '(portal)/projects/[projectId]/tenders/[packageId]/page.tsx', capability: CAP.BID_SUBMIT, placement: 'detail', labelKey: 'nav.tenders', implemented: true },
  { key: 'project.handover', track: 'Q', scope: 'project', path: 'projects/[projectId]/handover', pageFile: '(portal)/projects/[projectId]/handover/page.tsx', capability: CAP.HANDOVER_SUBMIT, placement: 'project', labelKey: 'nav.handover', implemented: true },
] as const satisfies readonly PortalRouteDefinition[];

export type PortalRouteKey = (typeof PORTAL_ROUTES)[number]['key'];

const ROUTES_BY_KEY: ReadonlyMap<string, PortalRouteDefinition> = new Map(
  PORTAL_ROUTES.map((definition) => [definition.key, definition]),
);

export function portalRoute(key: PortalRouteKey): PortalRouteDefinition {
  return ROUTES_BY_KEY.get(key)!;
}

export type PortalRouteParams = Readonly<Record<string, string>>;

/** Builds `/contractor/...` from a route path template; throws when a segment param is missing. */
export function buildPortalHref(path: string, params: PortalRouteParams = {}): string {
  const resolved = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const match = /^\[(\w+)\]$/.exec(segment);
      if (!match) return segment;
      const value = params[match[1]!];
      if (!value) throw new Error(`portal route param missing: ${match[1]}`);
      return encodeURIComponent(value);
    });
  return resolved.length === 0 ? PORTAL_BASE_PATH : `${PORTAL_BASE_PATH}/${resolved.join('/')}`;
}

/** Href for an implemented route, or null (never emit a link to a route that is not on disk). */
export function portalHref(key: PortalRouteKey, params: PortalRouteParams = {}): string | null {
  const definition = portalRoute(key);
  if (!definition.implemented) return null;
  return buildPortalHref(definition.path, params);
}

function routePattern(path: string): RegExp {
  const body = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => (/^\[\w+\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${PORTAL_BASE_PATH}${body ? `/${body}` : ''}/?$`);
}

const ROUTE_PATTERNS: readonly { readonly definition: PortalRouteDefinition; readonly pattern: RegExp }[] =
  PORTAL_ROUTES.map((definition) => ({ definition, pattern: routePattern(definition.path) }));

/** Route definition a portal path resolves to (query/hash ignored), or null. */
export function matchPortalRoute(href: string): PortalRouteDefinition | null {
  const path = href.split(/[?#]/)[0]!;
  return ROUTE_PATTERNS.find(({ pattern }) => pattern.test(path))?.definition ?? null;
}

/** True only for `/contractor/...` paths whose page exists. Used to drop dead deep links. */
export function isLivePortalHref(href: string | null | undefined): href is string {
  if (!href) return false;
  return matchPortalRoute(href)?.implemented === true;
}

export function projectHomeHref(projectId: string): string {
  return buildPortalHref(portalRoute('project.home').path, { projectId });
}

export const PORTAL_SIGN_IN_PATH = buildPortalHref(portalRoute('auth.signIn').path);
