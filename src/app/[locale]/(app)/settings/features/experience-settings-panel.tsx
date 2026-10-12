'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  CAPABILITY_CUSTOMIZATION_MODES,
  type CapabilityCustomizationMode,
} from '@/modules/tenancy/domain/capability-overrides';
import {
  EXPERIENCE_FAMILY_KEYS,
  type ExperienceFamilyKey,
  type ExperienceUiOverrides,
} from '@/modules/tenancy/domain/experience-family';
import {
  EXPERIENCE_UI_TOGGLE_GROUPS,
  EXPERIENCE_UI_TOGGLES,
  buildExperienceUiContext,
  experienceToggleI18nKey,
  isToggleLocked,
} from '@/modules/tenancy/domain/experience-ui-registry';
import {
  resetExperienceUiOverridesAction,
  saveExperienceSettingsAction,
} from '@/modules/tenancy/application/save-experience-settings';

export function ExperienceSettingsPanel({
  currentFamily,
  capabilityMode,
  currentOverrides,
  canEdit,
}: {
  currentFamily: ExperienceFamilyKey | null;
  capabilityMode: CapabilityCustomizationMode | null;
  currentOverrides: ExperienceUiOverrides;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.experience');
  const [family, setFamily] = useState<ExperienceFamilyKey>(
    currentFamily ?? 'project_contracting',
  );
  const [mode, setMode] = useState<CapabilityCustomizationMode>(capabilityMode ?? 'profile');
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const def of EXPERIENCE_UI_TOGGLES) {
      initial[def.id] = currentOverrides[def.id] !== false;
    }
    return initial;
  });
  const [pending, startTransition] = useTransition();

  const overridePayload = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const def of EXPERIENCE_UI_TOGGLES) {
      if (overrides[def.id] === false) out[def.id] = false;
    }
    return out;
  }, [overrides]);

  const uiCtx = useMemo(
    () =>
      buildExperienceUiContext({
        customizationMode: mode,
        family,
        overrides: overridePayload,
      }),
    [mode, family, overridePayload],
  );

  const customTogglesActive = mode === 'custom';

  function setToggle(id: string, on: boolean) {
    setOverrides((prev) => ({ ...prev, [id]: on }));
  }

  function save(resetUi = false) {
    startTransition(async () => {
      const data = new FormData();
      data.set('family', family);
      data.set('capabilityMode', mode);
      if (resetUi) data.set('resetUi', '1');
      const payload: Record<string, boolean> = {};
      for (const def of EXPERIENCE_UI_TOGGLES) {
        if (overrides[def.id] === false) payload[def.id] = false;
      }
      data.set('overridesJson', JSON.stringify(payload));
      await saveExperienceSettingsAction(data);
      if (resetUi) {
        const reset: Record<string, boolean> = {};
        for (const def of EXPERIENCE_UI_TOGGLES) reset[def.id] = true;
        setOverrides(reset);
      }
    });
  }

  function resetUiOnly() {
    startTransition(async () => {
      await resetExperienceUiOverridesAction();
      const reset: Record<string, boolean> = {};
      for (const def of EXPERIENCE_UI_TOGGLES) reset[def.id] = true;
      setOverrides(reset);
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('title')}</h3>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{t('familyLabel')}</span>
        <Select
          value={family}
          onValueChange={(value) => setFamily(value as ExperienceFamilyKey)}
          disabled={!canEdit || pending}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPERIENCE_FAMILY_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`families.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{t('modeLabel')}</span>
        <Select
          value={mode}
          onValueChange={(value) => setMode(value as CapabilityCustomizationMode)}
          disabled={!canEdit || pending}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CAPABILITY_CUSTOMIZATION_MODES.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`modes.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {customTogglesActive ? (
        <div className="flex min-w-0 flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('customTogglesHint')}</p>
          {EXPERIENCE_UI_TOGGLE_GROUPS.map((group) => {
            const items = EXPERIENCE_UI_TOGGLES.filter((def) => def.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="flex min-w-0 flex-col gap-2">
                <h4 className="text-sm font-medium">{t(`groups.${group}`)}</h4>
                <ul className="flex min-w-0 flex-col gap-3">
                  {items.map((def) => {
                    const locked = isToggleLocked(def.id, uiCtx);
                    const key = experienceToggleI18nKey(def.id);
                    const on = overrides[def.id] !== false;
                    return (
                      <li
                        key={def.id}
                        className="flex min-w-0 items-start justify-between gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{t(`toggles.${key}.label`)}</p>
                          <p className="text-xs text-[var(--pf-text-secondary)]">
                            {t(`toggles.${key}.description`)}
                          </p>
                          {locked ? (
                            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                              {t('toggleLocked')}
                            </p>
                          ) : null}
                        </div>
                        <Switch
                          checked={on}
                          disabled={!canEdit || pending || locked}
                          onCheckedChange={(checked) => setToggle(def.id, checked)}
                          aria-label={t(`toggles.${key}.label`)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('togglesRequireCustomMode')}</p>
      )}

      {canEdit ? (
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button type="button" loading={pending} onClick={() => save(false)} className="self-start">
            {t('save')}
          </Button>
          {customTogglesActive ? (
            <Button
              type="button"
              variant="secondary"
              loading={pending}
              onClick={() => resetUiOnly()}
              className="self-start"
            >
              {t('resetUi')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
