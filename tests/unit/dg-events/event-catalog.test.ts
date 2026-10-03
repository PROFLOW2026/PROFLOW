import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DG_EVENT_SPECS, dgCopyKey, findDgEventSpec } from '@/modules/dg-events/domain/event-catalog';
import type { DgLinkInput } from '@/modules/dg-events/domain/types';
import { createDgEventHandlerRegistry } from '@/modules/dg-events/application/registry';
import { DG_NOTIFICATION_EVENT_TYPES } from '@/modules/notifications/domain/types';
import { isFinancialCapability } from '@/modules/project-team/domain/capabilities';
import { FINANCIAL_EXTERNAL_CAPABILITIES } from '@/shared/external/capabilities';

/** Every event named in docs/implementation/dev-gc-track-briefs.md section 3. */
const BRIEF_EVENTS = [
  'subcontract.change.submitted',
  'subcontract.change.approved',
  'subcontract.change.rejected',
  'subcontract.agreement.activated',
  'subcontract.claim.submitted',
  'subcontract.claim.returned',
  'subcontract.claim.certified',
  'subcontract.claim.reassessed',
  'subcontract.deduction.issued',
  'task.external.assigned',
  'task.external.acknowledged',
  'task.external.completion_submitted',
  'task.external.verified',
  'task.external.reopened',
  'collab.comment.posted',
  'coordination.event.created',
  'coordination.event.rescheduled',
  'coordination.event.completed',
  'coordination.event.cancelled',
  'coordination.readiness.requested',
  'coordination.contractor.ready',
  'coordination.contractor.not_ready',
  'coordination.event.ready',
  'plan.revision.published',
  'document.shared',
  'plan.revision.acknowledged',
  'rfi.request.submitted',
  'rfi.request.answered',
  'rfi.request.closed',
  'submittal.package.submitted',
  'submittal.package.reviewed',
  'quality.inspection.completed',
  'quality.inspection.failed',
  'defect.item.opened',
  'defect.item.assigned',
  'defect.completion_submitted',
  'defect.item.closed',
  'defect.item.reopened',
  'field.daily_log.submitted',
  'field.instruction.issued',
  'field.instruction.acknowledged',
  'field.meeting.published',
  'compliance.document.expiring',
  'compliance.document.expired',
  'compliance.document.submitted',
  'safety.record.reported',
  'safety.record.closed',
  'delivery.item.delayed',
  'delivery.item.delivered',
  'procurement.tender.awarded',
  'closeout.agreement.closed',
  'warranty.claim.reported',
];

const LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;

function locale(name: string, namespace: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), `src/locales/${name}/${namespace}.json`), 'utf8'));
}

const linkInput: DgLinkInput = {
  projectId: '11111111-1111-4111-8111-111111111111',
  entityId: '22222222-2222-4222-8222-222222222222',
  subjectId: '33333333-3333-4333-8333-333333333333',
  agreementId: '44444444-4444-4444-8444-444444444444',
  payload: { logDate: '2026-10-01', defectId: '55555555-5555-4555-8555-555555555555' },
};

describe('dg event catalog', () => {
  it('has a handler for every event named in the briefs', () => {
    const registry = createDgEventHandlerRegistry();
    for (const type of BRIEF_EVENTS) {
      expect(findDgEventSpec(type), type).toBeDefined();
      expect(registry.get(type), type).toBeTypeOf('function');
    }
    expect(registry.get('unknown.event.type')).toBeUndefined();
  });

  it('has unique types and every spec targets at least one audience', () => {
    const types = DG_EVENT_SPECS.map((spec) => spec.type);
    expect(new Set(types).size).toBe(types.length);
    for (const spec of DG_EVENT_SPECS) {
      expect(Boolean(spec.internal) || Boolean(spec.external), spec.type).toBe(true);
      expect(DG_NOTIFICATION_EVENT_TYPES).toContain(spec.category);
      for (const resolved of spec.resolves ?? []) expect(findDgEventSpec(resolved), resolved).toBeDefined();
    }
  });

  it('routes financial events only to financial capability holders and never mixes groups', () => {
    for (const spec of DG_EVENT_SPECS) {
      const capabilities = spec.internal?.capabilities ?? [];
      if (spec.financial) {
        for (const capability of capabilities) expect(isFinancialCapability(capability), `${spec.type} ${capability}`).toBe(true);
      } else {
        for (const capability of capabilities) expect(isFinancialCapability(capability), `${spec.type} ${capability}`).toBe(false);
      }
    }
  });

  it('only notifies contractors about claims through financial external capabilities', () => {
    for (const spec of DG_EVENT_SPECS.filter((candidate) => candidate.category === 'dg_claim')) {
      expect(spec.financial).toBe(true);
      for (const capability of spec.external?.capabilities ?? []) {
        expect(FINANCIAL_EXTERNAL_CAPABILITIES).toContain(capability);
      }
    }
  });

  it('builds internal project links and portal links from the frozen route table', () => {
    for (const spec of DG_EVENT_SPECS) {
      const internal = spec.internalLink(linkInput);
      const portal = spec.portalLink(linkInput);
      expect(internal, spec.type).toMatch(/^\/(projects|tasks)\//);
      expect(portal, spec.type).toMatch(/^\/contractor\/(projects\/|notifications$)/);
    }
    expect(findDgEventSpec('subcontract.claim.submitted')!.internalLink(linkInput)).toBe(
      `/projects/${linkInput.projectId}/claims/${linkInput.subjectId}`,
    );
    expect(findDgEventSpec('subcontract.change.approved')!.portalLink(linkInput)).toBe(
      `/contractor/projects/${linkInput.projectId}/contracts/${linkInput.agreementId}/changes`,
    );
    expect(findDgEventSpec('field.daily_log.submitted')!.internalLink(linkInput)).toBe(
      `/projects/${linkInput.projectId}/site-log/2026-10-01`,
    );
    expect(findDgEventSpec('task.external.assigned')!.portalLink({ ...linkInput, projectId: null })).toBe(
      '/contractor/notifications',
    );
  });

  it('rejects unsafe link segments from payloads', () => {
    const spec = findDgEventSpec('subcontract.claim.submitted')!;
    expect(spec.internalLink({ ...linkInput, subjectId: '../../admin' })).toBe(`/projects/${linkInput.projectId}`);
    expect(spec.internalLink({ ...linkInput, projectId: 'x/y' })).toBeNull();
  });

  it('has localized copy for every event in all four locales', () => {
    for (const name of LOCALES) {
      const messages = locale(name, 'notifications') as {
        dg: { copy: Record<string, { title: string; body: string }> };
        types: Record<string, string>;
      };
      for (const spec of DG_EVENT_SPECS) {
        const copy = messages.dg.copy[dgCopyKey(spec.type)];
        expect(copy?.title, `${name} ${spec.type}`).toBeTruthy();
        expect(copy?.body, `${name} ${spec.type}`).toBeTruthy();
      }
      for (const type of DG_NOTIFICATION_EVENT_TYPES) expect(messages.types[type], `${name} ${type}`).toBeTruthy();
    }
  });
});
