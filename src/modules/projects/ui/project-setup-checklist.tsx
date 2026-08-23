import { CheckCircle2, Circle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export interface ProjectSetupChecklistProps {
  readonly projectId: string;
  readonly hasContract: boolean;
  readonly hasClient: boolean;
  readonly hasTeam: boolean;
  readonly hasLoggedCost: boolean;
  readonly hasBillingPlan: boolean;
}

export async function ProjectSetupChecklist({
  projectId,
  hasContract,
  hasClient,
  hasTeam,
  hasLoggedCost,
  hasBillingPlan,
}: ProjectSetupChecklistProps) {
  const t = await getTranslations('projects.setupChecklist');

  const steps = [
    {
      key: 'client',
      done: hasClient,
      href: `/projects/${projectId}?tab=details`,
      label: t('steps.client'),
      hint: t('steps.clientHint'),
    },
    {
      key: 'contract',
      done: hasContract,
      href: `/projects/${projectId}?tab=contracts`,
      label: t('steps.contract'),
      hint: t('steps.contractHint'),
    },
    {
      key: 'team',
      done: hasTeam,
      href: `/projects/${projectId}?tab=team`,
      label: t('steps.team'),
      hint: t('steps.teamHint'),
    },
    {
      key: 'cost',
      done: hasLoggedCost,
      href: `/expenses/new?projectId=${projectId}`,
      label: t('steps.cost'),
      hint: t('steps.costHint'),
    },
    {
      key: 'billing',
      done: hasBillingPlan,
      href: `/projects/${projectId}?tab=billingPlan`,
      label: t('steps.billing'),
      hint: t('steps.billingHint'),
    },
  ] as const;

  const remaining = steps.filter((step) => !step.done).length;
  if (remaining === 0) return null;

  return (
    <Card className="border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)]">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description', { count: remaining })}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-start gap-3 text-sm">
              {step.done ? (
                <CheckCircle2
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-[var(--pf-status-success-fg)]"
                />
              ) : (
                <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--pf-text-muted)]" />
              )}
              <div className="min-w-0">
                {step.done ? (
                  <span className="text-[var(--pf-text-secondary)] line-through">{step.label}</span>
                ) : (
                  <Link href={step.href} className={cn(textNavLinkClassName, 'font-medium')}>
                    {step.label}
                  </Link>
                )}
                {!step.done ? (
                  <p className="mt-0.5 text-xs text-[var(--pf-text-muted)]">{step.hint}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
