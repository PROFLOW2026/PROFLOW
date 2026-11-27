/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesignPreference } from '@/shared/theme/design/design-context';
import { DesignProvider } from '@/shared/theme/design/design-provider';
import {
  DesignFinanceSwitch,
  type DesignFinanceSnapshot,
} from '@/shared/theme/design/templates/design-finance-switch';
import { DesignListShell } from '@/shared/theme/design/templates/design-list-shell';

const EMPTY_SNAPSHOT: DesignFinanceSnapshot = {
  margin: null,
  marginRate: null,
  recognized: null,
  collected: null,
  receivable: null,
  contract: null,
  marginVat: null,
  urgent: [],
  points: [],
};

let fieldInstances = 0;

function Fields() {
  const [instance] = useState(() => {
    fieldInstances += 1;
    return fieldInstances;
  });
  const [query, setQuery] = useState('חיפוש שמור');
  const [facet, setFacet] = useState('active');
  const [note, setNote] = useState('שדה שמור');
  const [tab, setTab] = useState('files');
  const [dialogOpen, setDialogOpen] = useState(true);
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <output aria-label="instance">{instance}</output>
      <input aria-label="חיפוש" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="סינון" value={facet} onChange={(event) => setFacet(event.target.value)}>
        <option value="all">הכל</option>
        <option value="active">פעיל</option>
      </select>
      <input aria-label="שם" value={note} onChange={(event) => setNote(event.target.value)} />
      <div role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>
          פרטים
        </button>
        <button type="button" role="tab" aria-selected={tab === 'files'} onClick={() => setTab('files')}>
          קבצים
        </button>
      </div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        שורה
      </button>
      {dialogOpen ? (
        <div role="dialog" aria-label="חלון">
          פתוח
          <button type="button" onClick={() => setDialogOpen(false)}>
            סגור
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Switcher() {
  const { setDesign } = useDesignPreference();
  return (
    <>
      <button type="button" onClick={() => setDesign('v9')}>
        עבור ל-v9
      </button>
      <button type="button" onClick={() => setDesign('v10')}>
        עבור ל-v10
      </button>
      <button type="button" onClick={() => setDesign('current')}>
        עבור לנוכחי
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fieldInstances = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  );
});

describe('design switch state', () => {
  it('keeps fields, filters, tabs, dialogs, and row expansion in the same child instance', async () => {
    const user = userEvent.setup();
    render(
      <DesignProvider design="current">
        <Switcher />
        <DesignListShell>
          <Fields />
        </DesignListShell>
      </DesignProvider>,
    );

    const instanceBefore = screen.getByLabelText('instance').textContent;
    await user.click(screen.getByRole('button', { name: 'עבור ל-v9' }));
    await waitFor(() => expect(document.querySelector('[data-pf-design-list="v9"]')).not.toBeNull());
    expect(screen.getByLabelText('instance')).toHaveTextContent(instanceBefore ?? '');
    expect(screen.getByLabelText('חיפוש')).toHaveValue('חיפוש שמור');
    expect(screen.getByLabelText('סינון')).toHaveValue('active');
    expect(screen.getByLabelText('שם')).toHaveValue('שדה שמור');
    expect(screen.getByRole('tab', { name: 'קבצים' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('dialog', { name: 'חלון' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'שורה' })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'עבור ל-v10' }));
    await waitFor(() => expect(document.querySelector('[data-pf-design-list="v10"]')).not.toBeNull());
    expect(screen.getByLabelText('instance')).toHaveTextContent(instanceBefore ?? '');
    expect(screen.getByLabelText('חיפוש')).toHaveValue('חיפוש שמור');
    expect(screen.getByRole('dialog', { name: 'חלון' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'עבור לנוכחי' }));
    await waitFor(() => expect(document.querySelector('[data-pf-design-list="current"]')).not.toBeNull());
    expect(screen.getByLabelText('instance')).toHaveTextContent(instanceBefore ?? '');
    expect(screen.getByLabelText('שם')).toHaveValue('שדה שמור');
    expect(screen.getByLabelText('סינון')).toHaveValue('active');
  });

  it('applies a design chosen before paint without remounting the list child', async () => {
    render(
      <DesignProvider design="v10">
        <DesignListShell>
          <Fields />
        </DesignListShell>
      </DesignProvider>,
    );

    await waitFor(() => expect(document.querySelector('[data-pf-design-list="v10"]')).not.toBeNull());
    expect(screen.getByLabelText('חיפוש')).toHaveValue('חיפוש שמור');
    expect(screen.getByRole('dialog', { name: 'חלון' })).toBeVisible();
    expect(screen.getByLabelText('סינון')).toHaveValue('active');
    expect(screen.getByRole('button', { name: 'שורה' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('finance copy follows the computed margin', () => {
  it('shows the contract-margin sentence only when the snapshot has that figure', async () => {
    const { rerender } = render(
      <DesignProvider design="v9">
        <DesignFinanceSwitch current={<p>גוף</p>} snapshot={EMPTY_SNAPSHOT} />
      </DesignProvider>,
    );
    await waitFor(() => expect(document.querySelector('[data-pf-design-variant="v9"]')).not.toBeNull());
    expect(screen.queryByText(/מרווח חוזי/)).not.toBeInTheDocument();
    expect(screen.getByText('גוף')).toBeVisible();

    rerender(
      <DesignProvider design="v9">
        <DesignFinanceSwitch
          current={<p>גוף</p>}
          snapshot={{ ...EMPTY_SNAPSHOT, margin: '12,000', marginRate: '18', marginVat: '2,040' }}
        />
      </DesignProvider>,
    );
    await waitFor(() => expect(screen.getByText(/מרווח חוזי/)).toBeVisible());
    expect(screen.getByText('12,000')).toBeVisible();
    expect(screen.getByText('גוף')).toBeVisible();
  });

  it('hides the VAT control when the snapshot has no VAT figure', async () => {
    render(
      <DesignProvider design="v10">
        <DesignFinanceSwitch current={<p>גוף</p>} snapshot={EMPTY_SNAPSHOT} />
      </DesignProvider>,
    );
    await waitFor(() => expect(document.querySelector('[data-pf-design-variant="v10"]')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'מע״מ וברוטו' })).not.toBeInTheDocument();
  });
});
