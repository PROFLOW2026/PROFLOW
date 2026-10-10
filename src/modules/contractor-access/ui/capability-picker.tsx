'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  ALL_EXTERNAL_CAPABILITIES,
  EXTERNAL_CAPABILITIES,
  EXTERNAL_GRANT_TEMPLATES,
  FINANCIAL_EXTERNAL_CAPABILITIES,
  type ExternalCapability,
} from '@/shared/external';
import { cn } from '@/shared/ui/cn';

export const TEMPLATE_CHOICES = [...Object.keys(EXTERNAL_GRANT_TEMPLATES), 'custom'] as const;

export function capabilityLabelKey(capability: string): string {
  return `manage.capabilities.${capability.replaceAll('.', '_')}`;
}

const FINANCIAL = new Set<string>(FINANCIAL_EXTERNAL_CAPABILITIES);
const GROUPS: ReadonlyArray<{ key: 'operational' | 'financial' | 'procurement'; items: readonly ExternalCapability[] }> = [
  {
    key: 'operational',
    items: ALL_EXTERNAL_CAPABILITIES.filter((c) => !FINANCIAL.has(c) && c !== EXTERNAL_CAPABILITIES.BID_SUBMIT),
  },
  { key: 'financial', items: FINANCIAL_EXTERNAL_CAPABILITIES },
  { key: 'procurement', items: [EXTERNAL_CAPABILITIES.BID_SUBMIT] },
];

export function templateCapabilities(template: string): readonly string[] {
  return template in EXTERNAL_GRANT_TEMPLATES
    ? EXTERNAL_GRANT_TEMPLATES[template as keyof typeof EXTERNAL_GRANT_TEMPLATES]
    : [];
}

/**
 * Template radio + per-capability selection. Submits `template` and repeated `capabilities` fields.
 * Financial capabilities are disabled when the grantor cannot grant them (server re-checks).
 */
export function CapabilityPicker({
  idPrefix,
  canGrantFinancial,
  initialTemplate = 'site_contractor',
  initialCapabilities,
}: {
  idPrefix: string;
  canGrantFinancial: boolean;
  initialTemplate?: string;
  initialCapabilities?: readonly string[];
}) {
  const t = useTranslations('contractorAccess');
  const [template, setTemplate] = useState(initialTemplate);
  const [custom, setCustom] = useState<Set<string>>(
    () => new Set(initialCapabilities ?? templateCapabilities(initialTemplate)),
  );
  const selected = useMemo(
    () => (template === 'custom' ? custom : new Set(templateCapabilities(template))),
    [template, custom],
  );
  const hasFinancial = [...selected].some((capability) => FINANCIAL.has(capability));

  const toggle = (capability: string) => {
    setTemplate('custom');
    setCustom((current) => {
      const next = new Set(template === 'custom' ? current : templateCapabilities(template));
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      next.add(EXTERNAL_CAPABILITIES.PROJECT_VIEW);
      return next;
    });
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{t('manage.invite.template')}</legend>
      <input type="hidden" name="template" value={template} />
      {template === 'custom'
        ? [...custom].map((capability) => <input key={capability} type="hidden" name="capabilities" value={capability} />)
        : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TEMPLATE_CHOICES.map((choice) => {
          const financialTemplate = templateCapabilities(choice).some((c) => FINANCIAL.has(c));
          const disabled = financialTemplate && !canGrantFinancial;
          return (
            <label
              key={choice}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-sm',
                template === choice
                  ? 'border-[var(--pf-action-primary)] bg-[var(--pf-bg-accent)]'
                  : 'border-[var(--pf-border-default)]',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name={`${idPrefix}-template-choice`}
                  checked={template === choice}
                  disabled={disabled}
                  onChange={() => {
                    setTemplate(choice);
                    if (choice !== 'custom') setCustom(new Set(templateCapabilities(choice)));
                  }}
                />
                {t(`manage.templates.${choice}.name`)}
              </span>
              <span className="text-xs text-[var(--pf-text-secondary)]">{t(`manage.templates.${choice}.description`)}</span>
            </label>
          );
        })}
      </div>

      <details className="rounded-md border border-[var(--pf-border-default)] p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t('manage.invite.customCapabilities', { count: selected.size })}
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          {GROUPS.map((group) => (
            <div key={group.key}>
              <p className="mb-2 text-xs font-semibold uppercase text-[var(--pf-text-secondary)]">
                {t(`manage.capabilityGroups.${group.key}`)}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.items.map((capability) => {
                  const disabled =
                    capability === EXTERNAL_CAPABILITIES.PROJECT_VIEW || (FINANCIAL.has(capability) && !canGrantFinancial);
                  return (
                    <label
                      key={capability}
                      className={cn('flex min-h-11 items-center gap-2 text-sm', disabled && 'opacity-60')}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(capability)}
                        disabled={disabled}
                        onChange={() => toggle(capability)}
                      />
                      <span>{t(capabilityLabelKey(capability))}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </details>

      {hasFinancial ? (
        <p className="flex items-start gap-2 rounded-md border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] p-2 text-xs text-[var(--pf-status-warning-fg)]">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('manage.financialWarning')}
        </p>
      ) : null}
      {!canGrantFinancial ? (
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('manage.financialLocked')}</p>
      ) : null}
    </fieldset>
  );
}
