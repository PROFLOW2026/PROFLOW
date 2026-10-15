import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default async function OpenSourceNoticesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const noticesPath = path.join(process.cwd(), 'docs', 'OPEN_SOURCE_NOTICES.md');
  const body = readFileSync(noticesPath, 'utf8');

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/${locale}/settings`}>{tCommon('appName')}</Link>
        <span>/</span>
        <span>Open source</span>
      </div>
      <h1 className="text-xl font-semibold">Open source notices (CAD viewer)</h1>
      <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
        {body}
      </pre>
    </div>
  );
}
