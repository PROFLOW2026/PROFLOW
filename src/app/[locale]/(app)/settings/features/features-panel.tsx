'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OPTIONAL_MODULE_KEYS, type OptionalModuleKey } from '@/modules/tenancy';
import type { ModuleVisibility } from '@/modules/tenancy';
import { setModuleVisibilityAction, type SettingsActionState } from '../actions';

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
  isActive,
  canEdit,
}: {
  moduleKey: OptionalModuleKey;
  defaultMode: VisibilityMode;
  isActive: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.modules');
  const tCommon = useTranslations('common');
  const [mode, setMode] = useState(defaultMode);
  const [state, action, pending] = useActionState(setModuleVisibilityAction, {} as SettingsActionState);
  const moduleLabel = t(moduleKey);
  const visibilityLabel = t('visibilityLabel', { module: moduleLabel });

  return (
    <form action={action} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pf-border-default)] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{moduleLabel}</p>
        {defaultMode === 'auto' && !isActive ? (
          <p className="text-xs text-[var(--pf-text-muted)]">{t('autoHint')}</p>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex items-center gap-2">
          <input type="hidden" name="enabled" value={mode} />
          <input type="hidden" name="moduleKey" value={moduleKey} />
          <Select value={mode} onValueChange={(value) => setMode(value as VisibilityMode)}>
            <SelectTrigger aria-label={visibilityLabel} className="w-36">
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
          {t('saved')}
        </Alert>
      ) : null}
    </form>
  );
}

export function FeaturesSettingsPanel({
  visibility,
  preferences,
  canEdit,
}: {
  visibility: ModuleVisibility;
  preferences: readonly { moduleKey: string; enabled: boolean | null; firstUsedAt: Date | null }[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.modules');

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>

      <div className="mt-2 rounded-lg border border-[var(--pf-border-default)] p-4">
        {OPTIONAL_MODULE_KEYS.map((moduleKey) => (
          <ModuleRow
            key={moduleKey}
            moduleKey={moduleKey}
            defaultMode={resolveMode(moduleKey, visibility, preferences)}
            isActive={visibility[moduleKey]}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  );
}
