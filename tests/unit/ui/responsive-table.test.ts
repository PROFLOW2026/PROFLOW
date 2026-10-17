import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  extractTableHeaderLabels,
} from '@/components/ui/table';

describe('responsive table cards', () => {
  it('pairs every column label with its value and keeps row actions', () => {
    const markup = renderToStaticMarkup(
      createElement(
        Table,
        null,
        createElement(
          TableHeader,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableHead, null, 'Description'),
            createElement(TableHead, null, 'Quantity'),
            createElement(TableHead, { numeric: true }, 'Line total'),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, null, 'Long cable run'),
            createElement(TableCell, null, '12'),
            createElement(
              TableCell,
              null,
              createElement('button', { type: 'button' }, 'Edit line'),
            ),
          ),
        ),
      ),
    );

    expect(markup).toContain('data-pf-responsive-table');
    expect(markup).toContain('data-label="Description"');
    expect(markup).toContain('data-label="Quantity"');
    expect(markup).toContain('data-label="Line total"');
    expect(markup).toContain('Long cable run');
    expect(markup).toContain('>12<');
    expect(markup).toContain('Edit line');
    expect(markup).not.toContain('overflow-x-auto');
    expect(markup).not.toContain('whitespace-nowrap');
  });

  it('joins labels when a cell spans columns', () => {
    const labels = extractTableHeaderLabels(
      createElement(
        TableHeader,
        null,
        createElement(
          TableRow,
          null,
          createElement(TableHead, null, 'Work'),
          createElement(TableHead, null, 'Qty'),
          createElement(TableHead, null, 'Price'),
        ),
      ),
    );

    expect(labels).toEqual(['Work', 'Qty', 'Price']);

    const markup = renderToStaticMarkup(
      createElement(
        Table,
        null,
        createElement(
          TableHeader,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableHead, null, 'Work'),
            createElement(TableHead, null, 'Qty'),
            createElement(TableHead, null, 'Price'),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, { colSpan: 2 }, 'Combined'),
            createElement(TableCell, null, '40'),
          ),
        ),
      ),
    );

    expect(markup).toContain('data-label="Work · Qty"');
    expect(markup).toContain('data-label="Price"');
    expect(markup).toContain('Combined');
    expect(markup).toContain('>40<');
  });
});
