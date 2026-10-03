import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { listProjectInstructions } from '@/modules/site-instructions';
import { INSTRUCTION_STATUS_TONE } from '@/modules/site-instructions/ui/status-tone';
import { isIsoDate } from '@/modules/site-log';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm, FieldLabel, fieldSelectClassName } from '@/modules/site-log/ui/field-action-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { SITE_INSTRUCTION_CATEGORIES } from '@drizzle/schema';
import { issueInstructionAction } from './actions';

const FILTERS = ['open', 'issued', 'acknowledged', 'performed', 'closed', 'cancelled', 'all'] as const;
const PAGE_SIZE = 30;

export async function InstructionsScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; page?: string; create?: string; logDate?: string; meetingId?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const status = (FILTERS as readonly string[]).includes(query.status ?? '') ? (query.status as (typeof FILTERS)[number]) : 'open';
  const page = Math.max(0, Number.parseInt(query.page ?? '0', 10) || 0);
  const data = await loadOrNotFound(() =>
    withOrgContext((context) =>
      listProjectInstructions(context, projectId, { status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    ),
  );
  const basePath = `${surfaceRoot ?? ('/projects/' + projectId)}/instructions`;
  const logDate = query.logDate && isIsoDate(query.logDate) ? query.logDate : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('instructions.title')} description={t('instructions.description')} />

      {data.canIssue ? (
        <CollapsibleSection
          title={t('instructions.issue')}
          summary={t('instructions.issueHint')}
          defaultOpen={query.create === '1'}
        >
          <div className="p-4">
            {data.contractors.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('instructions.noContractors')}</p>
            ) : (
              <FieldActionForm
                action={issueInstructionAction}
                hidden={{ projectId, returnBase: basePath, logDate, meetingId: query.meetingId ?? null }}
                submitLabel={t('instructions.issueSubmit')}
              >
                <FieldLabel label={t('instructions.fields.contractor')}>
                  <select name="party" required className={fieldSelectClassName} defaultValue="">
                    <option value="" disabled>
                      {t('common.select')}
                    </option>
                    {data.contractors.map((c) => (
                      <option key={c.agreementId} value={`${c.vendorId}:${c.agreementId}`}>
                        {c.vendorName} · {c.agreementTitle}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel label={t('instructions.fields.title')}>
                  <Input name="title" required maxLength={300} />
                </FieldLabel>
                <FieldLabel label={t('instructions.fields.description')}>
                  <Textarea name="description" rows={3} />
                </FieldLabel>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">{t('instructions.fields.category')}</legend>
                  {SITE_INSTRUCTION_CATEGORIES.map((category) => (
                    <label key={category} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="category"
                        value={category}
                        defaultChecked={category === 'operational'}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{t(`instructionCategory.${category}`)}</span>
                        <span className="block text-xs text-[var(--pf-text-secondary)]">
                          {t(`instructionCategoryHint.${category}`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldLabel label={t('instructions.fields.dueDate')}>
                    <Input name="dueDate" type="date" />
                  </FieldLabel>
                  {data.locations.length > 0 ? (
                    <FieldLabel label={t('common.location')}>
                      <select name="locationId" className={fieldSelectClassName} defaultValue="">
                        <option value="">{t('common.none')}</option>
                        {data.locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.code ? `${location.code} · ${location.name}` : location.name}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                  ) : null}
                </div>
              </FieldActionForm>
            )}
          </div>
        </CollapsibleSection>
      ) : null}

      <nav className="flex min-w-0 gap-2 overflow-x-auto pb-1" aria-label={t('instructions.filterLabel')}>
        {FILTERS.map((filter) => (
          <Button key={filter} asChild size="sm" variant={filter === status ? 'primary' : 'secondary'}>
            <Link href={`${basePath}?status=${filter}`}>{t(`instructions.filters.${filter}`)}</Link>
          </Button>
        ))}
      </nav>

      {data.items.length === 0 ? (
        <EmptyState title={t('instructions.emptyTitle')} description={t('instructions.emptyDescription')} />
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link href={`${basePath}/${item.id}`} className="block min-w-0">
                <Card className="transition-colors hover:border-[var(--pf-border-focus)]">
                  <CardContent className="flex min-w-0 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="pf-numeric text-sm text-[var(--pf-text-secondary)]">#{item.instructionNumber}</span>
                        <span className="break-words font-medium">{item.title}</span>
                      </p>
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        {item.vendorName ?? t('common.contractor')}
                        {' · '}
                        {format.dateTime(item.issuedAt, { dateStyle: 'medium' })}
                        {item.dueDate ? ` · ${t('instructions.dueOn', { date: item.dueDate })}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.category !== 'operational' ? (
                        <Badge tone="warning">{t(`instructionCategory.${item.category}`)}</Badge>
                      ) : null}
                      {item.conversionState === 'pending' ? <Badge tone="pending">{t('conversion.pending')}</Badge> : null}
                      {item.overdue ? <Badge tone="danger">{t('instructions.overdue')}</Badge> : null}
                      <Badge tone={INSTRUCTION_STATUS_TONE[item.status]}>{t(`instructionStatus.${item.status}`)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page > 0 || data.hasMore ? (
        <nav className="flex justify-between gap-2" aria-label={t('instructions.pagination')}>
          {page > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`${basePath}?status=${status}&page=${page - 1}`}>{t('common.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          {data.hasMore ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`${basePath}?status=${status}&page=${page + 1}`}>{t('common.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export default function InstructionsPage(
  props: Omit<Parameters<typeof InstructionsScreen>[0], 'surfaceRoot'>,
) {
  return <InstructionsScreen {...props} />;
}
