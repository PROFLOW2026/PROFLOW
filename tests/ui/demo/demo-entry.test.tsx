import type * as ReactDOM from 'react-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_BUSINESS_TYPES } from '@/modules/tenancy/domain/onboarding-experience';
import { DemoEntryScreen } from '@/modules/demo/ui/demo-entry-screen';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values) return `${key}:${JSON.stringify(values)}`;
    return key;
  },
}));

vi.mock('@/modules/marketing/ui/landing-header', () => ({
  LandingHeader: () => <p data-testid="landing-header" />,
}));

const formStatus = vi.hoisted(() => ({ pending: false }));

vi.mock('react-dom', async (importOriginal) => {
  const original = await importOriginal<typeof ReactDOM>();
  return {
    ...original,
    useFormStatus: () => ({
      pending: formStatus.pending,
      data: null,
      method: 'POST',
      action: null,
    }),
  };
});

function noopAction() {
  return Promise.resolve();
}

function renderDemoEntry() {
  return render(
    <DemoEntryScreen
      action={noopAction}
      businessKeys={ONBOARDING_BUSINESS_TYPES}
      footer={<footer data-testid="demo-footer" />}
    />,
  );
}

function businessSelect() {
  const wrapper = document.querySelector('[data-pf-demo-business-choices]');
  expect(wrapper).not.toBeNull();
  return within(wrapper as HTMLElement).getByRole('combobox');
}

function roleSelect() {
  const wrapper = document.querySelector('[data-pf-demo-role-choices]');
  expect(wrapper).not.toBeNull();
  return within(wrapper as HTMLElement).getByRole('combobox');
}

describe('DemoEntryScreen', () => {
  beforeEach(() => {
    formStatus.pending = false;
  });

  it('lists all onboarding business types and six demo roles without nightly-reset copy', () => {
    renderDemoEntry();

    expect(screen.getByRole('heading', { name: 'entry.title' })).toBeVisible();
    expect(screen.queryByText('ProjectFlow')).toBeNull();

    const profileSelect = businessSelect();
    const roleCombo = roleSelect();

    expect(within(profileSelect).getAllByRole('option')).toHaveLength(ONBOARDING_BUSINESS_TYPES.length);
    expect(within(roleCombo).getAllByRole('option')).toHaveLength(6);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);

    const firstBusinessKey = ONBOARDING_BUSINESS_TYPES[0]!;
    expect(screen.getByText(`entry.selectedBusiness:{"business":"businesses.${firstBusinessKey}"}`)).toBeInTheDocument();
    expect(screen.getByText('entry.selectedRole:{"role":"roles.owner"}')).toBeInTheDocument();

    expect(screen.queryByText(/מתאפס|לילה|מדי לילה/i)).toBeNull();
    expect(screen.queryByText(/אפליקציית עובדים|אפליקציית קבלנים/)).toBeNull();
  });

  it('updates the selected summary when business or role changes', () => {
    renderDemoEntry();

    const nextBusiness = ONBOARDING_BUSINESS_TYPES[3]!;
    fireEvent.change(businessSelect(), { target: { value: nextBusiness } });
    expect(
      screen.getByText(`entry.selectedBusiness:{"business":"businesses.${nextBusiness}"}`),
    ).toBeInTheDocument();

    fireEvent.change(roleSelect(), { target: { value: 'manager' } });
    expect(screen.getByText('entry.selectedRole:{"role":"roles.manager"}')).toBeInTheDocument();
  });

  it('shows a pending label and busy state on the submit control', () => {
    formStatus.pending = true;
    renderDemoEntry();

    const submit = screen.getByRole('button', { name: 'entry.submitting' });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toBeDisabled();
    expect(businessSelect()).toBeDisabled();
    expect(roleSelect()).toBeDisabled();
  });

  it('shows a translated alert when demoError is provided', () => {
    render(
      <DemoEntryScreen
        action={noopAction}
        businessKeys={ONBOARDING_BUSINESS_TYPES}
        demoError="rateLimited"
        footer={<footer data-testid="demo-footer" />}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('errors.rateLimited');
  });
});