import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/shared/ui/cn';
import type { ExpenseAttentionRequired } from '../domain/expense-attention';

export interface ExpenseAttentionIndicatorProps {
  readonly attention: ExpenseAttentionRequired;
  readonly compact?: boolean;
  readonly className?: string;
}

export function ExpenseAttentionIndicator({
  attention,
  compact = false,
  className,
}: ExpenseAttentionIndicatorProps) {
  const t = useTranslations('expenses');

  return (
    <Badge
      tone="warning"
      className={cn(
        'max-w-full whitespace-normal text-start leading-tight',
        compact ? 'px-1.5 py-0 text-[0.65rem]' : 'text-xs',
        className,
      )}
    >
      {compact ? t(`attention.compact.${attention}`) : t(`attention.required.${attention}`)}
    </Badge>
  );
}
