'use client';

import { useTranslations } from 'next-intl';
import type { BrandingCompanySummary, BrandProfileSettingsView } from './_lib/types';

export function BrandLivePreview({
  brand,
  company,
  logoPreviewUrl,
}: {
  brand: Pick<
    BrandProfileSettingsView,
    | 'primaryColor'
    | 'secondaryColor'
    | 'headerLayout'
    | 'footerStyle'
    | 'showLogo'
    | 'showLegalName'
    | 'showDisplayName'
    | 'showRegistrationNumber'
    | 'showVatTaxId'
    | 'showAddress'
    | 'showPhone'
    | 'showEmail'
    | 'showWebsite'
    | 'footerCustomText'
  >;
  company: BrandingCompanySummary;
  logoPreviewUrl: string | null;
}) {
  const t = useTranslations('settings.branding');
  const displayName = company.displayName || company.legalName;
  const legalName = company.legalName || displayName;
  const address = [company.addressLine1, company.city, company.postalCode]
    .filter(Boolean)
    .join(', ');

  const headerClass =
    brand.headerLayout === 'centered'
      ? 'items-center text-center'
      : brand.headerLayout === 'logo_sides'
        ? 'flex-row items-start justify-between gap-3'
        : brand.headerLayout === 'minimal'
          ? 'items-start gap-2'
          : 'flex-row items-start justify-between gap-3';

  return (
    <div
      className="overflow-hidden rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] shadow-[var(--pf-shadow-sm)]"
      aria-label={t('preview.label')}
    >
      <div className="border-b border-[var(--pf-border-default)] px-3 py-2 text-xs font-semibold text-[var(--pf-text-secondary)]">
        {t('preview.title')}
      </div>
      <div className="bg-[var(--pf-neutral-50)] p-3 sm:p-4">
        <div className="mx-auto flex min-h-64 max-w-md flex-col bg-white text-slate-900 shadow-sm">
          <div
            className="h-1.5 w-full"
            style={{ backgroundColor: brand.primaryColor }}
            aria-hidden
          />
          <div className={`flex flex-col gap-2 p-4 ${headerClass}`}>
            {brand.showLogo && logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed/preview URL
              <img
                src={logoPreviewUrl}
                alt=""
                className="h-10 max-w-28 object-contain"
              />
            ) : brand.showLogo ? (
              <div
                className="flex h-10 w-28 items-center justify-center rounded border border-dashed text-[10px]"
                style={{ borderColor: brand.secondaryColor, color: brand.secondaryColor }}
              >
                {t('preview.logoPlaceholder')}
              </div>
            ) : null}

            <div className={brand.headerLayout === 'logo_sides' ? 'text-end' : 'text-start'}>
              {brand.showDisplayName ? (
                <p className="text-sm font-semibold" style={{ color: brand.primaryColor }}>
                  {displayName}
                </p>
              ) : null}
              {brand.showLegalName && legalName !== displayName ? (
                <p className="text-xs text-slate-600">{legalName}</p>
              ) : null}
              {brand.showRegistrationNumber && company.registrationNumber ? (
                <p className="text-[10px] text-slate-500" dir="ltr">
                  {company.registrationNumber}
                </p>
              ) : null}
              {brand.showVatTaxId && company.vatTaxId ? (
                <p className="text-[10px] text-slate-500" dir="ltr">
                  {company.vatTaxId}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2 px-4 pb-3">
            <p className="text-sm font-semibold" style={{ color: brand.secondaryColor }}>
              {t('preview.sampleTitle')}
            </p>
            <div className="h-2 w-3/4 rounded bg-slate-100" aria-hidden />
            <div className="h-2 w-full rounded bg-slate-100" aria-hidden />
            <div className="h-2 w-5/6 rounded bg-slate-100" aria-hidden />
            <div
              className="mt-2 inline-flex self-start rounded px-2 py-1 text-[10px] font-medium text-white"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {t('preview.accentChip')}
            </div>
          </div>

          <div
            className="mt-auto border-t px-4 py-3 text-[10px] text-slate-600"
            style={{ borderColor: `${brand.secondaryColor}33` }}
          >
            {brand.footerStyle === 'minimal' ? (
              <p>{brand.footerCustomText || displayName}</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {brand.footerCustomText ? <p>{brand.footerCustomText}</p> : null}
                {brand.showAddress && address ? <p>{address}</p> : null}
                {brand.showPhone && company.mainPhone ? (
                  <p dir="ltr">{company.mainPhone}</p>
                ) : null}
                {brand.showEmail && company.mainEmail ? (
                  <p dir="ltr">{company.mainEmail}</p>
                ) : null}
                {brand.showWebsite && company.website ? (
                  <p dir="ltr">{company.website}</p>
                ) : null}
                {brand.footerStyle === 'legal' ? (
                  <p className="mt-1 text-slate-400">{t('preview.legalFooterNote')}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--pf-text-muted)]">
          {t('preview.documentOnlyNote')}
        </p>
      </div>
    </div>
  );
}
