import type { Metadata } from 'next';
import { TermsHebrewContent } from '@/modules/legal/content/terms-he';
import { LegalDocumentShell } from '@/modules/legal/ui/legal-document-shell';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'תנאי שימוש',
    description: 'תנאי שימוש ProjectFlow — גרסה ראשונה (עברית)',
    robots: { index: true, follow: true },
    alternates: { canonical: '/legal/terms' },
  };
}

export default function TermsPage() {
  return (
    <LegalDocumentShell title="תנאי שימוש — ProjectFlow">
      <TermsHebrewContent />
    </LegalDocumentShell>
  );
}
