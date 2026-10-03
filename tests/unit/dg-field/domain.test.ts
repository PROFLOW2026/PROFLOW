import { describe, expect, it } from 'vitest';
import {
  canEditDailyLog,
  entryHasContent,
  latestReportRevisions,
  summarizeDailyLog,
} from '@/modules/site-log';
import {
  availableTransitions,
  initialConversionState,
  isFinancialCategory,
  nextState,
  transitionBlocker,
  type InstructionState,
} from '@/modules/site-instructions';
import {
  canMarkHeld,
  canPublishMinutes,
  nextPublicationVersion,
  parseActionItemAssignee,
} from '@/modules/site-meetings';
import { parseZonedLocalDateTime, toZonedLocalInput } from '@/modules/site-meetings/domain/zoned-time';
import { FIELD_AUDIT_ACTIONS } from '@/shared/audit/dg/field';
import { FIELD_DOMAIN_EVENTS } from '@/shared/domain-events/events/field';

describe('daily log domain (Track O)', () => {
  it('treats empty entries as having no content', () => {
    expect(entryHasContent({})).toBe(false);
    expect(entryHasContent({ description: '   ' })).toBe(false);
    expect(entryHasContent({ vendorId: '00000000-0000-4000-8000-000000000001' })).toBe(true);
    expect(entryHasContent({ headcount: 3 })).toBe(true);
  });

  it('allows edits only while the log is open', () => {
    expect(canEditDailyLog(null)).toBe(true);
    expect(canEditDailyLog('open')).toBe(true);
    expect(canEditDailyLog('closed')).toBe(false);
  });

  it('keeps the latest contractor report revision per party', () => {
    const vendor = '00000000-0000-4000-8000-0000000000aa';
    const latest = latestReportRevisions([
      { id: '1', vendorId: vendor, subcontractAgreementId: null, revision: 1 },
      { id: '2', vendorId: vendor, subcontractAgreementId: null, revision: 3 },
      { id: '3', vendorId: vendor, subcontractAgreementId: '00000000-0000-4000-8000-0000000000bb', revision: 2 },
    ]);
    expect(latest.map((row) => row.id).sort()).toEqual(['2', '3']);
  });

  it('summarizes entries and latest reports together', () => {
    const vendorA = '00000000-0000-4000-8000-000000000001';
    const vendorB = '00000000-0000-4000-8000-000000000002';
    const summary = summarizeDailyLog(
      [
        { entryType: 'contractor_presence', vendorId: vendorA, headcount: 4 },
        { entryType: 'delay', vendorId: null, headcount: null },
        { entryType: 'safety_event', vendorId: null, headcount: null },
      ],
      [
        { id: 'r1', vendorId: vendorB, subcontractAgreementId: null, revision: 1, manpowerCount: 6, delays: 'rain', blockingIssues: null },
        { id: 'r2', vendorId: vendorB, subcontractAgreementId: null, revision: 2, manpowerCount: 8, delays: null, blockingIssues: 'crane' },
      ],
    );
    expect(summary).toMatchObject({
      contractorsPresent: 2,
      recordedManpower: 4,
      reportedManpower: 8,
      delays: 1,
      blockingIssues: 1,
      safetyEvents: 1,
      contractorReports: 1,
    });
  });
});

describe('site instruction lifecycle (Track O)', () => {
  const operational: InstructionState = {
    status: 'issued',
    category: 'operational',
    conversionState: 'none',
  };

  it('flags financial categories and initial conversion state', () => {
    expect(isFinancialCategory('operational')).toBe(false);
    expect(isFinancialCategory('potentially_financial')).toBe(true);
    expect(initialConversionState('operational')).toBe('none');
    expect(initialConversionState('potentially_financial')).toBe('pending');
  });

  it('blocks contractors from internal-only transitions', () => {
    expect(transitionBlocker(operational, 'closed', 'external')).toBe('notAllowedForContractor');
    expect(transitionBlocker(operational, 'acknowledged', 'external')).toBeNull();
  });

  it('walks issued -> acknowledged -> performed -> closed for internal actors', () => {
    let state = operational;
    state = nextState(state, 'acknowledged');
    expect(state.status).toBe('acknowledged');
    state = nextState(state, 'performed');
    expect(state.status).toBe('performed');
    state = nextState(state, 'closed');
    expect(state.status).toBe('closed');
    expect(availableTransitions(state, 'internal')).toContain('reopened');
  });

  it('requires pending conversion before dismiss', () => {
    const financial: InstructionState = {
      status: 'acknowledged',
      category: 'potentially_financial',
      conversionState: 'pending',
    };
    expect(transitionBlocker(financial, 'conversion_dismissed', 'internal')).toBeNull();
    expect(transitionBlocker({ ...financial, conversionState: 'none' }, 'conversion_dismissed', 'internal')).toBe(
      'nothingToDismiss',
    );
  });
});

describe('contractor meeting domain (Track O)', () => {
  it('gates held and publish transitions', () => {
    expect(canMarkHeld('scheduled')).toBe(true);
    expect(canMarkHeld('held')).toBe(false);
    expect(canPublishMinutes('held')).toBe(true);
    expect(canPublishMinutes('published')).toBe(true);
    expect(canPublishMinutes('scheduled')).toBe(false);
  });

  it('bumps publication versions from zero', () => {
    expect(nextPublicationVersion(0)).toBe(1);
    expect(nextPublicationVersion(2)).toBe(3);
  });

  it('parses action-item assignee tokens', () => {
    const member = '00000000-0000-4000-8000-000000000011';
    const vendor = '00000000-0000-4000-8000-000000000022';
    const agreement = '00000000-0000-4000-8000-000000000033';
    expect(parseActionItemAssignee('')).toEqual({ kind: 'none' });
    expect(parseActionItemAssignee(`member:${member}`)).toEqual({ kind: 'member', membershipId: member });
    expect(parseActionItemAssignee(`vendor:${vendor}:${agreement}`)).toEqual({
      kind: 'contractor',
      vendorId: vendor,
      subcontractAgreementId: agreement,
    });
    expect(parseActionItemAssignee('vendor:not-a-uuid')).toBeNull();
  });

  it('round-trips datetime-local values in a fixed zone', () => {
    const parsed = parseZonedLocalDateTime('2026-01-14T09:30', 'Asia/Jerusalem');
    expect(parsed).not.toBeNull();
    expect(toZonedLocalInput(parsed!, 'Asia/Jerusalem')).toBe('2026-01-14T09:30');
  });
});

describe('Track O shared contracts', () => {
  it('registers domain events and audit actions', () => {
    expect(FIELD_DOMAIN_EVENTS.FIELD_DAILY_LOG_SUBMITTED).toBe('field.daily_log.submitted');
    expect(FIELD_DOMAIN_EVENTS.FIELD_MEETING_PUBLISHED).toBe('field.meeting.published');
    expect(FIELD_AUDIT_ACTIONS.SITE_INSTRUCTION_ISSUED).toBe('site_instruction.issued');
  });
});
