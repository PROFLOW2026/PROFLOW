import { notFound } from 'next/navigation';
import { TakeoffShell } from '@/modules/electrical-takeoff/ui/takeoff-shell';
import { DEMO_ANALYSIS_ID, DEMO_PROJECT_ID, PINS_ANALYSIS_ID, REAL7155_ANALYSIS_ID } from '@/modules/electrical-takeoff/ui/mock-api';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

/** Full takeoff UI on mock API. Hidden in production unless PF_DESIGN_SPECIMEN=1. */
interface DevPageProps {
  searchParams: Promise<{ analysisId?: string | string[]; fixture?: string | string[] }>;
}

export default async function ElectricalTakeoffDevPage({ searchParams }: DevPageProps) {
  if (process.env.NODE_ENV === 'production' && process.env.PF_DESIGN_SPECIMEN !== '1') {
    notFound();
  }

  const sp = await searchParams;
  const fixtureRaw = sp.fixture;
  const fixture = (Array.isArray(fixtureRaw) ? fixtureRaw[0] : fixtureRaw) ?? 'default';
  const useReal7155 = fixture === 'real7155';
  const usePins = fixture === 'pins';
  const raw = sp.analysisId;
  const defaultAnalysis = usePins ? PINS_ANALYSIS_ID : useReal7155 ? REAL7155_ANALYSIS_ID : DEMO_ANALYSIS_ID;
  const analysisId = (Array.isArray(raw) ? raw[0] : raw) ?? defaultAnalysis;

  return (
    <WithAppClientMessages extra={['takeoff']}>
      <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden bg-[var(--pf-bg-page)]">
        <header className="border-b border-[var(--pf-border-default)] px-4 py-2 text-sm text-[var(--pf-text-secondary)]">
          dev / electrical-takeoff (mock API) — project {DEMO_PROJECT_ID}
          {useReal7155 ? ' · fixture=real7155' : usePins ? ' · fixture=pins' : ''}
          <span className="mt-1 block text-xs">
            המסך הזה שומר תיקונים רק בזיכרון הדפדפן. רענון או יציאה מאפסים אותו בכוונה. ניתוח שנשמר מתוך פרויקט נכתב ליומן העריכות ונפתח מחדש עם אותן כמויות.
          </span>
        </header>
        <TakeoffShell
          projectId={DEMO_PROJECT_ID}
          analysisId={analysisId === 'list' ? undefined : analysisId}
          surface="main"
          useMockApi
          mockFixture={usePins ? 'pins' : useReal7155 ? 'real7155' : 'default'}
        />
      </div>
    </WithAppClientMessages>
  );
}