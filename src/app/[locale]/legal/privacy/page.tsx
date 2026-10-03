import type { Metadata } from 'next';
import { PrivacyHebrewContent } from '@/modules/legal/content/privacy-he';
import { LegalDocumentShell } from '@/modules/legal/ui/legal-document-shell';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'מדיניות פרטיות',
    description: 'מדיניות פרטיות ProjectFlow — גרסה ראשונה (עברית)',
    robots: { index: true, follow: true },
    alternates: { canonical: '/legal/privacy' },
  };
}

export default function PrivacyPage() {
  return (
    <LegalDocumentShell title="מדיניות פרטיות — ProjectFlow">
      <PrivacyHebrewContent />
    </LegalDocumentShell>
  );
}
