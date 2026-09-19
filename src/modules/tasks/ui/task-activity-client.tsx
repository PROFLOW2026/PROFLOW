'use client';

/**
 * Client component: collapsible wrapper for the task activity feed.
 * Shows a compact slice initially, expands to full list on demand.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskActivityEventRow } from './task-activity';

interface ActivityExpandClientProps {
  allEvents: TaskActivityEventRow[];
  compactCount: number;
  showLessLabel: string;
  showAllLabel: string;
  renderRow: (event: TaskActivityEventRow) => React.ReactNode;
}

export function ActivityExpandClient({
  allEvents,
  compactCount,
  showLessLabel,
  showAllLabel,
  renderRow,
}: ActivityExpandClientProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? allEvents : allEvents.slice(0, compactCount);

  return (
    <div className="flex flex-col gap-2">
      <ol className="relative flex flex-col border-s border-[var(--pf-border-subtle)] ps-4">
        {visibleEvents.map(renderRow)}
      </ol>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((prev) => !prev)}
        className="self-start"
      >
        {expanded ? (
          <>
            <ChevronUp className="size-4" aria-hidden />
            {showLessLabel}
          </>
        ) : (
          <>
            <ChevronDown className="size-4" aria-hidden />
            {showAllLabel}
          </>
        )}
      </Button>
    </div>
  );
}
