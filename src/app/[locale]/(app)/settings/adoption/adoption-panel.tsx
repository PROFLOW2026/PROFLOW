'use client';

import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { previewOrgAdoptionAction, applyOrgAdoptionAction, type AdoptionActionState } from './actions';
import {
  ORG_PROFILE_TYPE_LABELS,
  ORG_PROFILE_TYPES,
  type OrgProfileType,
} from '../org-profile/org-profile-domain';

type Step = 'select' | 'preview' | 'done';

export function AdoptionPanel({ currentProfileType }: { currentProfileType: OrgProfileType | null }) {
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

  // Move to preview step after successful preview
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handlePreviewSubmit = (_e: React.FormEvent<HTMLFormElement>) => {
    // Let form action run; on success we move to preview
  };

  if (applyState.ok || _step === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          <p className="font-medium">Adoption complete 🎉</p>
          <p className="text-sm">Your stage definitions and module settings have been configured based on your profile type.</p>
        </Alert>
        <div className="flex gap-2">
          <Link href="/settings/stages" className="text-sm text-[var(--pf-brand-primary)] underline-offset-2 hover:underline">
            View stages →
          </Link>
          <Link href="/settings/modules" className="text-sm text-[var(--pf-brand-primary)] underline-offset-2 hover:underline">
            View modules →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          This wizard applies default stage definitions, module visibility, and org profile type for an existing
          organization. All writes are idempotent — nothing is overwritten if you&apos;ve already configured it.
        </p>
      </div>

      {/* Step 1: Select profile type */}
      <section>
        <h3 className="mb-3 text-sm font-semibold">Step 1: Select your organization profile</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ORG_PROFILE_TYPES.map((type) => {
            const info = ORG_PROFILE_TYPE_LABELS[type];
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
                <span className="text-sm font-medium">{info.label}</span>
                <span className="text-xs text-[var(--pf-text-secondary)]">{info.description}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* Preview form */}
      <form
        action={previewAction}
        onSubmit={() => {
          // After action runs, we'll have previewState.preview
        }}
      >
        <input type="hidden" name="orgProfileType" value={selectedType ?? ''} />
        <Button
          type="submit"
          size="sm"
          loading={previewPending}
          disabled={!selectedType}
        >
          Preview defaults
        </Button>
        {previewState.error && <Alert tone="danger" className="mt-2">{previewState.error}</Alert>}
      </form>

      {/* Step 2: Preview */}
      {previewState.preview && (
        <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h3 className="text-sm font-semibold">
            Step 2: Preview — {ORG_PROFILE_TYPE_LABELS[previewState.preview.orgProfileType].label}
          </h3>

          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-[var(--pf-text-muted)]">STAGES TO CREATE</p>
              {previewState.preview.stagesToCreate.length === 0 ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  All {previewState.preview.stagesAlreadyExist} default stages already exist.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {previewState.preview.stagesToCreate.map((name) => (
                    <Badge key={name} tone="neutral" className="text-xs">{name}</Badge>
                  ))}
                </div>
              )}
              {previewState.preview.stagesAlreadyExist > 0 && (
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                  {previewState.preview.stagesAlreadyExist} stage(s) already exist and will be skipped.
                </p>
              )}
            </div>

            {previewState.preview.modulesToDisable.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-[var(--pf-text-muted)]">MODULES TO DISABLE BY DEFAULT</p>
                <div className="flex flex-wrap gap-1">
                  {previewState.preview.modulesToDisable.map((mod) => (
                    <Badge key={mod} tone="info" className="text-xs">{mod}</Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                  Only modules not already configured will be affected.
                </p>
              </div>
            )}

            {previewState.preview.profileTypeAlreadySet && (
              <Alert tone="info">
                Org profile type is already set to this profile — it will not be overwritten.
              </Alert>
            )}
          </div>

          {/* Step 3: Confirm */}
          <form action={applyAction}>
            <input type="hidden" name="orgProfileType" value={previewState.preview.orgProfileType} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={applyPending}>
                Apply defaults
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Reset preview by going back
                  window.location.reload();
                }}
              >
                Cancel
              </Button>
            </div>
            {applyState.error && <Alert tone="danger" className="mt-2">{applyState.error}</Alert>}
          </form>
        </section>
      )}
    </div>
  );
}
