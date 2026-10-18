'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { employeeFilterInputClass } from './employee-surface-styles';

interface ProjectRow {
  readonly id: string;
  readonly displayName: string;
}

export function EmployeeProjectSearch({ projects }: { projects: readonly ProjectRow[] }) {
  const t = useTranslations('employeeApp.lists');
  const [query, setQuery] = useState('');

  const normalized = query.trim().toLowerCase();

  useEffect(() => {
    document.querySelectorAll('[data-project-row]').forEach((node) => {
      const search = node.getAttribute('data-search') ?? '';
      const visible = !normalized || search.includes(normalized);
      (node as HTMLElement).style.display = visible ? '' : 'none';
    });
  }, [normalized, projects.length]);

  return (
    <label className="relative block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--pf-text-secondary)]">
        {t('projectSearchLabel')}
      </span>
      <span className="relative block">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pf-text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('projectSearchPlaceholder')}
          className={`${employeeFilterInputClass} ps-9`}
        />
      </span>
    </label>
  );
}
