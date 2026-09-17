'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOptionalToast } from '@/components/ui/toast';
import { EMPLOYEE_PRESETS, type EmployeePresetKey } from '@/modules/employee-app/application/presets';
import {
  EMPLOYEE_DOCUMENT_CATEGORY_KEYS,
  EMPLOYEE_PERMISSION_EDITOR_GROUPS,
  buildSaveGrantsPayload,
  categoriesSetFromPreset,
  categoriesSetFromRecords,
  detectPresetFromState,
  editorItemForPermission,
  grantsMapFromPreset,
  grantsMapFromRecords,
  presetTranslationKey,
  type EditorGrantState,
} from '@/modules/employee-app/application/permission-editor';
import {
  deriveEmployeeAccessStatusView,
  hasActiveTempPinWindow,
  hasPersonalPinSet,
} from '@/modules/employee-app/domain/access-status';
import {
  buildEmployeeLoginUrl,
  formatCredentialExpiry,
} from '@/modules/employee-app/domain/credentials-share';
import {
  activateEmployeeAppAction,
  blockEmployeeAppAction,
  disableEmployeeAppAction,
  resetEmployeeAppPinAction,
  resumeEmployeeAppAction,
  revokeEmployeeAppSessionsAction,
  saveEmployeeAppGrantsEditorAction,
  suspendEmployeeAppAction,
} from '@/app/[locale]/(app)/workforce/employees/employee-app-actions';
import type { EmployeeAppAccountRecord, EmployeePermissionGrantRecord } from '@/modules/employee-app/domain/types';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { AccessInfoField } from './access-info-field';
import { EmployeeCredentialsShareDialog } from './employee-credentials-share-dialog';

interface ShareableCredentials {
  readonly username: string;
  readonly temporaryPin: string;
  readonly temporaryPinExpiresAt: string;
  readonly loginUrl: string;
}

interface Props {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly employeeNumber: string | null;
  readonly employeePhone: string | null;
  readonly employeeEmail: string | null;
  readonly organizationName: string;
  readonly locale: string;
  readonly appOrigin: string;
  readonly account: EmployeeAppAccountRecord | null;
  readonly grants: readonly EmployeePermissionGrantRecord[];
  readonly documentCategories: ReadonlyMap<DocumentCategory, boolean>;
}

const PRESET_SELECT_KEYS = EMPLOYEE_PRESETS.filter((preset) => preset.key !== 'custom');

function scopeLabelKey(scope: PermissionScope): string {
  return `scopes.${scope}`;
}

export function EmployeeAppAccessPanel({
  employeeId,
  employeeName,
  employeeNumber,
  employeePhone,
  employeeEmail,
  organizationName,
  locale,
  appOrigin,
  account,
  grants: initialGrants,
  documentCategories: initialCategories,
}: Props) {
  const t = useTranslations('employeeApp.admin');
  const tStatus = useTranslations('employeeApp.status');
  const tPresets = useTranslations('employeeApp.presets');
  const tPermissions = useTranslations('employeeApp.permissions');
  const tDocCategories = useTranslations('documents.categories');
  const toast = useOptionalToast();

  const loginUrl = useMemo(
    () => buildEmployeeLoginUrl(appOrigin, locale, account?.username),
    [appOrigin, locale, account?.username],
  );

  const initialGrantMap = useMemo(
    () =>
      grantsMapFromRecords(initialGrants, {
        includeRoleBaseline: Boolean(account && account.status !== 'inactive'),
      }),
    [initialGrants, account],
  );
  const initialCategorySet = useMemo(
    () => categoriesSetFromRecords(initialCategories),
    [initialCategories],
  );
  const initialPreset = useMemo((): EmployeePresetKey => {
    const detected = detectPresetFromState(initialGrantMap, initialCategorySet);
    if (detected === 'custom' && initialGrants.length === 0 && !account) {
      return 'field_worker';
    }
    return detected;
  }, [initialGrantMap, initialCategorySet, initialGrants.length, account]);

  const [grantState, setGrantState] = useState(() => initialGrantMap);
  const [categoryState, setCategoryState] = useState(() => initialCategorySet);
  const [selectedPreset, setSelectedPreset] = useState<EmployeePresetKey>(() => initialPreset);
  const [shareCredentials, setShareCredentials] = useState<ShareableCredentials | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<'success' | 'error' | null>(null);
  const [pending, startTransition] = useTransition();

  const documentsReadGranted = grantState.get(PERMISSIONS.DOCUMENTS_READ)?.granted === true;
  const statusView = account ? deriveEmployeeAccessStatusView(account) : null;
  const tempPinActive = account ? hasActiveTempPinWindow(account) : false;
  const personalPinSet = account ? hasPersonalPinSet(account) : false;
  const canShare = Boolean(
    shareCredentials &&
      new Date(shareCredentials.temporaryPinExpiresAt) > new Date() &&
      shareCredentials.temporaryPin,
  );

  const syncPresetDetection = useCallback(
    (grants: Map<PermissionKey, EditorGrantState>, categories: Set<DocumentCategory>) => {
      setSelectedPreset(detectPresetFromState(grants, categories));
    },
    [],
  );

  function openShareDialog(credentials: ShareableCredentials) {
    setShareCredentials(credentials);
    setShareDialogOpen(true);
  }

  function buildSharePayload(input: {
    username: string;
    temporaryPin: string;
    temporaryPinExpiresAt: string;
  }): ShareableCredentials {
    return {
      username: input.username,
      temporaryPin: input.temporaryPin,
      temporaryPinExpiresAt: input.temporaryPinExpiresAt,
      loginUrl,
    };
  }

  function run(action: () => Promise<unknown>) {
    startTransition(() => {
      void action();
    });
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast?.push(successMessage, 'success');
    } catch {
      toast?.push(t('copyFailed'), 'danger');
    }
  }

  function applyPreset(key: EmployeePresetKey) {
    if (key === 'custom') {
      setSelectedPreset('custom');
      return;
    }
    const grants = grantsMapFromPreset(key);
    if (account && account.status !== 'inactive') {
      grants.set(PERMISSIONS.ATTENDANCE_SELF, {
        permissionKey: PERMISSIONS.ATTENDANCE_SELF,
        scope: 'self_only',
        granted: true,
        roleBaseline: true,
      });
    }
    const categories = categoriesSetFromPreset(key);
    setGrantState(grants);
    setCategoryState(categories);
    setSelectedPreset(key);
  }

  function setPermissionGranted(permissionKey: PermissionKey, granted: boolean) {
    const existing = grantState.get(permissionKey);
    if (existing?.roleBaseline) return;

    const nextGrants = new Map(grantState);
    if (granted) {
      const item = editorItemForPermission(permissionKey);
      nextGrants.set(permissionKey, {
        permissionKey,
        scope: item?.scopes[0] ?? 'self_only',
        granted: true,
      });
    } else {
      nextGrants.delete(permissionKey);
    }

    const nextCategories =
      !granted && permissionKey === PERMISSIONS.DOCUMENTS_READ
        ? new Set<DocumentCategory>()
        : categoryState;

    setGrantState(nextGrants);
    if (nextCategories !== categoryState) {
      setCategoryState(nextCategories);
    }
    syncPresetDetection(nextGrants, nextCategories);
  }

  function setPermissionScope(permissionKey: PermissionKey, scope: PermissionScope) {
    setGrantState((prev) => {
      const next = new Map(prev);
      const existing = next.get(permissionKey);
      if (!existing?.granted || existing.roleBaseline) return prev;
      next.set(permissionKey, { ...existing, scope });
      syncPresetDetection(next, categoryState);
      return next;
    });
  }

  function toggleCategory(category: DocumentCategory, checked: boolean) {
    setCategoryState((prev) => {
      const next = new Set(prev);
      if (checked) next.add(category);
      else next.delete(category);
      syncPresetDetection(grantState, next);
      return next;
    });
  }

  async function savePermissions() {
    setSaveMessage(null);
    try {
      await saveEmployeeAppGrantsEditorAction(employeeId, {
        grants: buildSaveGrantsPayload(grantState),
        documentCategories: [...categoryState],
      });
      setSaveMessage('success');
    } catch {
      setSaveMessage('error');
    }
  }

  async function handleActivate() {
    setSaveMessage(null);
    const presetKey = selectedPreset === 'custom' ? 'field_worker' : selectedPreset;
    const result = await activateEmployeeAppAction(employeeId, presetKey);

    await saveEmployeeAppGrantsEditorAction(employeeId, {
      grants: buildSaveGrantsPayload(grantState),
      documentCategories: [...categoryState],
    });

    openShareDialog(buildSharePayload(result));
  }

  async function handleResetPin() {
    if (!account) return;
    const result = await resetEmployeeAppPinAction(employeeId);
    openShareDialog(
      buildSharePayload({
        username: account.username,
        temporaryPin: result.temporaryPin,
        temporaryPinExpiresAt: result.temporaryPinExpiresAt,
      }),
    );
  }

  async function handleCreateTempPin() {
    await handleResetPin();
  }

  const permissionEditor = (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-[220px] flex-col gap-1">
          <span className="text-xs text-[var(--pf-text-secondary)]">{t('preset')}</span>
          <Select
            value={selectedPreset}
            onValueChange={(value) => applyPreset(value as EmployeePresetKey)}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_SELECT_KEYS.map((preset) => (
                <SelectItem key={preset.key} value={preset.key}>
                  {tPresets(presetTranslationKey(preset.key))}
                </SelectItem>
              ))}
              <SelectItem value="custom">{tPresets('custom')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-5">
        {EMPLOYEE_PERMISSION_EDITOR_GROUPS.map((group) => (
          <section key={group.id} className="space-y-2">
            <h4 className="text-sm font-medium">{tPermissions(`groups.${group.labelKey}`)}</h4>
            <ul className="space-y-2">
              {group.items.map((item) => {
                const state = grantState.get(item.permissionKey);
                const checked = state?.granted === true;
                const locked = state?.roleBaseline === true;
                const showScope = checked && item.scopes.length > 1 && !locked;

                return (
                  <li
                    key={item.permissionKey}
                    className="flex flex-col gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={locked || pending}
                        onCheckedChange={(value) =>
                          setPermissionGranted(item.permissionKey, value === true)
                        }
                      />
                      <span>{tPermissions(`items.${item.labelKey}`)}</span>
                    </label>
                    {showScope ? (
                      <div className="flex min-w-[200px] flex-col gap-1 sm:items-end">
                        <span className="text-xs text-[var(--pf-text-secondary)]">
                          {t('scopeLabel')}
                        </span>
                        <Select
                          value={state?.scope ?? item.scopes[0]}
                          onValueChange={(value) =>
                            setPermissionScope(item.permissionKey, value as PermissionScope)
                          }
                          disabled={pending}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {item.scopes.map((scope) => (
                              <SelectItem key={scope} value={scope}>
                                {tPermissions(scopeLabelKey(scope))}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {account && account.status !== 'inactive' ? (
        <div className="flex flex-col gap-2">
          <Button type="button" disabled={pending} onClick={() => run(savePermissions)}>
            {t('savePermissions')}
          </Button>
          {saveMessage === 'success' ? (
            <Alert tone="success">{t('permissionsSaved')}</Alert>
          ) : null}
          {saveMessage === 'error' ? (
            <Alert tone="danger">{t('permissionsSaveFailed')}</Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const documentsSection =
    documentsReadGranted ? (
      <section className="space-y-2">
        <h4 className="text-sm font-medium">{t('documentCategoriesHint')}</h4>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EMPLOYEE_DOCUMENT_CATEGORY_KEYS.map((category) => (
            <li key={category}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={categoryState.has(category)}
                  disabled={pending}
                  onCheckedChange={(value) => toggleCategory(category, value === true)}
                />
                <span>{tDocCategories(category)}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const accessDetailsSection =
    account && account.status !== 'inactive' ? (
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AccessInfoField
            label={t('status')}
            value={
              <span className="flex flex-col gap-0.5">
                <span>{tStatus(statusView!.statusKey)}</span>
                {statusView?.hintKey ? (
                  <span className="text-xs font-normal text-[var(--pf-text-secondary)]">
                    {tStatus(statusView.hintKey)}
                  </span>
                ) : null}
              </span>
            }
          />
          <AccessInfoField
            label={t('appUsername')}
            value={account.username}
            valueDir="ltr"
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyText(account.username, t('usernameCopied'))}
              >
                {t('copy')}
              </Button>
            }
          />
          {employeeNumber ? (
            <AccessInfoField
              label={t('employeeNumber')}
              value={employeeNumber}
              valueDir="ltr"
              hint={t('employeeNumberHint')}
            />
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personalPinSet ? (
            <AccessInfoField label={t('personalPinLabel')} value={t('personalPinSet')} />
          ) : tempPinActive && shareCredentials?.temporaryPin ? (
            <>
              <AccessInfoField
                label={t('tempPinLabel')}
                value={shareCredentials.temporaryPin}
                valueDir="ltr"
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void copyText(shareCredentials.temporaryPin, t('pinCopied'))
                    }
                  >
                    {t('copy')}
                  </Button>
                }
              />
              <AccessInfoField
                label={t('tempPinExpiry')}
                value={formatCredentialExpiry(new Date(shareCredentials.temporaryPinExpiresAt))}
                valueDir="ltr"
              />
            </>
          ) : tempPinActive && account.temporaryPinExpiresAt ? (
            <AccessInfoField
              label={t('tempPinLabel')}
              value={t('tempPinActiveHidden')}
              hint={formatCredentialExpiry(account.temporaryPinExpiresAt)}
            />
          ) : (
            <AccessInfoField label={t('tempPinLabel')} value={t('tempPinInactive')} />
          )}
        </div>

        <AccessInfoField
          label={t('loginLinkLabel')}
          value={<span className="break-all text-xs font-normal">{loginUrl}</span>}
          valueDir="ltr"
          actions={
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href={loginUrl} target="_blank" rel="noopener noreferrer">
                  {t('openLoginPage')}
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyText(loginUrl, t('linkCopied'))}
              >
                {t('copy')}
              </Button>
            </div>
          }
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canShare ? (
            <Button type="button" disabled={pending} onClick={() => setShareDialogOpen(true)}>
              {t('shareCredentials')}
            </Button>
          ) : tempPinActive ? (
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(handleCreateTempPin)}>
              {t('createTempPin')}
            </Button>
          ) : (
            <>
              <p className="w-full text-sm text-[var(--pf-text-secondary)]">{t('tempPinInactive')}</p>
              <Button type="button" variant="secondary" disabled={pending} onClick={() => run(handleCreateTempPin)}>
                {t('createTempPin')}
              </Button>
            </>
          )}
          {canShare ? (
            <>
              <Button type="button" variant="secondary" asChild>
                <a href={loginUrl} target="_blank" rel="noopener noreferrer">
                  {t('openLoginPage')}
                </a>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copyText(loginUrl, t('linkCopied'))}
              >
                {t('copyLoginLink')}
              </Button>
            </>
          ) : null}
        </div>
      </section>
    ) : (
      <section className="space-y-4">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('noAccessHint')}</p>
        <Button type="button" disabled={pending} onClick={() => run(handleActivate)}>
          {t('activate')}
        </Button>
      </section>
    );

  const accountActionsSection =
    account && account.status !== 'inactive' ? (
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(handleResetPin)}
          >
            {t('resetPin')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => revokeEmployeeAppSessionsAction(employeeId))}
          >
            {t('revokeSessions')}
          </Button>
          {account.status === 'active' ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => suspendEmployeeAppAction(employeeId))}
            >
              {t('suspend')}
            </Button>
          ) : null}
          {account.status === 'suspended' ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => resumeEmployeeAppAction(employeeId))}
            >
              {t('resume')}
            </Button>
          ) : null}
          {account.status !== 'blocked' ? (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => run(() => blockEmployeeAppAction(employeeId))}
            >
              {t('block')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => disableEmployeeAppAction(employeeId))}
          >
            {t('disable')}
          </Button>
        </div>
      </section>
    ) : null;

  return (
    <Card className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">{t('title')}</h2>

      <CollapsibleSection title={t('sectionAccess')} defaultOpen>
        {accessDetailsSection}
      </CollapsibleSection>

      {accountActionsSection ? (
        <CollapsibleSection title={t('sectionAccountActions')} defaultOpen>
          {accountActionsSection}
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title={t('sectionPermissions')}
        summary={tPresets(presetTranslationKey(selectedPreset))}
        defaultOpen={!account || account.status === 'inactive'}
      >
        {permissionEditor}
      </CollapsibleSection>

      {documentsSection ? (
        <CollapsibleSection title={t('sectionDocuments')} defaultOpen={false}>
          {documentsSection}
        </CollapsibleSection>
      ) : null}

      {shareCredentials && canShare ? (
        <EmployeeCredentialsShareDialog
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          credentials={{
            employeeName,
            organizationName,
            username: shareCredentials.username,
            temporaryPin: shareCredentials.temporaryPin,
            temporaryPinExpiresAt: new Date(shareCredentials.temporaryPinExpiresAt),
            loginUrl: shareCredentials.loginUrl,
          }}
          employeePhone={employeePhone}
          employeeEmail={employeeEmail}
        />
      ) : null}
    </Card>
  );
}
