import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import {
  generatedEntityPath,
  getRecurringDraftDetail,
  canManageDraftKind,
} from '@/modules/recurring-drafts';
import { RecurringDraftActions } from '@/modules/recurring-drafts/ui/draft-actions';
import { PayloadPreview } from '@/modules/recurring-drafts/ui/payload-preview';
import { draftStatusShape } from '@/modules/recurring-drafts/ui/status-shape';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate } from '@/shared/dates/format';
import { businessDate } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import {
  endRecurringDraftAction,
  generateRecurringDraftAction,
  generateRecurringDraftHistoryAction,
  pauseRecurringDraftAction,
  resumeRecurringDraftAction,
} from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recurringDrafts' });
  return { title: t('detail.title') };
}

export default async function RecurringDraftDetailPage({
  params,
}: {
  params: Promise<{ locale: string; draftId: string }>;
}) {
  const { draftId } = await params;
  const [t, locale] = await Promise.all([
    getTranslations('recurringDrafts'),
    getLocale(),
  ]);

  const loaded = await withOrgContext(async (context) => {
    try {
      const detail = await getRecurringDraftDetail(context, draftId);
      return {
        ...detail,
        canManage: canManageDraftKind(context, detail.draft.draftKind),
      };
    } catch {
      return null;
    }
  });

  if (!loaded) notFound();

  const { draft, payload, runs, amountVersions, preview, canManage } = loaded;
  const isMonthlyExpense =
    draft.draftKind === 'expense' && draft.frequency === 'monthly';

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={draft.title}
        description={
          isMonthlyExpense ? t('detail.monthlyBusinessExpense') : t('detail.title')
        }
        meta={
          <StatusBadge shape={draftStatusShape(draft.status)} label={t(`status.${draft.status}`)} />
        }
        actions={
          <div className="flex max-w-full flex-wrap gap-3">
            {canManage && draft.status !== 'ended' ? (
              <Link href={`/recurring-drafts/${draft.id}/edit`} className={textNavLinkClassName}>
                {t('detail.edit')}
              </Link>
            ) : null}
            <Link href="/recurring-drafts" className={textNavLinkClassName}>
              {t('detail.backToList')}
            </Link>
          </div>
        }
      />

      <Alert tone="info">
        {draft.autoFinalizeExpense
          ? t('detail.autoFinalizeNote')
          : t('detail.draftOnlyNote')}
      </Alert>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('detail.schedule')}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.kind')}</dt>
            <dd>{t(`kind.${draft.draftKind}`)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.frequency')}</dt>
            <dd>
              {t(`frequency.${draft.frequency}`)}
              {draft.intervalCount > 1
                ? ` · ${t('detail.intervalLabel', { count: draft.intervalCount })}`
                : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.nextRunDate')}</dt>
            <dd dir="ltr">{formatBusinessDate(draft.nextRunDate, locale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.endDate')}</dt>
            <dd dir="ltr">
              {draft.endDate ? formatBusinessDate(draft.endDate, locale) : t('fields.none')}
            </dd>
          </div>
          {draft.draftKind === 'expense' ? (
            <>
              <div>
                <dt className="text-xs text-[var(--pf-text-secondary)]">
                  {t('fields.managerialCostKind')}
                </dt>
                <dd>
                  {draft.managerialCostKind
                    ? t(`managerialCostKind.${draft.managerialCostKind}`)
                    : t('fields.none')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--pf-text-secondary)]">
                  {t('fields.autoFinalizeExpense')}
                </dt>
                <dd>{draft.autoFinalizeExpense ? t('fields.yes') : t('fields.no')}</dd>
              </div>
            </>
          ) : null}
          <div>
            <dt className="text-xs text-[var(--pf-text-secondary)]">{t('detail.lastGenerated')}</dt>
            <dd>
              {draft.lastGeneratedAt
                ? new Date(draft.lastGeneratedAt).toLocaleString(locale)
                : t('detail.neverGenerated')}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('detail.payload')}</h2>
        <PayloadPreview payload={payload} preview={preview} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('detail.amountHistory')}</h2>
        {amountVersions.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noAmountHistory')}</p>
        ) : (
          <ResponsiveTable
            items={amountVersions}
            getRowKey={(version) => version.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fields.amount')}</TableHead>
                      <TableHead>{t('fields.validFrom')}</TableHead>
                      <TableHead>{t('fields.validTo')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...amountVersions].reverse().map((version) => (
                      <TableRow key={version.id}>
                        <TableCell dir="ltr">
                          {version.amount} {version.currency}
                        </TableCell>
                        <TableCell dir="ltr">
                          {formatBusinessDate(businessDate(version.validFrom), locale)}
                        </TableCell>
                        <TableCell dir="ltr">
                          {version.validTo
                            ? formatBusinessDate(businessDate(version.validTo), locale)
                            : t('fields.openEnded')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(version) => (
              <div className="rounded-lg border border-[var(--pf-border-default)] p-3">
                <p className="font-medium" dir="ltr">
                  {version.amount} {version.currency}
                </p>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                  {formatBusinessDate(businessDate(version.validFrom), locale)}
                  {' → '}
                  {version.validTo
                    ? formatBusinessDate(businessDate(version.validTo), locale)
                    : t('fields.openEnded')}
                </p>
              </div>
            )}
          />
        )}
      </section>

      {canManage ? (
        <RecurringDraftActions
          draftId={draft.id}
          status={draft.status}
          generateAction={generateRecurringDraftAction}
          pauseAction={pauseRecurringDraftAction}
          resumeAction={resumeRecurringDraftAction}
          endAction={endRecurringDraftAction}
        />
      ) : null}

      {canManage && isMonthlyExpense && draft.status === 'active' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-sm font-semibold">{t('historyBackfill.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('historyBackfill.body')}</p>
          <form action={generateRecurringDraftHistoryAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="draftId" value={draft.id} />
            <Field label={t('historyBackfill.from')} className="sm:w-40">
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="fromYearMonth"
                  placeholder="2026-01"
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  required
                  dir="ltr"
                />
              )}
            </Field>
            <Field label={t('historyBackfill.to')} className="sm:w-40">
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="toYearMonth"
                  placeholder="2026-06"
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  required
                  dir="ltr"
                />
              )}
            </Field>
            <Button type="submit" className="min-h-11">
              {t('historyBackfill.submit')}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('detail.history')}</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noHistory')}</p>
        ) : (
          <ResponsiveTable
            items={runs}
            getRowKey={(run) => run.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fields.runDate')}</TableHead>
                      <TableHead>{t('fields.occurrenceMonth')}</TableHead>
                      <TableHead>{t('fields.kind')}</TableHead>
                      <TableHead>{t('detail.openEntity')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell dir="ltr">{formatBusinessDate(run.runDate, locale)}</TableCell>
                        <TableCell dir="ltr">{run.occurrenceYearMonth ?? t('fields.none')}</TableCell>
                        <TableCell>{t(`kind.${run.generatedEntityType}`)}</TableCell>
                        <TableCell>
                          <Link
                            href={generatedEntityPath(run.generatedEntityType, run.generatedEntityId)}
                            className={textNavLinkClassName}
                          >
                            {t('detail.openEntity')}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(run) => (
              <Link
                href={generatedEntityPath(run.generatedEntityType, run.generatedEntityId)}
                className={pressableCardLinkClassName}
              >
                <p className="font-medium">{t(`kind.${run.generatedEntityType}`)}</p>
                <p className="mt-1 text-sm" dir="ltr">
                  {formatBusinessDate(run.runDate, locale)}
                  {run.occurrenceYearMonth ? ` · ${run.occurrenceYearMonth}` : ''}
                </p>
                <p className="mt-1 text-sm text-[var(--pf-text-brand)]">{t('detail.openEntity')}</p>
              </Link>
            )}
          />
        )}
      </section>
    </div>
  );
}
