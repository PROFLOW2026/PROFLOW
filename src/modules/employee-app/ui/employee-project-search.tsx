'use client';

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
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('projectSearchLabel')}</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('projectSearchPlaceholder')}
        className={employeeFilterInputClass}
      />
    </label>
  );
}
