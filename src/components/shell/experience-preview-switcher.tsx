'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setExperiencePreviewAction } from '@/modules/tenancy/application/experience-preview';
import {
  EXPERIENCE_PREVIEW_PROFILE_KEYS,
  type ExperiencePreviewProfileKey,
  type ExperiencePreviewSelection,
} from '@/modules/tenancy/domain/experience-preview';

function profileLabelKey(
  key: ExperiencePreviewProfileKey | string,
): `profiles.${ExperiencePreviewProfileKey}` {
  return `profiles.${key as ExperiencePreviewProfileKey}`;
}

/**
 * Owner-only text switcher for cookie-based experience preview.
 * Visual layer only — never writes organization settings.
 */
export function ExperiencePreviewSwitcher({
  selection,
  active,
  labelKey,
}: {
  selection: ExperiencePreviewSelection;
  active: boolean;
  labelKey: string;
}) {
  const t = useTranslations('nav.experiencePreview');
  const router = useRouter();

  async function applyPreview(value: string) {
    const data = new FormData();
    data.set('preview', value);
    await setExperiencePreviewAction(data);
    router.refresh();
  }

  const activeLabel =
    active && labelKey !== 'actual' ? t(profileLabelKey(labelKey)) : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-2 print:hidden sm:px-6">
      {active && activeLabel ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm text-[var(--pf-text-secondary)]">
          <p className="min-w-0 text-start">{t('previewing', { label: activeLabel })}</p>
          <button
            type="button"
            className="shrink-0 text-start text-sm font-medium text-[var(--pf-text-primary)] underline-offset-2 hover:underline"
            onClick={() => void applyPreview('actual')}
          >
            {t('returnToActual')}
          </button>
        </div>
      ) : null}

      <label className="flex min-w-0 flex-col gap-1 text-start text-xs text-[var(--pf-text-secondary)] sm:flex-row sm:items-center sm:gap-2">
        <span className="shrink-0 font-medium text-[var(--pf-text-primary)]">{t('label')}</span>
        <select
          className="h-9 min-w-0 max-w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-2 text-sm text-[var(--pf-text-primary)] sm:max-w-xs"
          value={selection}
          aria-label={t('label')}
          onChange={(event) => void applyPreview(event.target.value)}
        >
          <option value="actual">{t('actual')}</option>
          {EXPERIENCE_PREVIEW_PROFILE_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(profileLabelKey(key))}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
