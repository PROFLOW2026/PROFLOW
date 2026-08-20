'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CAPABILITY_GROUP_ORDER,
  listCapabilitiesByGroup,
  requiredFoundationsFor,
  type CapabilityGroup,
} from '@/modules/tenancy/domain/capability-registry';
import {
  type ModuleVisibility,
  type OptionalModuleKey,
} from '@/modules/tenancy/domain/types';
import {
  enableAllCapabilitiesAction,
  resetCapabilitiesToProfileAction,
  setModuleVisibilityAction,
  type SettingsActionState,
} from '../actions';

type VisibilityMode = 'auto' | 'on' | 'off';

function resolveMode(
  key: OptionalModuleKey,
  visibility: ModuleVisibility,
  preferences: readonly { moduleKey: string; enabled: boolean | null }[],
): VisibilityMode {
  const pref = preferences.find((item) => item.moduleKey === key);
  if (pref?.enabled === true) return 'on';
  if (pref?.enabled === false) return 'off';
  return visibility[key] ? 'on' : 'auto';
}

function ModuleRow({
  moduleKey,
  defaultMode,
  canEdit,
}: {
  moduleKey: OptionalModuleKey;
  defaultMode: VisibilityMode;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.modules');
  const tCommon = useTranslations('common');
  const [mode, setMode] = useState(defaultMode);
  const [state, action, pending] = useActionState(setModuleVisibilityAction, {} as SettingsActionState);
  const moduleLabel = t(moduleKey);
  const visibilityLabel = t('visibilityLabel', { module: moduleLabel });
  const hint = t(`hints.${moduleKey}`);
  const foundations = requiredFoundationsFor(moduleKey);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 border-b border-[var(--pf-border-default)] py-3 last:border-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <p className="text-start font-medium">{moduleLabel}</p>
        <p className="text-start text-xs text-[var(--pf-text-muted)]">{hint}</p>
        {foundations.length > 0 && mode === 'on' ? (
          <p className="mt-1 text-start text-xs text-[var(--pf-text-secondary)]">
            {t('foundationsNote', {
              modules: foundations.map((key) => t(key)).join(', '),
            })}
          </p>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <input type="hidden" name="enabled" value={mode} />
          <input type="hidden" name="moduleKey" value={moduleKey} />
          <Select value={mode} onValueChange={(value) => setMode(value as VisibilityMode)}>
            <SelectTrigger aria-label={visibilityLabel} className="min-w-0 flex-1 sm:w-40 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('auto')}</SelectItem>
              <SelectItem value="on">{t('on')}</SelectItem>
              <SelectItem value="off">{t('off')}</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" variant="secondary" loading={pending}>
            {tCommon('actions.save')}
          </Button>
        </div>
      ) : (
        <span className="text-sm text-[var(--pf-text-secondary)]">
          {defaultMode === 'auto' ? t('auto') : defaultMode === 'on' ? t('on') : t('off')}
        </span>
      )}

      {state.error ? (
        <Alert tone="danger" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert tone="success" className="w-full" role="status" aria-live="polite">
          {state.message ?? t('saved')}
        </Alert>
      ) : null}
    </form>
  );
}

function BulkActions({
  canEdit,
  hasProfile,
}: {
  canEdit: boolean;
  hasProfile: boolean;
}) {
  const t = useTranslations('settings.modules');
  const [showAllState, showAllAction, showAllPending] = useActionState(
    enableAllCapabilitiesAction,
    {} as SettingsActionState,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetCapabilitiesToProfileAction,
    {} as SettingsActionState,
  );

  if (!canEdit) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <form action={showAllAction}>
          <Button type="submit" size="sm" variant="secondary" loading={showAllPending}>
            {t('showAll')}
          </Button>
        </form>
        <form action={resetAction}>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={resetPending}
            disabled={!hasProfile}
          >
            {t('resetToProfile')}
          </Button>
        </form>
      </div>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('showAllHint')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">
        {hasProfile ? t('resetToProfileHint') : t('resetNeedsProfile')}
      </p>
      {showAllState.error || resetState.error ? (
        <Alert tone="danger">{showAllState.error ?? resetState.error}</Alert>
      ) : null}
      {showAllState.ok || resetState.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {showAllState.message ?? resetState.message ?? t('bulkSaved')}
        </Alert>
      ) : null}
    </div>
  );
}

export function FeaturesSettingsPanel({
  visibility,
  preferences,
  canEdit,
  hasBusinessProfile = false,
}: {
  visibility: ModuleVisibility;
  preferences: readonly { moduleKey: string; enabled: boolean | null; firstUsedAt: Date | null }[];
  canEdit: boolean;
  hasBusinessProfile?: boolean;
}) {
  const t = useTranslations('settings.modules');

  const grouped = useMemo(() => {
    return CAPABILITY_GROUP_ORDER.map((group) => ({
      group,
      capabilities: listCapabilitiesByGroup(group),
    })).filter((entry) => entry.capabilities.length > 0);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('hideNeverDeletes')}</p>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('autoHint')}</p>

      <BulkActions canEdit={canEdit} hasProfile={hasBusinessProfile} />

      <div className="flex flex-col gap-6">
        {grouped.map(({ group, capabilities }) => (
          <section key={group} className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="mb-2 text-start text-sm font-semibold text-[var(--pf-text-primary)]">
              {t(`capabilityGroups.${group as CapabilityGroup}`)}
            </h3>
            {capabilities.map((capability) => (
              <ModuleRow
                key={capability.id}
                moduleKey={capability.id}
                defaultMode={resolveMode(capability.id, visibility, preferences)}
                canEdit={canEdit}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
