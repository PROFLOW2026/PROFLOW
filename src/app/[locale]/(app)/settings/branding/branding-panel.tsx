'use client';

import { useActionState, useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/shared/i18n/navigation';
import type { SettingsActionState } from '../actions';
import { BrandAssetField } from './brand-asset-field';
import { BrandLivePreview } from './brand-live-preview';
import {
  archiveBrandProfileAction,
  createBrandProfileAction,
  setDefaultBrandProfileAction,
  updateBrandProfileAction,
} from './actions';
import type {
  BrandingCompanySummary,
  BrandProfileSettingsView,
  FooterStylePreset,
  HeaderLayoutPreset,
} from './_lib/types';

const HEADER_LAYOUTS: readonly HeaderLayoutPreset[] = [
  'letterhead',
  'logo_sides',
  'centered',
  'minimal',
];
const FOOTER_STYLES: readonly FooterStylePreset[] = ['minimal', 'detailed', 'legal'];

function VisibilityToggle({
  name,
  label,
  defaultChecked,
  canEdit,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  canEdit: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        disabled={!canEdit}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}

export function BrandingSettingsPanel({
  brands,
  company,
  canEdit,
  initialBrandId,
}: {
  brands: readonly BrandProfileSettingsView[];
  company: BrandingCompanySummary;
  canEdit: boolean;
  initialBrandId: string | null;
}) {
  const t = useTranslations('settings.branding');
  const tCommon = useTranslations('common');
  const activeBrands = brands.filter((b) => b.status === 'active');
  const defaultId =
    initialBrandId ??
    activeBrands.find((b) => b.isDefault)?.id ??
    activeBrands[0]?.id ??
    null;
  const [selectedId, setSelectedId] = useState<string | null>(defaultId);
  const selected = useMemo(
    () => activeBrands.find((b) => b.id === selectedId) ?? activeBrands[0] ?? null,
    [activeBrands, selectedId],
  );

  const [primaryColor, setPrimaryColor] = useState(selected?.primaryColor ?? '#0F766E');
  const [secondaryColor, setSecondaryColor] = useState(selected?.secondaryColor ?? '#334155');
  const [headerLayout, setHeaderLayout] = useState<HeaderLayoutPreset>(
    selected?.headerLayout ?? 'letterhead',
  );
  const [footerStyle, setFooterStyle] = useState<FooterStylePreset>(
    selected?.footerStyle ?? 'detailed',
  );
  const [footerCustomText, setFooterCustomText] = useState(selected?.footerCustomText ?? '');
  const [showLogo, setShowLogo] = useState(selected?.showLogo ?? true);
  const [showLegalName, setShowLegalName] = useState(selected?.showLegalName ?? true);
  const [showDisplayName, setShowDisplayName] = useState(selected?.showDisplayName ?? true);
  const [showRegistrationNumber, setShowRegistrationNumber] = useState(
    selected?.showRegistrationNumber ?? true,
  );
  const [showVatTaxId, setShowVatTaxId] = useState(selected?.showVatTaxId ?? true);
  const [showAddress, setShowAddress] = useState(selected?.showAddress ?? true);
  const [showPhone, setShowPhone] = useState(selected?.showPhone ?? true);
  const [showEmail, setShowEmail] = useState(selected?.showEmail ?? true);
  const [showWebsite, setShowWebsite] = useState(selected?.showWebsite ?? true);

  const [saveState, saveAction, savePending] = useActionState(
    updateBrandProfileAction,
    {} as SettingsActionState,
  );
  const [createState, createAction, createPending] = useActionState(
    createBrandProfileAction,
    {} as SettingsActionState,
  );
  const [defaultState, defaultAction, defaultPending] = useActionState(
    setDefaultBrandProfileAction,
    {} as SettingsActionState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveBrandProfileAction,
    {} as SettingsActionState,
  );

  function selectBrand(id: string) {
    const next = activeBrands.find((b) => b.id === id);
    if (!next) return;
    setSelectedId(id);
    setPrimaryColor(next.primaryColor);
    setSecondaryColor(next.secondaryColor);
    setHeaderLayout(next.headerLayout);
    setFooterStyle(next.footerStyle);
    setFooterCustomText(next.footerCustomText ?? '');
    setShowLogo(next.showLogo);
    setShowLegalName(next.showLegalName);
    setShowDisplayName(next.showDisplayName);
    setShowRegistrationNumber(next.showRegistrationNumber);
    setShowVatTaxId(next.showVatTaxId);
    setShowAddress(next.showAddress);
    setShowPhone(next.showPhone);
    setShowEmail(next.showEmail);
    setShowWebsite(next.showWebsite);
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={ImageIcon}
          title={t('emptyBrands.title')}
          description={t('emptyBrands.description')}
          action={
            canEdit ? (
              <form action={createAction} className="flex flex-wrap items-end gap-2">
                <Field label={t('brands.newName')}>
                  {(props) => (
                    <Input {...props} name="name" defaultValue={t('brands.defaultName')} required />
                  )}
                </Field>
                <Button type="submit" loading={createPending}>
                  {t('brands.add')}
                </Button>
              </form>
            ) : undefined
          }
        />
        {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
      </div>
    );
  }

  const previewBrand = {
    primaryColor,
    secondaryColor,
    headerLayout,
    footerStyle,
    showLogo,
    showLegalName,
    showDisplayName,
    showRegistrationNumber,
    showVatTaxId,
    showAddress,
    showPhone,
    showEmail,
    showWebsite,
    footerCustomText: footerCustomText || null,
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t.rich('companyLink', {
          link: (chunks) => (
            <Link
              href="/settings/business"
              className="font-medium text-[var(--pf-action-primary)] underline-offset-2 hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      {!selected.hasLogoPrimary ? (
        <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] bg-[var(--pf-neutral-50)]">
          <EmptyState
            icon={ImageIcon}
            size="sm"
            title={t('emptyLogo.title')}
            description={t('emptyLogo.description')}
            action={
              canEdit ? (
                <Button type="button" size="sm" onClick={() => document.getElementById('brand-logo-primary')?.scrollIntoView({ behavior: 'smooth' })}>
                  {t('emptyLogo.cta')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('brands.title')}</h2>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('brands.advancedHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeBrands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onClick={() => selectBrand(brand.id)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                brand.id === selected.id
                  ? 'border-[var(--pf-action-primary)] bg-[var(--pf-teal-50)] text-[var(--pf-teal-800)]'
                  : 'border-[var(--pf-border-default)] hover:bg-[var(--pf-neutral-50)]'
              }`}
            >
              {brand.name}
              {brand.isDefault ? (
                <span className="ms-1 text-xs text-[var(--pf-text-muted)]">({t('brands.default')})</span>
              ) : null}
            </button>
          ))}
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-[var(--pf-border-default)] pt-3">
            {!selected.isDefault ? (
              <form action={defaultAction}>
                <input type="hidden" name="brandProfileId" value={selected.id} />
                <Button type="submit" variant="secondary" size="sm" loading={defaultPending}>
                  {t('brands.setDefault')}
                </Button>
              </form>
            ) : null}
            {!selected.isDefault ? (
              <form action={archiveAction}>
                <input type="hidden" name="brandProfileId" value={selected.id} />
                <Button type="submit" variant="ghost" size="sm" loading={archivePending}>
                  {t('brands.archive')}
                </Button>
              </form>
            ) : null}
            <form action={createAction} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <Field label={t('brands.newName')} className="min-w-40 flex-1">
                {(props) => <Input {...props} name="name" placeholder={t('brands.newPlaceholder')} required />}
              </Field>
              <Button type="submit" variant="secondary" size="sm" loading={createPending}>
                {t('brands.add')}
              </Button>
            </form>
          </div>
        ) : null}
        {defaultState.error || archiveState.error || createState.error ? (
          <Alert tone="danger">
            {defaultState.error ?? archiveState.error ?? createState.error}
          </Alert>
        ) : null}
        {defaultState.ok || createState.ok ? (
          <Alert tone="success">{t('saved')}</Alert>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <form action={saveAction} className="flex min-w-0 flex-col gap-6">
          <input type="hidden" name="brandProfileId" value={selected.id} />
          <input type="hidden" name="headerLayout" value={headerLayout} />
          <input type="hidden" name="footerStyle" value={footerStyle} />
          <input type="hidden" name="primaryColor" value={primaryColor} />
          <input type="hidden" name="secondaryColor" value={secondaryColor} />
          {showLogo ? <input type="hidden" name="showLogo" value="true" /> : null}
          {showLegalName ? <input type="hidden" name="showLegalName" value="true" /> : null}
          {showDisplayName ? <input type="hidden" name="showDisplayName" value="true" /> : null}
          {showRegistrationNumber ? (
            <input type="hidden" name="showRegistrationNumber" value="true" />
          ) : null}
          {showVatTaxId ? <input type="hidden" name="showVatTaxId" value="true" /> : null}
          {showAddress ? <input type="hidden" name="showAddress" value="true" /> : null}
          {showPhone ? <input type="hidden" name="showPhone" value="true" /> : null}
          {showEmail ? <input type="hidden" name="showEmail" value="true" /> : null}
          {showWebsite ? <input type="hidden" name="showWebsite" value="true" /> : null}

          {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
          {saveState.ok ? <Alert tone="success">{t('saved')}</Alert> : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.identity')}</h2>
            <Field label={t('fields.brandName')} required>
              {(props) => (
                <Input {...props} name="name" defaultValue={selected.name} disabled={!canEdit} required />
              )}
            </Field>
          </section>

          <section id="brand-logo-primary" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.logos')}</h2>
            <BrandAssetField
              brandProfileId={selected.id}
              assetKind="logo_primary"
              label={t('assets.logoPrimary')}
              description={t('assets.logoPrimaryHint')}
              previewUrl={selected.logoPrimaryUrl}
              canEdit={canEdit}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <BrandAssetField
                brandProfileId={selected.id}
                assetKind="logo_compact"
                label={t('assets.logoCompact')}
                previewUrl={selected.logoCompactUrl}
                canEdit={canEdit}
              />
              <BrandAssetField
                brandProfileId={selected.id}
                assetKind="logo_dark"
                label={t('assets.logoDark')}
                previewUrl={selected.logoDarkUrl}
                canEdit={canEdit}
              />
              <BrandAssetField
                brandProfileId={selected.id}
                assetKind="logo_light"
                label={t('assets.logoLight')}
                previewUrl={selected.logoLightUrl}
                canEdit={canEdit}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.colors')}</h2>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('colors.documentOnly')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('fields.primaryColor')}>
                {(props) => (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      disabled={!canEdit}
                      onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                      className="size-10 shrink-0 cursor-pointer rounded border border-[var(--pf-border-default)] bg-transparent p-0.5"
                      aria-label={t('fields.primaryColor')}
                    />
                    <Input
                      {...props}
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                      disabled={!canEdit}
                      dir="ltr"
                      maxLength={7}
                      className="font-mono uppercase"
                    />
                  </div>
                )}
              </Field>
              <Field label={t('fields.secondaryColor')}>
                {(props) => (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      disabled={!canEdit}
                      onChange={(e) => setSecondaryColor(e.target.value.toUpperCase())}
                      className="size-10 shrink-0 cursor-pointer rounded border border-[var(--pf-border-default)] bg-transparent p-0.5"
                      aria-label={t('fields.secondaryColor')}
                    />
                    <Input
                      {...props}
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value.toUpperCase())}
                      disabled={!canEdit}
                      dir="ltr"
                      maxLength={7}
                      className="font-mono uppercase"
                    />
                  </div>
                )}
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.layout')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('fields.headerLayout')}>
                {(props) => (
                  <Select
                    value={headerLayout}
                    onValueChange={(v) => setHeaderLayout(v as HeaderLayoutPreset)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HEADER_LAYOUTS.map((layout) => (
                        <SelectItem key={layout} value={layout}>
                          {t(`headerLayouts.${layout}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label={t('fields.footerStyle')}>
                {(props) => (
                  <Select
                    value={footerStyle}
                    onValueChange={(v) => setFooterStyle(v as FooterStylePreset)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOOTER_STYLES.map((style) => (
                        <SelectItem key={style} value={style}>
                          {t(`footerStyles.${style}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.visibility')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showLogo}
                  disabled={!canEdit}
                  onChange={(e) => setShowLogo(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showLogo')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showDisplayName}
                  disabled={!canEdit}
                  onChange={(e) => setShowDisplayName(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showDisplayName')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showLegalName}
                  disabled={!canEdit}
                  onChange={(e) => setShowLegalName(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showLegalName')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showRegistrationNumber}
                  disabled={!canEdit}
                  onChange={(e) => setShowRegistrationNumber(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showRegistrationNumber')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showVatTaxId}
                  disabled={!canEdit}
                  onChange={(e) => setShowVatTaxId(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showVatTaxId')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showAddress}
                  disabled={!canEdit}
                  onChange={(e) => setShowAddress(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showAddress')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPhone}
                  disabled={!canEdit}
                  onChange={(e) => setShowPhone(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showPhone')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showEmail}
                  disabled={!canEdit}
                  onChange={(e) => setShowEmail(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showEmail')}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showWebsite}
                  disabled={!canEdit}
                  onChange={(e) => setShowWebsite(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>{t('visibility.showWebsite')}</span>
              </label>
              <VisibilityToggle
                name="showPageNumbers"
                label={t('visibility.showPageNumbers')}
                defaultChecked={selected.showPageNumbers}
                canEdit={canEdit}
              />
              <VisibilityToggle
                name="showGeneratedDate"
                label={t('visibility.showGeneratedDate')}
                defaultChecked={selected.showGeneratedDate}
                canEdit={canEdit}
              />
              <VisibilityToggle
                name="showDocumentReference"
                label={t('visibility.showDocumentReference')}
                defaultChecked={selected.showDocumentReference}
                canEdit={canEdit}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.texts')}</h2>
            <Field label={t('fields.footerCustomText')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="footerCustomText"
                  value={footerCustomText}
                  onChange={(e) => setFooterCustomText(e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field label={t('fields.quoteTermsText')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="quoteTermsText"
                  defaultValue={selected.quoteTermsText ?? ''}
                  disabled={!canEdit}
                  rows={3}
                />
              )}
            </Field>
            <Field label={t('fields.quoteFooterText')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="quoteFooterText"
                  defaultValue={selected.quoteFooterText ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field label={t('fields.reportFooterText')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="reportFooterText"
                  defaultValue={selected.reportFooterText ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field
              label={t('fields.paymentInstructionsText')}
              optionalLabel={tCommon('labels.optional')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="paymentInstructionsText"
                  defaultValue={selected.paymentInstructionsText ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field label={t('fields.emailSignatureText')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="emailSignatureText"
                  defaultValue={selected.emailSignatureText ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field label={t('fields.poTermsText')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="poTermsText"
                  defaultValue={selected.poTermsText ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field label={t('fields.generalDocumentNote')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="generalDocumentNote"
                  defaultValue={selected.generalDocumentNote ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field label={t('fields.serviceReportNote')} optionalLabel={tCommon('labels.optional')}>
              {(props) => (
                <Textarea
                  {...props}
                  name="serviceReportNote"
                  defaultValue={selected.serviceReportNote ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
            <Field
              label={t('fields.reportDisclaimerText')}
              optionalLabel={tCommon('labels.optional')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="reportDisclaimerText"
                  defaultValue={selected.reportDisclaimerText ?? ''}
                  disabled={!canEdit}
                  rows={2}
                />
              )}
            </Field>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{t('sections.signature')}</h2>
            <Alert tone="warning">{t('signature.disclaimer')}</Alert>
            <BrandAssetField
              brandProfileId={selected.id}
              assetKind="signature"
              label={t('assets.signature')}
              description={t('assets.signatureHint')}
              previewUrl={selected.signatureUrl}
              canEdit={canEdit}
            />
            <BrandAssetField
              brandProfileId={selected.id}
              assetKind="stamp"
              label={t('assets.stamp')}
              description={t('assets.stampHint')}
              previewUrl={selected.stampUrl}
              canEdit={canEdit}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <VisibilityToggle
                name="allowSignatureOnQuotes"
                label={t('signature.allowOnQuotes')}
                defaultChecked={selected.allowSignatureOnQuotes}
                canEdit={canEdit}
              />
              <VisibilityToggle
                name="allowSignatureOnReports"
                label={t('signature.allowOnReports')}
                defaultChecked={selected.allowSignatureOnReports}
                canEdit={canEdit}
              />
              <VisibilityToggle
                name="allowStamp"
                label={t('signature.allowStamp')}
                defaultChecked={selected.allowStamp}
                canEdit={canEdit}
              />
              <VisibilityToggle
                name="includeSignatureByDefault"
                label={t('signature.includeByDefault')}
                defaultChecked={selected.includeSignatureByDefault}
                canEdit={canEdit}
              />
              <VisibilityToggle
                name="includeStampByDefault"
                label={t('signature.includeStampByDefault')}
                defaultChecked={selected.includeStampByDefault}
                canEdit={canEdit}
              />
            </div>
          </section>

          {canEdit ? (
            <div>
              <Button type="submit" loading={savePending}>
                {tCommon('actions.save')}
              </Button>
            </div>
          ) : null}
        </form>

        <aside className="xl:sticky xl:top-20">
          <BrandLivePreview
            brand={previewBrand}
            company={company}
            logoPreviewUrl={selected.logoPrimaryUrl}
          />
        </aside>
      </div>
    </div>
  );
}
