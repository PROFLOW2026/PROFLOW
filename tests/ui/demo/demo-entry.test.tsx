import type * as ReactDOM from 'react-dom';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import { ONBOARDING_BUSINESS_TYPES } from '@/modules/tenancy/domain/onboarding-experience';
import { DemoEntryScreen } from '@/modules/demo/ui/demo-entry-screen';

const mockDemoRoles = vi.hoisted(() =>
  [
    { key: 'owner', label: 'בעלים' },
    { key: 'manager', label: 'מנהל' },
    { key: 'finance', label: 'כספים' },
    { key: 'worker', label: 'עובד שטח' },
    { key: 'employee', label: 'עובד משרד' },
    { key: 'contractor', label: 'קבלן משנה' },
  ] as const,
);

vi.mock('@/modules/demo/domain/demo-roles', () => ({
  DEMO_ROLE_CHOICES: mockDemoRoles,
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

function buildBusinessChoices() {
  return ONBOARDING_BUSINESS_TYPES.map((key) => ({
    key,
    label: getBusinessProfile(key)?.domains[0]?.nameHe ?? key,
  }));
}

function renderDemoEntry() {
  return render(
    <DemoEntryScreen
      action={noopAction}
      businessChoices={buildBusinessChoices()}
      footer={<footer data-testid="demo-footer" />}
    />,
  );
}

describe('DemoEntryScreen', () => {
  beforeEach(() => {
    formStatus.pending = false;
  });

  it('lists all onboarding business types and six demo roles without nightly-reset copy', () => {
    renderDemoEntry();

    expect(screen.getByRole('heading', { name: 'הדגמה חיה' })).toBeVisible();

    const businessGrid = document.querySelector('[data-pf-demo-business-choices]');
    expect(businessGrid).not.toBeNull();
    expect(within(businessGrid as HTMLElement).getAllByRole('radio')).toHaveLength(
      ONBOARDING_BUSINESS_TYPES.length,
    );

    const roleGrid = document.querySelector('[data-pf-demo-role-choices]');
    expect(roleGrid).not.toBeNull();
    expect(within(roleGrid as HTMLElement).getAllByRole('radio')).toHaveLength(mockDemoRoles.length);

    const sampleKey = ONBOARDING_BUSINESS_TYPES[0]!;
    const sampleLabel = getBusinessProfile(sampleKey)?.domains[0]?.nameHe ?? sampleKey;
    expect(screen.getByRole('radio', { name: sampleLabel })).toBeInTheDocument();

    for (const role of mockDemoRoles) {
      expect(screen.getByRole('radio', { name: role.label })).toBeInTheDocument();
    }

    expect(screen.queryByText(/מתאפס|לילה|מדי לילה/i)).toBeNull();
    expect(screen.queryByText(/אפליקציית עובדים|אפליקציית קבלנים/)).toBeNull();
  });

  it('shows a pending label and busy state on the submit control', () => {
    formStatus.pending = true;
    renderDemoEntry();

    const submit = screen.getByRole('button', { name: 'נכנסים לדמו…' });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toBeDisabled();
  });
});