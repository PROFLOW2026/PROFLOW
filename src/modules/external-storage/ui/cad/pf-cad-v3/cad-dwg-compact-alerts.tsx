'use client';

import { AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/shared/ui/cn';
import {
  formatCadDwgBannerDetail,
  formatCadDwgBannerShort,
  type CadDwgBanner,
} from './cad-ui-messages';

export function CadDwgCompactAlerts({
  banners,
  locale,
  className,
}: {
  banners: readonly CadDwgBanner[];
  locale: string;
  className?: string;
}) {
  if (banners.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {banners.map((banner) => {
        const short = formatCadDwgBannerShort(banner, locale);
        const detail = formatCadDwgBannerDetail(banner, locale);
        const needsDetail = detail.length > short.length + 8;

        if (!needsDetail) {
          return (
            <span
              key={banner.key}
              className="inline-flex max-w-[min(100%,11rem)] items-center gap-1 rounded-md border border-amber-500/40 bg-amber-950/75 px-1.5 py-0.5 text-[11px] leading-tight text-amber-100 sm:max-w-[14rem] sm:text-xs"
              title={detail}
            >
              <AlertTriangle className="size-3 shrink-0 text-amber-400" aria-hidden />
              <span className="truncate">{short}</span>
            </span>
          );
        }

        return (
          <Popover key={banner.key}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex max-w-[min(100%,11rem)] items-center gap-1 rounded-md border border-amber-500/40 bg-amber-950/75 px-1.5 py-0.5 text-[11px] leading-tight text-amber-100 hover:bg-amber-900/80 sm:max-w-[14rem] sm:text-xs"
                aria-label={detail}
              >
                <AlertTriangle className="size-3 shrink-0 text-amber-400" aria-hidden />
                <span className="truncate">{short}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="max-w-xs border-amber-500/30 bg-[#1a2332] p-3 text-xs leading-snug text-amber-50"
              align="start"
            >
              {detail}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
