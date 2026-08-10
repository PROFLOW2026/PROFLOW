import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BreadcrumbItem, BreadcrumbSeparator, Breadcrumbs } from '@/components/ui/breadcrumbs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MoneyInput } from '@/components/patterns/money-input';
import { localeDirection } from '@/shared/i18n/config';
import { LtrIsland, rtlFlipClassName } from '@/shared/i18n/ltr-island';
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
    expect(screen.getByLabelText('אימייל').className).toContain('pf-ltr-island');
  });

  it('marks number inputs as LTR islands', () => {
    renderWithIntl(
      <Field label="כמות">
        {(control) => <Input {...control} name="qty" type="number" />}
      </Field>,
      { locale: 'he-IL' },
    );

    expect(screen.getByLabelText('כמות')).toHaveAttribute('dir', 'ltr');
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

  it('aligns numeric table columns to the logical end and text cells to start', () => {
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

    expect(screen.getByText('שם').className).toContain('text-start');
    expect(screen.getByText('סכום').className).toContain('text-end');
    expect(screen.getByText('פרויקט').className).toContain('text-start');
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

  it('positions select item indicators on the logical start edge', () => {
    renderWithIntl(
      <Select open defaultValue="a">
        <SelectTrigger aria-label="בחירה">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">אפשרות</SelectItem>
        </SelectContent>
      </Select>,
      { locale: 'he-IL' },
    );

    const option = screen.getByRole('option', { name: 'אפשרות' });
    expect(option.className).toMatch(/\bps-8\b/);
    expect(option.className).toMatch(/\bpe-2\b/);
    expect(option.querySelector('.absolute')?.className ?? '').toMatch(/\bstart-2\b/);
  });

  it('wraps money inputs as an LTR island so currency padding matches the glyph', () => {
    const { container } = renderWithIntl(
      <MoneyInput value="12.50" onValueChange={() => undefined} currencySymbol="₪" aria-label="סכום" />,
      { locale: 'he-IL' },
    );
    const island = container.querySelector('.relative');
    expect(island).toHaveAttribute('dir', 'ltr');
    expect(island?.className).toContain('pf-ltr-island');
    expect(screen.getByLabelText('סכום')).toHaveAttribute('dir', 'ltr');
  });

  it('does not show numeric(18,6) storage zeros in money inputs', () => {
    renderWithIntl(
      <MoneyInput
        value="52000.000000"
        onValueChange={() => undefined}
        currencySymbol="₪"
        aria-label="סכום"
      />,
      { locale: 'he-IL' },
    );
    expect(screen.getByLabelText('סכום')).toHaveValue('52000');
  });

  it('flips directional chevrons via rtlFlipClassName', () => {
    expect(rtlFlipClassName('size-4')).toContain('rtl:rotate-180');
  });

  it('renders LtrIsland with dir=ltr for codes and tokens', () => {
    renderWithIntl(<LtrIsland>INV-2026-014</LtrIsland>, { locale: 'he-IL' });
    expect(screen.getByText('INV-2026-014')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('INV-2026-014').className).toContain('pf-ltr-island');
  });

  it('mirrors breadcrumb separators for RTL reading order', () => {
    const { container } = renderWithIntl(
      <Breadcrumbs aria-label="ניווט">
        <BreadcrumbItem>ספקים</BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem current>פרטים</BreadcrumbItem>
      </Breadcrumbs>,
      { locale: 'he-IL' },
    );
    const chevron = container.querySelector('svg');
    expect(chevron?.getAttribute('class') ?? '').toContain('rtl:rotate-180');
  });

  it('keeps pagination page numbers as an LTR island and flips chevrons', () => {
    const { container } = renderWithIntl(
      <Pagination page={2} pageCount={5} onPageChange={() => undefined} />,
      { locale: 'he-IL' },
    );
    expect(screen.getByText('2 / 5')).toHaveAttribute('dir', 'ltr');
    const chevrons = container.querySelectorAll('svg');
    expect(chevrons.length).toBeGreaterThanOrEqual(2);
    for (const chevron of chevrons) {
      expect(chevron.getAttribute('class') ?? '').toContain('rtl:rotate-180');
    }
  });

  it('propagates locale dir onto portaled dialog content and logical close control', () => {
    renderWithIntl(
      <Dialog open>
        <DialogContent closeLabel="סגור">
          <DialogHeader>
            <DialogTitle>כותרת</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <button type="button">ביטול</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
      { locale: 'he-IL' },
    );

    const title = screen.getByText('כותרת');
    const content = title.closest('[role="dialog"]');
    expect(content).toHaveAttribute('dir', 'rtl');
    expect(content?.className).toContain('text-start');
    expect(screen.getByLabelText('סגור').className).toMatch(/\bend-3\b/);
    expect(title.closest('.border-b')?.className ?? '').toMatch(/\bpe-12\b/);
  });

  it('anchors sheet panels to logical start/end edges', () => {
    const { rerender } = renderWithIntl(
      <Sheet open>
        <SheetContent side="start" closeLabel="סגור">
          <SheetHeader>
            <SheetTitle>מגירה</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
      { locale: 'he-IL' },
    );

    let panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('dir', 'rtl');
    expect(panel.className).toMatch(/\bstart-0\b/);
    expect(panel.className).toMatch(/\bborder-e\b/);

    rerender(
      <Sheet open>
        <SheetContent side="end" closeLabel="סגור">
          <SheetHeader>
            <SheetTitle>מגירה</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    panel = screen.getByRole('dialog');
    expect(panel.className).toMatch(/\bend-0\b/);
    expect(panel.className).toMatch(/\bborder-s\b/);
  });

  it('mirrors switch thumb travel for RTL and sets dir on the control', () => {
    renderWithIntl(<Switch aria-label="הפעלה" defaultChecked />, { locale: 'he-IL' });
    const root = screen.getByRole('switch');
    expect(root).toHaveAttribute('dir', 'rtl');
    const thumb = root.querySelector('span');
    expect(thumb?.className ?? '').toContain('rtl:data-[state=checked]:-translate-x-5');
    expect(thumb?.className ?? '').toContain('ltr:data-[state=checked]:translate-x-5');
  });

  it('sets tabs root dir from the active locale', () => {
    const { container } = renderWithIntl(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">ראשון</TabsTrigger>
          <TabsTrigger value="b">שני</TabsTrigger>
        </TabsList>
        <TabsContent value="a">תוכן</TabsContent>
      </Tabs>,
      { locale: 'he-IL' },
    );

    const root = container.querySelector('[data-orientation]');
    expect(root).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('tab', { name: 'ראשון' }).className).toContain('text-start');
  });

  it('flips dropdown submenu chevrons for RTL', () => {
    renderWithIntl(
      <DropdownMenu open>
        <DropdownMenuTrigger asChild>
          <button type="button">תפריט</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>עוד</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <span>פריט</span>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
      { locale: 'he-IL' },
    );

    const trigger = screen.getByText('עוד');
    const chevron = trigger.querySelector('svg');
    expect(chevron?.getAttribute('class') ?? '').toContain('rtl:rotate-180');
    expect(chevron?.getAttribute('class') ?? '').toMatch(/\bms-auto\b/);
  });
});
