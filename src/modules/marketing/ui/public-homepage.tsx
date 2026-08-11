import dynamic from 'next/dynamic';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { LandingHeader } from './landing-header';
import { ScreenshotFrame } from './screenshot-frame';

const ProductTour = dynamic(() => import('./product-tour').then((mod) => mod.ProductTour), {
  loading: () => <div className="min-h-64" aria-hidden />,
});

const LandingInstallBlock = dynamic(
  () => import('./landing-install-block').then((mod) => mod.LandingInstallBlock),
  { loading: () => <div className="mt-6 min-h-24" aria-hidden /> },
);

const LandingFaq = dynamic(() => import('./landing-faq').then((mod) => mod.LandingFaq), {
  loading: () => <div className="min-h-48" aria-hidden />,
});

/**
 * Public ProjectFlow homepage for signed-out visitors.
 * Authenticated users never reach this tree — locale root branches first.
 */
export async function PublicHomepage() {
  const t = await getTranslations('marketing');

  const questions = t.raw('questions.items') as string[];
  const problemPoints = t.raw('problem.points') as Array<{ title: string; body: string }>;
  const steps = t.raw('howItWorks.steps') as string[];
  const financialItems = t.raw('financial.items') as string[];
  const principles = t.raw('financial.principles') as Array<{ left: string; right: string }>;
  const capabilityBlocks = t.raw('capabilities.blocks') as Array<{ title: string; body: string }>;
  const commercialBlocks = t.raw('commercial.blocks') as Array<{ title: string; body: string }>;
  const advancedModules = t.raw('advanced.modules') as string[];
  const audienceChips = t.raw('audience.chips') as string[];

  return (
    <div className="min-h-dvh min-w-0 max-w-full bg-[var(--pf-bg-page)]" data-pf-public-homepage>
      <LandingHeader />

      <main id="main">
        {/* S01 Hero */}
        <section
          id="hero"
          className="relative overflow-hidden bg-[linear-gradient(180deg,var(--pf-bg-surface)_0%,var(--pf-bg-page)_100%)]"
          aria-labelledby="landing-hero-heading"
          data-pf-landing-section="hero"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_85%_20%,color-mix(in_srgb,var(--pf-teal-600)_12%,transparent),transparent_55%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[0.95fr_1.15fr] lg:items-center lg:gap-12 lg:px-8 lg:py-16">
            <div className="min-w-0">
              <p className="mb-3 text-2xl font-bold tracking-tight text-[var(--pf-text-brand)] sm:text-[1.75rem]">
                <span dir="ltr">{t('hero.brand')}</span>
              </p>
              <h1
                id="landing-hero-heading"
                className="max-w-[14em] text-[1.85rem] font-bold leading-tight tracking-tight text-[var(--pf-text-primary)] sm:text-4xl lg:text-[2.65rem]"
              >
                {t('hero.title')}
              </h1>
              <p className="mt-4 max-w-[36em] text-base leading-relaxed text-[var(--pf-text-secondary)] sm:text-lg">
                {t('hero.subtitle')}
              </p>
              <div className="mt-6 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="min-h-12 w-full sm:w-auto">
                  <Link href="/sign-in">{t('hero.primaryCta')}</Link>
                </Button>
                <Button asChild variant="secondary" size="lg" className="min-h-12 w-full sm:w-auto">
                  <a href="#how-it-works">{t('hero.secondaryCta')}</a>
                </Button>
              </div>
            </div>

            <div className="min-w-0">
              <div className="hidden lg:block">
                <ScreenshotFrame
                  src="/marketing/screenshots/pf-landing-sc-02-desktop.svg"
                  alt={t('hero.shotAlt')}
                  caption={t('hero.shotCaption')}
                  priority
                />
              </div>
              <div className="lg:hidden">
                <ScreenshotFrame
                  src="/marketing/screenshots/pf-landing-sc-08-mobile.svg"
                  alt={t('hero.mobileShotAlt')}
                  caption={t('hero.mobileShotCaption')}
                  mobile
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* S02 Questions + Problem */}
        <section
          id="owner-questions"
          className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
          aria-labelledby="landing-questions-heading"
          data-pf-landing-section="questions-problem"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-questions-heading"
              className="max-w-[20em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
            >
              {t('questions.title')}
            </h2>
            <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">
              {questions.map((question) => (
                <li
                  key={question}
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-4 py-3 text-[0.975rem] font-medium text-[var(--pf-text-primary)]"
                >
                  {question}
                </li>
              ))}
            </ul>

            <h2 className="mt-12 max-w-[18em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]">
              {t('problem.title')}
            </h2>
            <ul className="mt-6 grid list-none gap-3 p-0 md:grid-cols-3">
              {problemPoints.map((point) => (
                <li
                  key={point.title}
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] p-4"
                >
                  <h3 className="text-base font-bold text-[var(--pf-text-primary)]">{point.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pf-text-secondary)]">{point.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* S03 How it works */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-page)]"
          aria-labelledby="landing-how-heading"
          data-pf-landing-section="how-it-works"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-how-heading"
              className="max-w-[20em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
            >
              {t('howItWorks.title')}
            </h2>
            <ol className="mt-8 flex list-none flex-col gap-0 p-0 md:flex-row md:flex-wrap md:items-center md:gap-x-1 md:gap-y-3">
              {steps.map((step, index) => (
                <li key={step} className="flex flex-col md:flex-row md:items-center">
                  <div className="flex items-center gap-3 py-2 md:py-1">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-action-primary)] text-sm font-bold text-[var(--pf-action-primary-fg)]">
                      {index + 1}
                    </span>
                    <span className="text-base font-semibold text-[var(--pf-text-primary)]">{step}</span>
                  </div>
                  {index < steps.length - 1 ? (
                    <span
                      className="ms-3 flex h-4 w-8 items-center justify-center text-[var(--pf-text-brand)] md:ms-0 md:w-6"
                      aria-hidden
                    >
                      <span className="md:hidden">↓</span>
                      <span className="hidden md:inline-block rtl:-scale-x-100">→</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-[40em] text-[0.975rem] text-[var(--pf-text-muted)]">{t('howItWorks.support')}</p>
          </div>
        </section>

        {/* S04 Capabilities */}
        <section
          id="capabilities"
          className="scroll-mt-20 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
          aria-labelledby="landing-capabilities-heading"
          data-pf-landing-section="capabilities"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-capabilities-heading"
              className="max-w-[20em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
            >
              {t('capabilities.title')}
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {capabilityBlocks.map((block) => (
                <article
                  key={block.title}
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] p-4"
                >
                  <h3 className="text-base font-bold text-[var(--pf-text-brand)]">{block.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pf-text-secondary)]">{block.body}</p>
                </article>
              ))}
            </div>
            <div className="mt-8">
              <ScreenshotFrame
                src="/marketing/screenshots/pf-landing-sc-04-desktop.svg"
                alt={t('capabilities.shotAlt')}
                caption={t('capabilities.shotCaption')}
                className="mx-auto max-w-4xl"
              />
            </div>
          </div>
        </section>

        {/* S05 Financial control */}
        <section
          id="financial-control"
          className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-page)]"
          aria-labelledby="landing-financial-heading"
          data-pf-landing-section="financial"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
              <div className="min-w-0">
                <h2
                  id="landing-financial-heading"
                  className="max-w-[18em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
                >
                  {t('financial.title')}
                </h2>
                <p className="mt-3 max-w-[36em] text-[0.975rem] leading-relaxed text-[var(--pf-text-secondary)]">
                  {t('financial.lead')}
                </p>
                <ul className="mt-5 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                  {financialItems.map((item) => (
                    <li
                      key={item}
                      className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm font-medium text-[var(--pf-text-primary)]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <ScreenshotFrame
                src="/marketing/screenshots/pf-landing-sc-02-desktop.svg"
                alt={t('financial.shotAlt')}
                caption={t('financial.shotCaption')}
              />
            </div>

            <div
              className="mt-10 grid gap-3 rounded-xl bg-[linear-gradient(145deg,var(--pf-teal-900),var(--pf-teal-700))] p-4 sm:grid-cols-2 lg:grid-cols-4 lg:p-5"
              role="group"
              aria-label={t('financial.title')}
            >
              {principles.map((principle) => (
                <div
                  key={`${principle.left}-${principle.right}`}
                  className="flex items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-3 text-center text-sm font-bold text-white"
                >
                  <span>{principle.left}</span>
                  <span className="font-medium opacity-70" aria-hidden>
                    {t('financial.neq')}
                  </span>
                  <span>{principle.right}</span>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Button asChild size="lg" className="min-h-12 w-full sm:w-auto">
                <Link href="/sign-in">{t('financial.cta')}</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* S06 Changes / billing */}
        <section
          id="changes-billing"
          className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
          aria-labelledby="landing-commercial-heading"
          data-pf-landing-section="commercial"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-commercial-heading"
              className="max-w-[22em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
            >
              {t('commercial.title')}
            </h2>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {commercialBlocks.map((block) => (
                <article
                  key={block.title}
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] p-4"
                >
                  <h3 className="text-base font-bold text-[var(--pf-text-brand)]">{block.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--pf-text-secondary)]">{block.body}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <ScreenshotFrame
                src="/marketing/screenshots/pf-landing-sc-05-desktop.svg"
                alt={t('commercial.changesAlt')}
                caption={t('commercial.changesCaption')}
              />
              <ScreenshotFrame
                src="/marketing/screenshots/pf-landing-sc-06-desktop.svg"
                alt={t('commercial.billingAlt')}
                caption={t('commercial.billingCaption')}
              />
            </div>
          </div>
        </section>

        {/* S07 Product tour */}
        <section
          id="product-tour"
          className="scroll-mt-20 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-page)]"
          aria-labelledby="landing-tour-heading"
          data-pf-landing-section="product-tour"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-tour-heading"
              className="max-w-[18em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
            >
              {t('tour.title')}
            </h2>
            <div className="mt-6 min-w-0">
              <ProductTour />
            </div>
            <div className="mt-8">
              <Button asChild size="lg" className="min-h-12 w-full sm:w-auto">
                <Link href="/sign-in">{t('tour.cta')}</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* S08 Advanced */}
        <section
          id="advanced"
          className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
          aria-labelledby="landing-advanced-heading"
          data-pf-landing-section="advanced"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
            <h2
              id="landing-advanced-heading"
              className="max-w-[18em] text-xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-2xl"
            >
              {t('advanced.title')}
            </h2>
            <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('advanced.support')}</p>
            <ul className="mt-5 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {advancedModules.map((moduleName) => (
                <li
                  key={moduleName}
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 py-3 text-sm font-medium text-[var(--pf-text-primary)]"
                >
                  {moduleName}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* S09 Mobile + install */}
        <section
          id="mobile-app"
          className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-page)]"
          aria-labelledby="landing-mobile-heading"
          data-pf-landing-section="mobile"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:items-center lg:px-8">
            <div className="min-w-0">
              <h2
                id="landing-mobile-heading"
                className="max-w-[18em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
              >
                {t('mobile.title')}
              </h2>
              <p className="mt-3 max-w-[36em] text-[0.975rem] leading-relaxed text-[var(--pf-text-secondary)]">
                {t('mobile.body')}
              </p>
              <LandingInstallBlock />
            </div>
            <ScreenshotFrame
              src="/marketing/screenshots/pf-landing-sc-08-mobile.svg"
              alt={t('mobile.shotAlt')}
              caption={t('mobile.shotCaption')}
              mobile
            />
          </div>
        </section>

        {/* S10 Audience + team */}
        <section
          id="audience"
          className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
          aria-labelledby="landing-audience-heading"
          data-pf-landing-section="audience"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-audience-heading"
              className="max-w-[20em] text-2xl font-bold tracking-tight text-[var(--pf-text-primary)] sm:text-[1.75rem]"
            >
              {t('audience.title')}
            </h2>
            <ul className="mt-5 flex list-none flex-wrap gap-2 p-0">
              {audienceChips.map((chip) => (
                <li
                  key={chip}
                  className="inline-flex min-h-10 items-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 py-2 text-sm font-medium text-[var(--pf-text-primary)]"
                >
                  {chip}
                </li>
              ))}
            </ul>

            <div className="mx-auto mt-12 max-w-2xl text-center">
              <h3 className="text-xl font-bold tracking-tight text-[var(--pf-text-primary)]">
                {t('audience.teamTitle')}
              </h3>
              <p className="mt-3 text-[0.975rem] leading-relaxed text-[var(--pf-text-secondary)]">
                {t('audience.teamBody')}
              </p>
            </div>
          </div>
        </section>

        {/* S11 FAQ */}
        <section
          id="faq"
          className="scroll-mt-20 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-page)]"
          aria-labelledby="landing-faq-heading"
          data-pf-landing-section="faq"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
            <LandingFaq />
          </div>
        </section>

        {/* S12 Final CTA */}
        <section
          id="final-cta"
          className="bg-[linear-gradient(145deg,var(--pf-teal-900),var(--pf-teal-700))]"
          aria-labelledby="landing-final-heading"
          data-pf-landing-section="final-cta"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-16 lg:px-8">
            <h2
              id="landing-final-heading"
              className="text-2xl font-bold tracking-tight text-white sm:text-[1.85rem]"
            >
              {t('finalCta.title')}
            </h2>
            <p className="mx-auto mt-3 max-w-[36em] text-[0.975rem] leading-relaxed text-white/90">
              {t('finalCta.body')}
            </p>
            <div className="mt-8 flex justify-center">
              <Button
                asChild
                size="lg"
                className="min-h-12 w-full border-white bg-white text-[var(--pf-teal-900)] hover:bg-[var(--pf-teal-50)] sm:w-auto"
              >
                <Link href="/sign-in">{t('finalCta.cta')}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] py-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <span className="text-sm font-semibold text-[var(--pf-text-primary)]" dir="ltr">
            {t('footer.note')}
          </span>
        </div>
      </footer>
    </div>
  );
}
