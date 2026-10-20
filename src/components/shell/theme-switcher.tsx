'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableClassName } from '@/components/ui/pressable';
import { THEME_PREFERENCES, type ThemePreference } from '@/shared/theme/config';
import { useThemePreference } from '@/shared/theme/theme-context';
import { cn } from '@/shared/ui/cn';

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function ThemeOptionIcon({ mode }: { mode: ThemePreference }) {
  const Icon = ICONS[mode];
  return <Icon className="size-4 shrink-0" aria-hidden />;
}

function themeModeLabel(t: (key: 'light' | 'dark' | 'system') => string, mode: ThemePreference): string {
  switch (mode) {
    case 'light':
      return t('light');
    case 'dark':
      return t('dark');
    case 'system':
      return t('system');
  }
}

/** Desktop header control — hidden below `lg` per product spec. */
export function ThemeHeaderToggle({ className }: { className?: string }) {
  const t = useTranslations('appearance');
  const { preference, setPreference, pending } = useThemePreference();
  const ActiveIcon = ICONS[preference];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('switcher')}
        disabled={pending}
        className={cn(
          pressableClassName,
          'hidden min-h-9 min-w-9 items-center justify-center rounded-md p-2',
          'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
          'active:bg-[var(--pf-action-subtle-active)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
          'lg:inline-flex',
          className,
        )}
      >
        <ActiveIcon className="size-[1.125rem]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
        {THEME_PREFERENCES.map((mode) => (
          <DropdownMenuItem
            key={mode}
            disabled={pending}
            onSelect={() => {
              if (mode === preference) return;
              setPreference(mode);
            }}
          >
            <ThemeOptionIcon mode={mode} />
            <span className="min-w-0 flex-1 truncate">{themeModeLabel(t, mode)}</span>
            {mode === preference ? (
              <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Mobile user drawer section — shown only below `lg`. */
export function ThemeMenuSection() {
  const t = useTranslations('appearance');
  const { preference, setPreference, pending } = useThemePreference();

  return (
    <div className="contents lg:hidden">
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
      {THEME_PREFERENCES.map((mode) => (
        <DropdownMenuItem
          key={mode}
          disabled={pending}
          onSelect={() => {
            if (mode === preference) return;
            setPreference(mode);
          }}
        >
          <ThemeOptionIcon mode={mode} />
          <span className="min-w-0 flex-1 truncate">{themeModeLabel(t, mode)}</span>
          {mode === preference ? (
            <Check className="size-4 text-[var(--pf-text-brand)]" aria-hidden />
          ) : null}
        </DropdownMenuItem>
      ))}
    </div>
  );
}
