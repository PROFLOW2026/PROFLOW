import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import heCommon from '@/locales/he-IL/common.json';
import heDocuments from '@/locales/he-IL/documents.json';
import heExternalStorage from '@/locales/he-IL/externalStorage.json';
import { CompanyFilesTab } from '@/app/[locale]/(app)/company-files/company-files-tab';

const loadCompanyFileBrowserInitialAction = vi.fn();

vi.mock('@/app/[locale]/(app)/company-files/company-files-actions', () => ({
  loadCompanyFileBrowserInitialAction: (...args: unknown[]) =>
    loadCompanyFileBrowserInitialAction(...args),
  browseCompanyFolderAction: vi.fn(),
  createCompanySubfolderAction: vi.fn(),
  renameCompanyStorageItemAction: vi.fn(),
  moveCompanyStorageItemAction: vi.fn(),
  deleteCompanyStorageItemAction: vi.fn(),
  listCompanyMoveTargetsAction: vi.fn(),
  getCompanyFileProviderUrlAction: vi.fn(),
}));

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/modules/external-storage/ui/use-share-storage-file', () => ({
  useShareStorageFile: () => ({
    sharing: false,
    shareError: null,
    setShareError: vi.fn(),
    shareFile: vi.fn(),
  }),
}));

describe('CompanyFilesTab shortcuts row', () => {
  beforeEach(() => {
    loadCompanyFileBrowserInitialAction.mockReset();
    loadCompanyFileBrowserInitialAction.mockResolvedValue({
      context: {
        provider: 'dropbox',
        organizationRootFolderId: 'root-id',
        organizationRootFolderName: 'ProjectFlow',
        semanticShortcuts: [
          { semanticFolderType: 'clients_root', externalFolderId: 'c1', displayName: 'לקוחות' },
          { semanticFolderType: 'vendors_root', externalFolderId: 'v1', displayName: 'ספקים' },
          { semanticFolderType: 'employees_root', externalFolderId: 'e1', displayName: 'עובדים' },
          {
            semanticFolderType: 'organization_documents',
            externalFolderId: 'd1',
            displayName: 'מסמכי חברה',
          },
        ],
      },
      folderExternalId: 'root-id',
      folderName: 'ProjectFlow',
      folders: [],
      files: [],
    });
  });

  it('shows semantic shortcut buttons without the shortcuts label', async () => {
    render(
      <NextIntlClientProvider
        locale="he-IL"
        messages={{
          common: heCommon,
          documents: heDocuments,
          externalStorage: heExternalStorage,
        }}
        timeZone="Asia/Jerusalem"
      >
        <CompanyFilesTab storageConfigured canManage />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'לקוחות' })).toBeInTheDocument());

    expect(screen.queryByText('קיצורי דרך:')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ספקים' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'עובדים' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מסמכי חברה' })).toBeInTheDocument();
  });
});
