'use client';

import { useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableClassName } from '@/components/ui/pressable';
import { setExperienceShowHiddenProjectTabsAction } from '@/modules/tenancy/application/experience-project-tabs-preference';

interface ProjectExperienceHiddenTabsControlProps {
  readonly hiddenCount: number;
  readonly showHidden: boolean;
  readonly showLabel: string;
  readonly hideLabel: string;
}

/**
 * Persists "show optional hidden tabs" per browser (cookie), not an obscure URL flag.
 */
export function ProjectExperienceHiddenTabsControl({
  hiddenCount,
  showHidden,
  showLabel,
  hideLabel,
}: ProjectExperienceHiddenTabsControlProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (hiddenCount <= 0) return null;

  function toggle(next: boolean) {
    startTransition(async () => {
      await setExperienceShowHiddenProjectTabsAction(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => toggle(!showHidden)}
      className={cn(
        'ms-auto shrink-0 rounded-md px-3 py-1.5 text-xs underline-offset-2 hover:underline disabled:opacity-60',
        pressableClassName,
        showHidden
          ? 'text-[var(--pf-text-secondary)]'
          : 'text-[var(--pf-text-brand)]',
      )}
    >
      {showHidden ? hideLabel : showLabel}
    </button>
  );
}
