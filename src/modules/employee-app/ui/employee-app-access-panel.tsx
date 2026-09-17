'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface Props {
  readonly employeeId: string;
  readonly employeeNumber: string | null;
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
  employeeNumber,
  account,
  grants: initialGrants,
  documentCategories: initialCategories,
}: Props) {
  const t = useTranslations('employeeApp.admin');
  const tStatus = useTranslations('employeeApp.status');
  const tPresets = useTranslations('employeeApp.presets');
  const tPermissions = useTranslations('employeeApp.permissions');
  const tDocCategories = useTranslations('documents.categories');

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
  const [credentials, setCredentials] = useState<{
    username: string;
    pin: string;
    loginPath: string;
  } | null>(null);
  const [saveMessage, setSaveMessage] = useState<'success' | 'error' | null>(null);
  const [pending, startTransition] = useTransition();

  const documentsReadGranted = grantState.get(PERMISSIONS.DOCUMENTS_READ)?.granted === true;

  const syncPresetDetection = useCallback(
    (grants: Map<PermissionKey, EditorGrantState>, categories: Set<DocumentCategory>) => {
      setSelectedPreset(detectPresetFromState(grants, categories));
    },
    [],
  );

  function run(action: () => Promise<unknown>) {
    startTransition(() => {
      void action();
    });
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

    setCredentials({
      username: result.username,
      pin: result.temporaryPin,
      loginPath: result.loginPath,
    });
  }

  const permissionEditor = (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">{t('permissions')}</h3>
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

      {documentsReadGranted ? (
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
      ) : null}

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

  return (
    <Card className="space-y-6 p-4">
      <h2 className="text-lg font-semibold">{t('title')}</h2>

      {employeeNumber ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--pf-text-secondary)]">{t('employeeNumber')}</dt>
          <dd dir="ltr">{employeeNumber}</dd>
        </dl>
      ) : null}

      {account && account.status !== 'inactive' ? (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-[var(--pf-text-secondary)]">{t('status')}</dt>
            <dd>{tStatus(account.status)}</dd>
            <dt className="text-[var(--pf-text-secondary)]">{t('appUsername')}</dt>
            <dd dir="ltr">{account.username}</dd>
            {account.firstLoginAt ? (
              <>
                <dt className="text-[var(--pf-text-secondary)]">{t('firstLogin')}</dt>
                <dd>{account.firstLoginAt.toLocaleString('he-IL')}</dd>
              </>
            ) : null}
            {account.lastLoginAt ? (
              <>
                <dt className="text-[var(--pf-text-secondary)]">{t('lastLogin')}</dt>
                <dd>{account.lastLoginAt.toLocaleString('he-IL')}</dd>
              </>
            ) : null}
            {account.temporaryPinExpiresAt ? (
              <>
                <dt className="text-[var(--pf-text-secondary)]">{t('tempPinExpiry')}</dt>
                <dd>{account.temporaryPinExpiresAt.toLocaleString('he-IL')}</dd>
              </>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-2">
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
              onClick={() =>
                run(async () => {
                  const result = await resetEmployeeAppPinAction(employeeId);
                  setCredentials({
                    username: account.username,
                    pin: result.temporaryPin,
                    loginPath: `/${'he-IL'}/employee/login?org=${account.organizationId}`,
                  });
                })
              }
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
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => disableEmployeeAppAction(employeeId))}
            >
              {t('disable')}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('noAccessHint')}</p>
          <Button type="button" disabled={pending} onClick={() => run(handleActivate)}>
            {t('activate')}
          </Button>
        </div>
      )}

      {credentials ? (
        <div className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3 text-sm">
          <p className="font-medium">{t('credentialsTitle')}</p>
          <p>
            {t('appUsername')}: <strong dir="ltr">{credentials.username}</strong>
          </p>
          <p>
            PIN: <strong dir="ltr">{credentials.pin}</strong>
          </p>
          <p className="break-all text-[var(--pf-text-secondary)]">{credentials.loginPath}</p>
        </div>
      ) : null}

      <hr className="border-[var(--pf-border)]" />

      {permissionEditor}
    </Card>
  );
}
