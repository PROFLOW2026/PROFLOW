'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { checkContractorPassword, type PasswordRuleViolation } from '../domain/password-policy';
import { cn } from '@/shared/ui/cn';

const RULES: readonly PasswordRuleViolation[] = ['too_short', 'needs_variety', 'contains_username', 'mismatch'];

/** Live checklist of the contractor password policy (same pure rules the server enforces). */
export function PasswordRules({
  password,
  confirmation,
  username,
}: {
  password: string;
  confirmation: string;
  username?: string | null;
}) {
  const t = useTranslations('contractorAccess.auth.passwordRules');
  const violations = new Set(checkContractorPassword({ password, confirmation, username }));

  return (
    <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-xs">
      <p className="mb-2 font-medium">{t('title')}</p>
      <ul className="flex flex-col gap-1">
        {RULES.map((rule) => {
          const ok = password.length > 0 && !violations.has(rule);
          return (
            <li key={rule} className={cn('flex items-center gap-2', ok ? 'text-[var(--pf-status-success-fg)]' : 'text-[var(--pf-text-secondary)]')}>
              {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              <span>{t(rule)}</span>
            </li>
          );
        })}
        {violations.has('too_common') && password.length > 0 ? (
          <li className="flex items-center gap-2 text-[var(--pf-status-danger-fg)]">
            <X className="size-3.5" aria-hidden />
            <span>{t('too_common')}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function PasswordViolationList({ violations }: { violations?: readonly PasswordRuleViolation[] }) {
  const t = useTranslations('contractorAccess.auth.passwordRules');
  if (!violations || violations.length === 0) return null;
  return (
    <ul className="mt-1 list-disc ps-5 text-xs">
      {violations.map((violation) => (
        <li key={violation}>{t(violation)}</li>
      ))}
    </ul>
  );
}
