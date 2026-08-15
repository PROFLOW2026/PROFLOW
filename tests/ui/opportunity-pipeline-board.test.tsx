import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityPipelineViews } from '@/modules/crm/ui/opportunity-pipeline-views';
import type { OpportunityBoardCard } from '@/modules/crm/domain/pipeline-board';
import enCrm from '@/locales/en/crm.json';
import heCrm from '@/locales/he-IL/crm.json';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/[locale]/(app)/crm/actions', () => ({
  updateOpportunityAction: async () => ({}),
}));

const items: OpportunityBoardCard[] = [
  {
    id: 'opp-quote',
    name: 'Kitchen remodel',
    stage: 'quote',
    status: 'open',
    expectedValueAmount: '12000',
    currency: 'ILS',
    expectedStartDate: null,
    notes: 'Call Thursday',
    nextActionAt: new Date('2020-01-01T09:00:00.000Z'),
    nextActionText: 'Call Thursday',
  },
  {
    id: 'opp-qualify',
    name: 'Villa extension',
    stage: 'qualify',
    status: 'open',
    expectedValueAmount: null,
    currency: null,
    expectedStartDate: '2026-09-01',
    notes: null,
    nextActionAt: new Date('2099-12-01T09:00:00.000Z'),
    nextActionText: 'Site visit',
  },
  {
    id: 'opp-won',
    name: 'Closed warehouse',
    stage: 'won',
    status: 'won',
    expectedValueAmount: '80000',
    currency: 'ILS',
    expectedStartDate: null,
    notes: null,
    nextActionAt: null,
    nextActionText: null,
  },
];

describe('OpportunityPipelineViews', () => {
  it('places each opportunity in the matching Hebrew stage column', () => {
    renderWithIntl(<OpportunityPipelineViews items={items} />, {
      locale: 'he-IL',
      messages: { crm: heCrm },
    });

    const qualify = screen.getByTestId('pipeline-column-qualify');
    const quote = screen.getByTestId('pipeline-column-quote');
    const won = screen.getByTestId('pipeline-column-won');
    const lost = screen.getByTestId('pipeline-column-lost');

    expect(qualify).toHaveTextContent('Villa extension');
    expect(qualify).not.toHaveTextContent('Kitchen remodel');
    expect(quote).toHaveTextContent('Kitchen remodel');
    expect(quote).toHaveTextContent('Call Thursday');
    expect(quote).toHaveTextContent(heCrm.followUp.overdue);
    expect(qualify).toHaveTextContent(heCrm.followUp.due);
    expect(won).toHaveTextContent('Closed warehouse');
    expect(lost).not.toHaveTextContent('Kitchen remodel');
    expect(lost).not.toHaveTextContent('Villa extension');

    expect(screen.getByRole('heading', { name: heCrm.stages.qualify })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: heCrm.stages.estimate })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: heCrm.stages.quote })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: heCrm.stages.negotiation })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: heCrm.stages.won })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: heCrm.stages.lost })).toBeInTheDocument();
  });

  it('keeps the table as an alternate view of the same list', async () => {
    const user = userEvent.setup();
    renderWithIntl(<OpportunityPipelineViews items={items} />, {
      locale: 'en',
      messages: { crm: enCrm },
    });

    await user.click(screen.getByRole('tab', { name: enCrm.list.tableView }));
    expect(screen.getByRole('tab', { name: enCrm.list.tableView })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kitchen remodel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Villa extension' })).toBeInTheDocument();
  });

  it('sends stage from board cards so the kanban can move opportunities', () => {
    renderWithIntl(<OpportunityPipelineViews items={items} canMoveStages />, {
      locale: 'en',
      messages: { crm: enCrm },
    });

    const stageSelect = screen.getByTestId('opportunity-stage-opp-quote');
    expect(stageSelect).toHaveAttribute('name', 'stage');
    expect(stageSelect).toHaveValue('quote');
    expect(stageSelect.closest('form')?.querySelector('input[name="opportunityId"]')).toHaveValue(
      'opp-quote',
    );
  });
});
