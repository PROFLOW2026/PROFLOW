'use client';

import { useState } from 'react';
import { RelatedMappingsSection, type MappingOption } from './related-mappings-section';

export interface BoqItemMappingHostProps {
  readonly projectId: string;
  readonly canManage: boolean;
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
    readonly workPackageId: string | null;
    readonly costCategoryId: string | null;
    readonly budgetLineId: string | null;
  }[];
  readonly workPackages: readonly MappingOption[];
  readonly costCategories: readonly MappingOption[];
  readonly budgetLines: readonly MappingOption[];
}

/** Item picker + related mappings section for the BOQ panel sibling area. */
export function BoqItemMappingHost({
  projectId,
  canManage,
  items,
  workPackages,
  costCategories,
  budgetLines,
}: BoqItemMappingHostProps) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  if (!selected) return null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <select
        value={selected.id}
        onChange={(e) => setSelectedId(e.target.value)}
        className="w-full max-w-lg rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <RelatedMappingsSection
        key={selected.id}
        projectId={projectId}
        nodeId={selected.id}
        workPackageId={selected.workPackageId}
        costCategoryId={selected.costCategoryId}
        budgetLineId={selected.budgetLineId}
        workPackages={workPackages}
        costCategories={costCategories}
        budgetLines={budgetLines}
        canManage={canManage}
      />
    </div>
  );
}
