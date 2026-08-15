import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityFollowUpForm } from '@/app/[locale]/(app)/crm/opportunities/[opportunityId]/opportunity-actions';
import enCrm from '@/locales/en/crm.json';
import { renderWithIntl } from './test-utils';

vi.mock('@/app/[locale]/(app)/crm/actions', () => ({
  updateOpportunityAction: async () => ({}),
  createOpportunityNoteAction: async () => ({}),
  createEstimateAction: async () => ({}),
  createSalesQuoteAction: async () => ({}),
  issueSalesQuoteVersionAction: async () => ({}),
  acceptSalesQuoteVersionAction: async () => ({}),
  markOpportunityLostAction: async () => ({}),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  redirect: () => undefined,
}));

describe('OpportunityFollowUpForm stage field', () => {
  it('includes a stage select so follow-up save moves the pipeline', () => {
    renderWithIntl(
      <OpportunityFollowUpForm
        opportunityId="01900000-0000-7000-8000-000000000004"
        stage="estimate"
        notes={null}
        expectedStartDate={null}
        nextActionAt={null}
        nextActionText={null}
      />,
      { locale: 'en', messages: { crm: enCrm } },
    );

    const stage = screen.getByLabelText(enCrm.followUp.stageLabel);
    expect(stage).toHaveAttribute('name', 'stage');
    expect(stage).toHaveValue('estimate');
  });
});
