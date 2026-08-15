import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import heNotifications from '@/locales/he-IL/notifications.json';
import { NotificationBell } from '@/modules/notifications/ui/notification-bell';
import type { NotificationInboxDto } from '@/modules/notifications/application/serialize';
import { renderWithIntl } from './test-utils';

vi.mock('@/modules/notifications/application/actions', () => ({
  listNotificationsAction: vi.fn(),
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
  runNotificationScanAction: vi.fn(),
}));

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    onClick,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    onClick?: () => void;
  } & Record<string, unknown>) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

const emptyInbox: NotificationInboxDto = { items: [], unreadCount: 0 };

const unreadInbox: NotificationInboxDto = {
  unreadCount: 2,
  items: [
    {
      id: '018f1234-5678-7abc-8def-0123456789aa',
      type: 'billing_overdue',
      domain: 'billing',
      title: 'חיוב לקוח באיחור — INV-1',
      body: 'יתרה פתוחה',
      severity: 'urgent',
      deepLink: '/billing/1',
      readAt: null,
      createdAt: '2026-08-15T09:00:00.000Z',
    },
    {
      id: '018f1234-5678-7abc-8def-0123456789ab',
      type: 'ap_overdue',
      domain: 'ap',
      title: 'חשבון ספק באיחור — BILL-9',
      body: 'עבר את מועד הפירעון',
      severity: 'warning',
      deepLink: '/procurement/ap/2',
      readAt: null,
      createdAt: '2026-08-15T08:00:00.000Z',
    },
  ],
};

function renderBell(inbox: NotificationInboxDto) {
  return renderWithIntl(
    <NotificationBell initialInbox={inbox} loadInbox={async () => inbox} />,
    { messages: { notifications: heNotifications } },
  );
}

describe('notification bell', () => {
  it('shows an empty inbox in the popover', async () => {
    const user = userEvent.setup();
    renderBell(emptyInbox);

    await user.click(screen.getByRole('button', { name: 'התראות' }));
    expect(await screen.findByText(heNotifications.empty)).toBeVisible();
    expect(screen.getByText(heNotifications.emptyHint)).toBeVisible();
    expect(screen.queryByText('2')).toBeNull();
  });

  it('shows unread count on the bell and lists unread items', async () => {
    const user = userEvent.setup();
    renderBell(unreadInbox);

    const trigger = screen.getByRole('button', { name: /התראות/ });
    expect(trigger).toHaveAccessibleName(/2 התראות שלא נקראו/);
    expect(screen.getByText('2')).toBeVisible();

    await user.click(trigger);
    expect(await screen.findByText('חיוב לקוח באיחור — INV-1')).toBeVisible();
    expect(screen.getByText('חשבון ספק באיחור — BILL-9')).toBeVisible();
    expect(screen.getByText('2 התראות שלא נקראו')).toBeVisible();
  });
});
