'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { isOptionalModuleKey, type OptionalModuleKey } from '@/modules/tenancy/domain/types';
import { previewOrgAdoptionAction, applyOrgAdoptionAction, type AdoptionActionState } from './actions';
import {
  ORG_PROFILE_TYPES,
  type OrgProfileType,
} from '../org-profile/org-profile-domain';

type Step = 'select' | 'preview' | 'done';

function ModuleBadge({ moduleKey }: { moduleKey: string }) {
  const tModules = useTranslations('settings.modules');
  const label = isOptionalModuleKey(moduleKey)
    ? tModules(moduleKey as OptionalModuleKey)
    : moduleKey;
  return <Badge tone="info" className="text-xs">{label}</Badge>;
}

export function AdoptionPanel({ currentProfileType }: { currentProfileType: OrgProfileType | null }) {
  const t = useTranslations('settings.adoptionPanel');
  const tActions = useTranslations('common.actions');
  const tProfile = useTranslations('settings.orgProfilePanel.types');
  const [_step, _setStep] = useState<Step>('select');
  const [selectedType, setSelectedType] = useState<OrgProfileType | null>(currentProfileType);

  const [previewState, previewAction, previewPending] = useActionState(
    previewOrgAdoptionAction,
    {} as AdoptionActionState,
  );
  const [applyState, applyAction, applyPending] = useActionState(
    applyOrgAdoptionAction,
    {} as AdoptionActionState,
  );

  if (applyState.ok || _step === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          <p className="font-medium">{t('completeTitle')}</p>
          <p className="text-sm">{t('completeBody')}</p>
        </Alert>
        <div className="flex gap-2">
          <Link href="/settings/stages" className="text-sm text-[var(--pf-brand-primary)] underline-offset-2 hover:underline">
            {t('viewStages')} →
          </Link>
          <Link href="/settings/modules" className="text-sm text-[var(--pf-brand-primary)] underline-offset-2 hover:underline">
            {t('viewModules')} →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold">{t('step1Title')}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ORG_PROFILE_TYPES.map((type) => {
            const isSelected = selectedType === type;
            return (
              <label
                key={type}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? 'border-[var(--pf-brand-primary)] bg-[var(--pf-brand-primary)]/5'
                    : 'border-[var(--pf-border-default)] hover:border-[var(--pf-border-hover)]'
                }`}
              >
                <input
                  type="radio"
                  name="profileType_select"
                  value={type}
                  checked={isSelected}
                  onChange={() => setSelectedType(type)}
                  className="sr-only"
                />
                <span className="text-sm font-medium">{tProfile(`${type}.label`)}</span>
                <span className="text-xs text-[var(--pf-text-secondary)]">{tProfile(`${type}.description`)}</span>
              </label>
            );
          })}
        </div>
      </section>

      <form action={previewAction}>
        <input type="hidden" name="orgProfileType" value={selectedType ?? ''} />
        <Button
          type="submit"
          size="sm"
          loading={previewPending}
          disabled={!selectedType}
        >
          {t('previewButton')}
        </Button>
        {previewState.error && <Alert tone="danger" className="mt-2">{previewState.error}</Alert>}
      </form>

      {previewState.preview && (
        <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h3 className="text-sm font-semibold">
            {t('step2PreviewTitle', { profile: tProfile(`${previewState.preview.orgProfileType}.label`) })}
          </h3>

          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--pf-text-muted)]">{t('stagesToCreate')}</p>
              {previewState.preview.stagesToCreate.length === 0 ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {t('allStagesExist', { count: previewState.preview.stagesAlreadyExist })}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {previewState.preview.stagesToCreate.map((name) => (
                    <Badge key={name} tone="neutral" className="text-xs">{name}</Badge>
                  ))}
                </div>
              )}
              {previewState.preview.stagesAlreadyExist > 0 && previewState.preview.stagesToCreate.length > 0 && (
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                  {t('stagesSkipped', { count: previewState.preview.stagesAlreadyExist })}
                </p>
              )}
            </div>

            {previewState.preview.modulesToDisable.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-[var(--pf-text-muted)]">{t('modulesToDisable')}</p>
                <div className="flex flex-wrap gap-1">
                  {previewState.preview.modulesToDisable.map((mod) => (
                    <ModuleBadge key={mod} moduleKey={mod} />
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('modulesHint')}</p>
              </div>
            )}

            {previewState.preview.profileTypeAlreadySet && (
              <Alert tone="info">{t('profileAlreadySet')}</Alert>
            )}
          </div>

          <form action={applyAction}>
            <input type="hidden" name="orgProfileType" value={previewState.preview.orgProfileType} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={applyPending}>
                {t('applyButton')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  window.location.reload();
                }}
              >
                {tActions('cancel')}
              </Button>
            </div>
            {applyState.error && <Alert tone="danger" className="mt-2">{applyState.error}</Alert>}
          </form>
        </section>
      )}
    </div>
  );
}
