import type { ReactNode } from 'react';
import { Link } from '@/shared/i18n/navigation';
import { LegalFooterLinks } from './legal-footer-links';

export function LegalDocumentShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--pf-bg-page)] text-[var(--pf-text-primary)]">
      <header className="border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-semibold text-[var(--pf-text-brand)] no-underline">
            ProjectFlow
          </Link>
          <LegalFooterLinks className="text-sm" />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <article lang="he" dir="rtl" className="legal-document prose-pf">
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          {children}
        </article>
      </main>
      <footer className="border-t border-[var(--pf-border-default)] py-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <LegalFooterLinks className="text-sm text-[var(--pf-text-secondary)]" />
        </div>
      </footer>
    </div>
  );
}
