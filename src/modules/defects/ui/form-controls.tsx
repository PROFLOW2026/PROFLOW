'use client';

import type { QualityFormData } from '../application/query-defects';

function indent(depth: number) {
  return depth > 0 ? `${'\u00a0'.repeat(depth * 2)}\u2013 ` : '';
}

export function LocationSelect({
  name,
  options,
  defaultValue,
  allowEmpty,
  emptyLabel,
}: {
  readonly name: string;
  readonly options: QualityFormData['locations'];
  readonly defaultValue?: string | null;
  readonly allowEmpty?: boolean;
  readonly emptyLabel: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {options.map((row) => (
        <option key={row.id} value={row.id}>
          {indent(row.depth)}
          {row.code ? `${row.code} · ` : ''}
          {row.name}
        </option>
      ))}
    </select>
  );
}

export function AgreementSelect({
  name,
  options,
  defaultValue,
  allowEmpty,
  emptyLabel,
}: {
  readonly name: string;
  readonly options: QualityFormData['agreements'];
  readonly defaultValue?: string | null;
  readonly allowEmpty?: boolean;
  readonly emptyLabel: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {options.map((row) => (
        <option key={row.id} value={row.id}>
          {row.vendorName} · {row.title}
        </option>
      ))}
    </select>
  );
}

export function WorkLineSelect({
  name,
  options,
  agreementId,
  defaultValue,
  allowEmpty,
  emptyLabel,
}: {
  readonly name: string;
  readonly options: QualityFormData['workLines'];
  readonly agreementId?: string | null;
  readonly defaultValue?: string | null;
  readonly allowEmpty?: boolean;
  readonly emptyLabel: string;
}) {
  const filtered = agreementId ? options.filter((row) => row.agreementId === agreementId) : options;
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {filtered.map((row) => (
        <option key={row.id} value={row.id}>
          {row.code ? `${row.code} · ` : ''}
          {row.description}
        </option>
      ))}
    </select>
  );
}

export function PersonSelect({
  name,
  people,
  defaultValue,
  allowEmpty,
  emptyLabel,
}: {
  readonly name: string;
  readonly people: QualityFormData['people'];
  readonly defaultValue?: string | null;
  readonly allowEmpty?: boolean;
  readonly emptyLabel: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ''} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {people.map((row) => (
        <option key={row.userId} value={row.userId}>
          {row.name}
        </option>
      ))}
    </select>
  );
}
