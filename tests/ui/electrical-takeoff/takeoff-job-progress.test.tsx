import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TakeoffClientApi, TakeoffJobDto } from '@/modules/electrical-takeoff/domain/contracts';
import { TakeoffApiProvider } from '@/modules/electrical-takeoff/ui/api-provider';
import { TakeoffJobProgress } from '@/modules/electrical-takeoff/ui/takeoff-job-progress';
import { JOB_STALL_AT_100_MS } from '@/modules/electrical-takeoff/ui/takeoff-job-progress-logic';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (values) return `${key}:${JSON.stringify(values)}`;
    return key;
  },
}));

function makeApi(
  sequence: () => TakeoffJobDto | Promise<TakeoffJobDto>,
  cancelJob = vi.fn(),
): TakeoffClientApi {
  return {
    listAnalyses: vi.fn(),
    createAnalysis: vi.fn(),
    getAnalysisView: vi.fn(),
    beginFileUpload: vi.fn(),
    startAnalysis: vi.fn(),
    getJobProgress: vi.fn(async () => sequence()),
    cancelJob,
    applyEdits: vi.fn(),
    approveAnalysis: vi.fn(),
    reopenAnalysis: vi.fn(),
    listLibrary: vi.fn(),
    deleteLibraryEntry: vi.fn(),
    listRuleSets: vi.fn(),
    saveRuleSet: vi.fn(),
    setAnalysisRuleSet: vi.fn(),
    listCatalog: vi.fn(),
    saveCatalogType: vi.fn(),
    requestExport: vi.fn(),
    getTakeoffInputCapabilities: vi.fn(),
    linkCloudFile: vi.fn(),
    purgeEphemeralTakeoff: vi.fn(),
  };
}

describe('TakeoffJobProgress', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  function renderProgress(api: TakeoffClientApi) {
    const onDone = vi.fn();
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(
      <TakeoffApiProvider api={api}>
        <TakeoffJobProgress jobId="job-1" onDone={onDone} onRetry={onRetry} onClose={onClose} />
      </TakeoffApiProvider>,
    );
    return { onDone, onRetry, onClose };
  }

  it('stays on running at 100% until succeeded', async () => {
    const dto = (): TakeoffJobDto => ({
      id: 'job-1',
      status: 'running',
      stage: 'upload',
      percent: 100,
      message: null,
      startedAtIso: null,
      finishedAtIso: null,
      error: null,
    });
    const { onDone } = renderProgress(makeApi(dto));
    await waitFor(() => expect(screen.getByText('jobStage.upload')).toBeInTheDocument());
    expect(screen.getByText('progress.cancel')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onDone when status succeeded', async () => {
    const { onDone } = renderProgress(
      makeApi(() => ({
        id: 'job-1',
        status: 'succeeded',
        stage: 'done',
        percent: 100,
        message: null,
        startedAtIso: null,
        finishedAtIso: new Date().toISOString(),
        error: null,
      })),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('shows failed panel with retry and close', async () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(
      <TakeoffApiProvider
        api={makeApi(() => ({
          id: 'job-1',
          status: 'failed',
          stage: 'done',
          percent: 100,
          message: null,
          startedAtIso: null,
          finishedAtIso: new Date().toISOString(),
          error: 'takeoff.ingest_failed',
        }))}
      >
        <TakeoffJobProgress jobId="job-1" onDone={vi.fn()} onRetry={onRetry} onClose={onClose} />
      </TakeoffApiProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('takeoff-job-failed')).toBeInTheDocument());
    screen.getByTestId('takeoff-job-retry').click();
    screen.getByTestId('takeoff-job-close').click();
    expect(onRetry).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows stall message after 120s at 100%', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    let calls = 0;
    renderProgress(
      makeApi(() => {
        calls += 1;
        return {
          id: 'job-1',
          status: 'running',
          stage: 'done',
          percent: 100,
          message: null,
          startedAtIso: null,
          finishedAtIso: null,
          error: null,
        };
      }),
    );
    await vi.waitFor(() => expect(calls).toBeGreaterThan(0));
    vi.advanceTimersByTime(JOB_STALL_AT_100_MS + 6_000);
    await vi.waitFor(() => expect(screen.getByText('progress.stalledTitle')).toBeInTheDocument());
    vi.useRealTimers();
  });
});