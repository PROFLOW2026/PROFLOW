'use client';

import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE = '__none__';

export function QuickCaptureProjectSelect({
  projects,
  value,
  onValueChange,
  disabled = false,
}: {
  readonly projects: readonly { id: string; name: string }[];
  readonly value: string;
  readonly onValueChange: (projectId: string) => void;
  readonly disabled?: boolean;
}) {
  const t = useTranslations('quickCapture.form');

  return (
    <Field label={t('project')}>
      {(control) => (
        <Select
          value={value || NONE}
          onValueChange={(next) => onValueChange(next === NONE ? '' : next)}
          disabled={disabled}
        >
          <SelectTrigger id={control.id}>
            <SelectValue placeholder={t('projectNone')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('projectNone')}</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
