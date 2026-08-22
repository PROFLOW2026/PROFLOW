import { Suspense } from 'react';
import { getShellQuickCreatePrefs } from '@/shared/auth/session';
import { QuickCreate, type QuickCreateAction } from './quick-create';
import { buildQuickCreateActions } from './quick-create-actions';
import type { ShellContext } from '@/shared/auth/session';

function QuickCreateSkeleton() {
  return (
    <div
      className="size-11 shrink-0 rounded-full bg-[var(--pf-bg-muted)] lg:h-11 lg:w-auto lg:min-w-[5rem] lg:rounded-md"
      aria-hidden
    />
  );
}

async function QuickCreateInner({ shellCore }: { shellCore: ShellContext }) {
  const prefs = await getShellQuickCreatePrefs();
  const workMix = prefs?.workMix ?? shellCore.workMix ?? 'projects';
  const actions: QuickCreateAction[] = buildQuickCreateActions(
    shellCore.permissions,
    shellCore.modules,
    workMix,
    prefs?.quickCreateEmphasis ?? null,
    shellCore.suggestedDefaults ?? null,
    shellCore.persona,
  );
  return <QuickCreate actions={actions} />;
}

/** Quick Create emphasis/defaults load in a separate Suspense island — not on nav critical path. */
export function QuickCreateDeferred({ shellCore }: { shellCore: ShellContext }) {
  return (
    <Suspense fallback={<QuickCreateSkeleton />}>
      <QuickCreateInner shellCore={shellCore} />
    </Suspense>
  );
}
