import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import type { ContractorTaskWorkGuideStep, ContractorTaskWorkGuideStepKey } from '../domain/contractor-task-work-guide-steps';

export type { ContractorTaskWorkGuideStep, ContractorTaskWorkGuideStepKey } from '../domain/contractor-task-work-guide-steps';

export async function ContractorTaskWorkGuide({ steps }: { readonly steps: readonly ContractorTaskWorkGuideStep[] }) {
  if (steps.length === 0) return null;

  const t = await getTranslations('collaboration');
  const labels: Record<ContractorTaskWorkGuideStepKey, string> = {
    acknowledge: t('portal.tasks.guide.steps.acknowledge'),
    drawing: t('portal.tasks.guide.steps.drawing'),
    photo: t('portal.tasks.guide.steps.photo'),
    submit: t('portal.tasks.guide.steps.submit'),
  };

  return (
    <Card data-testid="contractor-task-work-guide">
      <CardHeader>
        <CardTitle>{t('portal.tasks.guide.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex list-decimal flex-col gap-2.5 ps-5 text-sm marker:font-semibold marker:text-[var(--pf-text-brand)]">
          {steps.map((step) => {
            const label = labels[step.key];
            const className = 'font-medium text-[var(--pf-text-primary)] hover:text-[var(--pf-text-brand)] hover:underline';
            return (
              <li key={step.key}>
                {step.href.startsWith('#') ? (
                  <a href={step.href} className={className}>
                    {label}
                  </a>
                ) : (
                  <Link href={step.href} className={className}>
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
