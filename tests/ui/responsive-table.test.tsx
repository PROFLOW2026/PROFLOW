import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { renderWithIntl } from './test-utils';

interface SampleRow {
  id: string;
  name: string;
}

const rows: SampleRow[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];

describe('ResponsiveTable', () => {
  it('renders the desktop table and mobile cards for the same items', () => {
    const { container } = renderWithIntl(
      <ResponsiveTable
        items={rows}
        getRowKey={(row) => row.id}
        desktop={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
        renderMobileCard={(row) => (
          <div data-testid={`card-${row.id}`}>{row.name}</div>
        )}
      />,
    );

    expect(container.querySelector('.hidden.md\\:block')).not.toBeNull();
    expect(container.querySelector('.md\\:hidden')).not.toBeNull();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByTestId('card-a')).toHaveTextContent('Alpha');
    expect(screen.getByTestId('card-b')).toHaveTextContent('Beta');
  });
});
