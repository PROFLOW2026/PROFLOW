import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { localeDirection } from '@/shared/i18n/config';
import { renderWithIntl } from './test-utils';

describe('RTL primitives', () => {
  it('keeps Hebrew page direction RTL and English LTR at the config layer', () => {
    expect(localeDirection('he-IL')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
  });

  it('marks email inputs as LTR islands inside Hebrew forms', () => {
    renderWithIntl(
      <Field label="אימייל">
        {(control) => <Input {...control} name="email" type="email" />}
      </Field>,
      { locale: 'he-IL' },
    );

    expect(screen.getByLabelText('אימייל')).toHaveAttribute('dir', 'ltr');
  });

  it('does not force plain text inputs to LTR so Hebrew aligns naturally', () => {
    renderWithIntl(
      <Field label="שם">
        {(control) => <Input {...control} name="name" />}
      </Field>,
      { locale: 'he-IL' },
    );

    expect(screen.getByLabelText('שם')).not.toHaveAttribute('dir', 'ltr');
  });

  it('keeps textarea start-aligned for Hebrew content', () => {
    const { container } = renderWithIntl(
      <Textarea name="notes" aria-label="הערות" defaultValue="בדיקה" />,
      { locale: 'he-IL' },
    );
    expect(container.querySelector('textarea')?.className).toContain('text-start');
  });

  it('aligns numeric table columns to the logical end', () => {
    renderWithIntl(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם</TableHead>
            <TableHead numeric>סכום</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>פרויקט</TableCell>
            <TableCell numeric>100</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
      { locale: 'he-IL' },
    );

    expect(screen.getByText('סכום').className).toContain('text-end');
    expect(screen.getByText('100').className).toContain('text-end');
  });

  it('renders select triggers with start-aligned text for Hebrew', () => {
    renderWithIntl(
      <Select defaultValue="a">
        <SelectTrigger aria-label="בחירה">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">אפשרות</SelectItem>
        </SelectContent>
      </Select>,
      { locale: 'he-IL' },
    );

    expect(screen.getByLabelText('בחירה').className).toContain('text-start');
  });
});
