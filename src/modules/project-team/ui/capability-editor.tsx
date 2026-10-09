'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/shared/ui/cn';
import {
  PROJECT_CAPABILITY_GROUPS,
  isFinancialCapability,
  type ProjectCapability,
} from '../domain/capabilities';
import { CAPABILITIES_BY_GROUP, capabilityMessageKey, toggleCapability } from '../domain/editor';
import type { TeamTemplateOption } from '../domain/views';

export const CUSTOM_TEMPLATE_VALUE = '__custom__';

/** Template whose expanded set equals `selection` exactly, if any. */
export function matchingTemplateKey(
  templates: readonly TeamTemplateOption[],
  selection: readonly string[],
): string | null {
  const sorted = [...selection].sort().join('|');
  return templates.find((template) => [...template.capabilities].sort().join('|') === sorted)?.key ?? null;
}

export function CapabilityEditor({
  templates,
  selection,
  onSelectionChange,
  actorCapabilities,
  readOnly,
  blocked,
  originalSelection,
}: {
  templates: readonly TeamTemplateOption[];
  selection: readonly string[];
  onSelectionChange: (next: string[]) => void;
  /** Capabilities the signed-in user holds on this project (only these are editable). */
  actorCapabilities: ReadonlySet<string>;
  readOnly: boolean;
  /** Capabilities the server refused on the last attempt (highlighted). */
  blocked?: readonly string[];
  /** Saved selection, used to show what will change. */
  originalSelection?: readonly string[];
}) {
  const t = useTranslations('projectTeam');
  const selected = new Set(selection);
  const original = originalSelection ? new Set(originalSelection) : null;
  const blockedSet = new Set(blocked ?? []);
  const templateValue = matchingTemplateKey(templates, selection) ?? CUSTOM_TEMPLATE_VALUE;
  const grantableTemplates = templates.filter((template) =>
    template.capabilities.every((capability) => actorCapabilities.has(capability)),
  );
  const addsFinancial = selection.some(
    (capability) =>
      isFinancialCapability(capability as ProjectCapability) && !(original?.has(capability) ?? false),
  );
  const showsOperationalDelegation =
    !readOnly &&
    (templateValue === 'client_coordinator' ||
      selection.includes('operational.approve' as ProjectCapability));

  return (
    <div className="flex flex-col gap-5">
      {showsOperationalDelegation ? (
        <Alert tone="info" title={t('editor.operationalDelegationTitle')}>
          {t('editor.operationalDelegationHint')}
        </Alert>
      ) : null}
      {readOnly ? null : (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="project-team-template">
            {t('editor.templateLabel')}
          </label>
          <Select
            value={templateValue}
            onValueChange={(value) => {
              if (value === CUSTOM_TEMPLATE_VALUE) return;
              const template = templates.find((candidate) => candidate.key === value);
              if (template) onSelectionChange([...template.capabilities]);
            }}
          >
            <SelectTrigger id="project-team-template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CUSTOM_TEMPLATE_VALUE}>{t('editor.customSelection')}</SelectItem>
              {templates.map((template) => (
                <SelectItem
                  key={template.key}
                  value={template.key}
                  disabled={!grantableTemplates.includes(template)}
                >
                  {t(`templates.${template.key}`)}
                  {template.financialAccess === 'none' ? '' : ` · ${t('editor.includesFinancial')}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('editor.templateHint')}</p>
        </div>
      )}

      {PROJECT_CAPABILITY_GROUPS.map((group) => {
        const capabilities = CAPABILITIES_BY_GROUP[group];
        const count = capabilities.filter((capability) => selected.has(capability)).length;
        return (
          <fieldset
            key={group}
            className={cn(
              'flex flex-col gap-3 rounded-lg border p-3 sm:p-4',
              group === 'financial'
                ? 'border-[var(--pf-status-warning-border)]'
                : 'border-[var(--pf-border-default)]',
            )}
          >
            <legend className="flex flex-wrap items-center gap-2 px-1 text-sm font-semibold">
              {t(`groups.${group}`)}
              <Badge tone={group === 'financial' && count > 0 ? 'warning' : 'neutral'}>
                {t('editor.groupCount', { count, total: capabilities.length })}
              </Badge>
            </legend>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t(`groupDescriptions.${group}`)}</p>
            {group === 'financial' ? (
              <Alert tone="warning" title={t('editor.financialWarningTitle')}>
                {t('editor.financialWarning')}
              </Alert>
            ) : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {capabilities.map((capability) => {
                const checked = selected.has(capability);
                const canChange = !readOnly && actorCapabilities.has(capability);
                const key = capabilityMessageKey(capability);
                const changed = original ? original.has(capability) !== checked : false;
                const inputId = `capability-${key}`;
                return (
                  <li key={capability}>
                    <label
                      htmlFor={inputId}
                      className={cn(
                        'flex min-h-11 items-start gap-3 rounded-md border px-3 py-2 text-sm',
                        canChange ? 'cursor-pointer' : 'cursor-not-allowed opacity-75',
                        blockedSet.has(capability)
                          ? 'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)]'
                          : changed
                            ? 'border-[var(--pf-border-focus)] bg-[var(--pf-action-subtle-hover)]'
                            : 'border-[var(--pf-border-default)]',
                      )}
                    >
                      <Checkbox
                        id={inputId}
                        className="mt-0.5"
                        checked={checked}
                        disabled={!canChange}
                        onCheckedChange={(value) =>
                          onSelectionChange(toggleCapability(selection, capability, value === true))
                        }
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium">{t(`capabilities.${key}`)}</span>
                        <span className="text-xs text-[var(--pf-text-secondary)]">
                          {t(`capabilityHints.${key}`)}
                        </span>
                        {!readOnly && !actorCapabilities.has(capability) ? (
                          <span className="text-xs text-[var(--pf-text-muted)]">{t('editor.notGrantable')}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      {addsFinancial && !readOnly ? (
        <Alert tone="warning" title={t('editor.addingFinancialTitle')}>
          {t('editor.addingFinancial')}
        </Alert>
      ) : null}
    </div>
  );
}
