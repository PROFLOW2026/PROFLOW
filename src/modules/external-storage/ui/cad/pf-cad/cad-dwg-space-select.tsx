'use client';

import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/shared/ui/cn';
import { cadSpaceSelectorAriaLabel, formatCadSpaceLabel } from './cad-space-label';

const triggerClass = cn(
  'h-10 min-h-10 w-full max-w-full sm:max-w-xs',
  'border border-white/30 bg-[#eef2f8] text-sm font-semibold text-[#0b1220]',
  'shadow-md hover:bg-white',
  'focus:border-[var(--pf-border-focus)] focus:outline-2 focus:outline-[var(--pf-focus-ring)]',
  '[&_svg]:text-[#0b1220]',
);

const contentClass = cn(
  'z-[80] max-h-[min(16rem,50vh)] border border-[#0b1220]/20 bg-[#eef2f8] text-[#0b1220] shadow-xl',
);

const itemClass = cn(
  'min-h-10 text-sm font-medium text-[#0b1220]',
  'data-[highlighted]:bg-[#0b1220]/12 data-[highlighted]:outline-none',
  'data-[state=checked]:bg-[#0b1220]/16 data-[state=checked]:font-semibold',
);

export function CadDwgSpaceSelect({
  spaces,
  value,
  onValueChange,
}: {
  spaces: readonly string[];
  value: string;
  onValueChange: (space: string) => void;
}) {
  const t = useTranslations('externalStorage.preview');
  if (spaces.length <= 1) {
    return null;
  }

  const resolved = value || spaces[0] || '';

  return (
    <Select value={resolved} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClass} aria-label={cadSpaceSelectorAriaLabel(t)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={contentClass} position="popper">
        {spaces.map((sp) => (
          <SelectItem key={sp} value={sp} className={itemClass}>
            {formatCadSpaceLabel(sp, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
