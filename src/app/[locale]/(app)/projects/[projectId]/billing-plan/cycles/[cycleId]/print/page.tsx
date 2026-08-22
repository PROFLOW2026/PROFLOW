import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { resolveDocumentBrand } from '@/modules/branding';
import {
  buildBrandedDocumentStyles,
  buildHtmlLetterhead,
} from '@/modules/reports/application/branded-document-shell';
import { getBillingCycleDetail } from '@/modules/billing-plan';
import { withOrgContext } from '@/shared/auth/session';
import { formatMoney } from '@/shared/money/format';
import { money } from '@/shared/money';
import { localeDirection } from '@/shared/i18n/config';

interface PrintPageProps {
  params: Promise<{ locale: string; projectId: string; cycleId: string }>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function BillingCyclePrintPage({ params }: PrintPageProps) {
  const { projectId, cycleId, locale: localeParam } = await params;
  const locale = await getLocale();
  const t = await getTranslations('billingPlan');
  const dir = localeDirection(localeParam || locale);

  const { detail, brand } = await withOrgContext(async (context) => {
    const cycleDetail = await getBillingCycleDetail(context, { cycleId });
    if (cycleDetail.cycle.projectId !== projectId) {
      return { detail: null, brand: null };
    }
    const resolved = await resolveDocumentBrand(context, {
      projectId,
      locale: localeParam || locale,
      dir,
    });
    return { detail: cycleDetail, brand: resolved.context };
  });

  if (!detail) notFound();

  const styles = `${buildBrandedDocumentStyles(brand)}
    .toolbar {
      display: flex;
      gap: 0.75rem;
      justify-content: flex-end;
      margin-bottom: 1rem;
    }
    .toolbar button {
      font: inherit;
      padding: 0.5rem 1rem;
      cursor: pointer;
      border: 1px solid #ccc;
      background: #fff;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.35rem 1rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    .totals { margin-top: 1rem; font-weight: 600; }
    .note { margin-top: 1.25rem; font-size: 0.85rem; color: #444; }
  `;

  const letterheadHtml = brand
    ? buildHtmlLetterhead(brand, { escapeHtml })
    : '';

  return (
    <div dir={dir} className="bg-white text-black">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="toolbar">
        <button type="button">{t('print.printButton')}</button>
      </div>
      <PrintTrigger />
      <article className="doc-sheet">
        {letterheadHtml ? (
          <div dangerouslySetInnerHTML={{ __html: letterheadHtml }} />
        ) : null}
        <h1>{t('print.documentTitle')}</h1>
        <div className="meta-grid">
          <div>
            <strong>{t('print.cycleNumber')}:</strong> {detail.cycle.cycleNumber}
          </div>
          <div>
            <strong>{t('print.accountDate')}:</strong> {detail.cycle.accountDate}
          </div>
          <div>
            <strong>{t('print.planName')}:</strong> {detail.plan.name}
          </div>
          <div>
            <strong>{t('fields.cycleTitle')}:</strong> {detail.cycle.title}
          </div>
          {detail.cycle.periodStart || detail.cycle.periodEnd ? (
            <div>
              <strong>{t('print.period')}:</strong>{' '}
              {[detail.cycle.periodStart, detail.cycle.periodEnd].filter(Boolean).join(' – ')}
            </div>
          ) : null}
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('print.line')}</th>
              <th>{t('print.prior')}</th>
              <th>{t('print.current')}</th>
              <th>{t('print.cumulative')}</th>
              <th>{t('print.remaining')}</th>
              <th>{t('print.retention')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => {
              const label = line.label.startsWith('billingPlan.')
                ? t(line.label.slice('billingPlan.'.length) as never)
                : line.label;
              return (
                <tr key={line.id}>
                  <td>{label}</td>
                  <td dir="ltr">
                    {formatMoney(money(line.priorAmount, detail.plan.currency), locale)}
                  </td>
                  <td dir="ltr">
                    {formatMoney(
                      money(line.currentAmount ?? '0', detail.plan.currency),
                      locale,
                    )}
                  </td>
                  <td dir="ltr">
                    {formatMoney(money(line.cumulativeAmount, detail.plan.currency), locale)}
                  </td>
                  <td dir="ltr">
                    {formatMoney(money(line.remainingAmount, detail.plan.currency), locale)}
                  </td>
                  <td dir="ltr">
                    {formatMoney(money(line.retentionAmount, detail.plan.currency), locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="totals">
          <div>
            {t('print.total')}:{' '}
            {formatMoney(money(detail.totals.currentAmount, detail.plan.currency), locale)}
          </div>
          <div>
            {t('print.retention')}:{' '}
            {formatMoney(money(detail.totals.retentionAmount, detail.plan.currency), locale)}
          </div>
        </div>
        <p className="note">{t('print.integrityNote')}</p>
      </article>
    </div>
  );
}

/** Minimal client print button without a separate file. */
function PrintTrigger() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.querySelector('.toolbar button')?.addEventListener('click',()=>window.print());`,
      }}
    />
  );
}
