import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DailyLogCreateForm } from '@/app/[locale]/(app)/field-ops/logs/daily-log-create-form';
import { PunchCreateForm } from '@/app/[locale]/(app)/field-ops/punch/punch-create-form';
import enCommon from '@/locales/en/common.json';
import enDocuments from '@/locales/en/documents.json';
import enFieldOps from '@/locales/en/fieldOps.json';
import enOffline from '@/locales/en/offline.json';
import heCommon from '@/locales/he-IL/common.json';
import heDocuments from '@/locales/he-IL/documents.json';
import heFieldOps from '@/locales/he-IL/fieldOps.json';
import heOffline from '@/locales/he-IL/offline.json';

vi.mock('@/app/[locale]/(app)/field-ops/actions', () => ({
  createDailyLogAction: async () => ({}),
  createPunchListItemAction: async () => ({}),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const PROJECTS = [{ id: '11111111-1111-4111-8111-111111111111', name: 'אתר צפון' }];

function renderHe(ui: ReactElement) {
  return render(
    <div dir="rtl" lang="he">
      <NextIntlClientProvider
        locale="he-IL"
        messages={{
          common: heCommon,
          fieldOps: heFieldOps,
          documents: heDocuments,
          offline: heOffline,
        }}
        timeZone="Asia/Jerusalem"
      >
        {ui}
      </NextIntlClientProvider>
    </div>,
  );
}

function renderEn(ui: ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        common: enCommon,
        fieldOps: enFieldOps,
        documents: enDocuments,
        offline: enOffline,
      }}
      timeZone="Asia/Jerusalem"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('field-ops create forms photo staging', () => {
  it('lets a worker add photos on create instead of save-first-then-attach', () => {
    renderHe(
      <DailyLogCreateForm
        projects={PROJECTS}
        workPackages={[]}
        defaultProjectId={PROJECTS[0]!.id}
        defaultLogDate="2026-08-14"
        canManageDocuments
        storageConfigured
      />,
    );

    expect(screen.getByText(heFieldOps.photoCapture.title)).toBeVisible();
    expect(screen.getByText(heFieldOps.photoCapture.body)).toBeVisible();
    expect(screen.getByRole('button', { name: heFieldOps.photoCapture.add })).toBeVisible();
    expect(screen.getByRole('button', { name: heFieldOps.photoCapture.capture })).toBeVisible();
    expect(screen.queryByText(/שמרו קודם את הרשומה/)).toBeNull();
    expect(screen.queryByText(/תמונות אחרי שמירה/)).toBeNull();
  });

  it('does not present photos-only-after-save as the only path in English', () => {
    renderEn(
      <PunchCreateForm
        projects={PROJECTS}
        workPackages={[]}
        employees={[]}
        defaultProjectId={PROJECTS[0]!.id}
        canManageDocuments
        storageConfigured
      />,
    );

    expect(screen.getByRole('button', { name: enFieldOps.photoCapture.add })).toBeVisible();
    expect(screen.queryByText(/Photos after save/i)).toBeNull();
    expect(screen.queryByText(/Save the record first, then attach photos/i)).toBeNull();
  });

  it('does not tell the worker to save first when photos cannot be attached', () => {
    renderHe(
      <DailyLogCreateForm
        projects={PROJECTS}
        workPackages={[]}
        defaultLogDate="2026-08-14"
        canManageDocuments={false}
        storageConfigured
      />,
    );

    expect(screen.getByText(heFieldOps.photoCapture.manageRequired)).toBeVisible();
    expect(screen.queryByRole('button', { name: heFieldOps.photoCapture.add })).toBeNull();
    expect(screen.queryByText(/שמרו קודם את הרשומה/)).toBeNull();
  });
});
