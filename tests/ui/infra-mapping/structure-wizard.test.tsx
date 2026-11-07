// @vitest-environment jsdom
/**
 * The structure wizard: three steps, a preview that promises no cloud folders, and ONE create call
 * with the full spec (the server writes rows only - the wizard never touches the cloud).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StructureWizard } from '@/modules/infra-mapping/ui/structure-wizard';
import { STRUCTURE_TEXT } from '@/modules/infra-mapping/ui/structure-texts';

afterEach(cleanup);

function setup(createStructure = vi.fn(async () => ({ ok: true as const, count: 0 }))) {
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(<StructureWizard projectId="p1" parentId={null} createStructure={createStructure as never} onCreated={onCreated} onCancel={onCancel} />);
  return { createStructure, onCreated, onCancel };
}

describe('StructureWizard', () => {
  it('starts at the project type with templates as a starting point only', () => {
    setup();
    expect(screen.getByTestId('structure-wizard')).toBeTruthy();
    for (const key of ['residential', 'house', 'commercial', 'mixed', 'infrastructure', 'custom']) {
      expect(screen.getByTestId(`wizard-template-${key}`)).toBeTruthy();
    }
  });

  it('goes through the steps, shows a preview, and creates the structure with one call', async () => {
    const { createStructure, onCreated } = setup(vi.fn(async () => ({ ok: true as const, count: 20 })));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getAllByTestId('wizard-level-row').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-preview')).toBeTruthy();
    expect(screen.getByText(new RegExp(STRUCTURE_TEXT.previewNoFolders.slice(0, 20)))).toBeTruthy();

    fireEvent.click(screen.getByTestId('wizard-create'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(20));
    expect(createStructure).toHaveBeenCalledTimes(1);
    const payload = (createStructure.mock.calls[0] as unknown as [{ projectId: string; parentId: string | null; spec: { buildings: unknown[] } }])[0];
    expect(payload.projectId).toBe('p1');
    expect(payload.spec.buildings.length).toBeGreaterThan(0);
  });

  it('shows a server failure and does not report success', async () => {
    const { onCreated } = setup(vi.fn(async () => ({ ok: false as const, error: 'נכשל' })) as never);
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('wizard-create'));
    await waitFor(() => expect(screen.getByText('נכשל')).toBeTruthy());
    expect(onCreated).not.toHaveBeenCalled();
  });

  describe('quantity fields', () => {
    const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });

    it('can be emptied completely and retyped, and a 0 never sticks to a new number', () => {
      setup();
      const floors = field(STRUCTURE_TEXT.floors);
      type(floors, '');
      expect(floors.value).toBe('');
      type(floors, '7');
      expect(floors.value).toBe('7');
      type(floors, '');
      type(floors, '05');
      expect(floors.value).toBe('5');
    });

    it('allows 0 where it is valid and normalizes an empty field when it is left', () => {
      setup();
      const basements = field(STRUCTURE_TEXT.basements);
      type(basements, '2');
      type(basements, '');
      fireEvent.blur(basements);
      expect(basements.value).toBe('0');
    });

    it('never accepts negative or non-numeric input and caps at the maximum', () => {
      setup();
      const floors = field(STRUCTURE_TEXT.floors);
      type(floors, '-4');
      expect(floors.value).toBe('4');
      type(floors, 'abc');
      expect(floors.value).toBe('');
      type(floors, '500');
      expect(floors.value).toBe('99');
    });

    it('is a phone-friendly numeric field', () => {
      setup();
      const floors = field(STRUCTURE_TEXT.floors);
      expect(floors.getAttribute('inputmode')).toBe('numeric');
    });

    it('a required quantity (buildings) explains itself while empty, keeps the last valid value and continues', () => {
      setup();
      const buildings = field(STRUCTURE_TEXT.buildingCount);
      type(buildings, '');
      expect(buildings.value).toBe('');
      expect(screen.getByRole('alert').textContent).toContain('יש להזין מספר');
      expect((screen.getByTestId('wizard-next') as HTMLButtonElement).disabled).toBe(false);
      fireEvent.blur(buildings);
      expect(buildings.value).toBe('1');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('first structure in an empty project', () => {
    it('can continue from the untouched defaults, with no existing locations required', () => {
      setup();
      const next = screen.getByTestId('wizard-next') as HTMLButtonElement;
      expect(next.disabled).toBe(false);
      expect(screen.queryByTestId('wizard-blockers')).toBeNull();
    });

    it('lets the user set floors and units from scratch and reach the summary', () => {
      setup();
      const floors = screen.getByLabelText(STRUCTURE_TEXT.floors) as HTMLInputElement;
      fireEvent.change(floors, { target: { value: '' } });
      fireEvent.change(floors, { target: { value: '3' } });
      fireEvent.click(screen.getByTestId('wizard-next'));
      expect(screen.getAllByTestId('wizard-level-row').length).toBeGreaterThan(0);
      const first = within(screen.getAllByTestId('wizard-level-row')[0]!).getAllByRole('textbox')[0] as HTMLInputElement;
      fireEvent.change(first, { target: { value: '' } });
      fireEvent.change(first, { target: { value: '2' } });
      expect(first.value).toBe('2');
      fireEvent.click(screen.getByTestId('wizard-next'));
      expect(screen.getByTestId('wizard-preview')).toBeTruthy();
    });

    it('never leaves "continue" disabled without saying why', () => {
      setup();
      fireEvent.click(screen.getByTestId('wizard-next'));
      fireEvent.click(screen.getByRole('button', { name: STRUCTURE_TEXT.multiAdd }));
      const row = screen.getByTestId('wizard-multi-row');
      const extras = within(row).getAllByRole('checkbox');
      for (const extra of extras) {
        if (extra.getAttribute('aria-checked') === 'true') fireEvent.click(extra);
      }
      expect((screen.getByTestId('wizard-next') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId('wizard-blockers').textContent).toContain(STRUCTURE_TEXT.issues.multi_level_invalid);
      expect(screen.getByTestId('wizard-multi-problem').textContent).toContain(STRUCTURE_TEXT.multiProblemExtra);
    });

    it('does not create twice when the button is pressed repeatedly', async () => {
      let release: (value: { ok: true; count: number }) => void = () => undefined;
      const createStructure = vi.fn(() => new Promise<{ ok: true; count: number }>((resolve) => (release = resolve)));
      const { onCreated } = setup(createStructure as never);
      fireEvent.click(screen.getByTestId('wizard-next'));
      fireEvent.click(screen.getByTestId('wizard-next'));
      const create = screen.getByTestId('wizard-create');
      fireEvent.click(create);
      fireEvent.click(create);
      fireEvent.click(create);
      expect(createStructure).toHaveBeenCalledTimes(1);
      release({ ok: true, count: 5 });
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(5));
      expect(createStructure).toHaveBeenCalledTimes(1);
    });
  });

  it('an infrastructure project needs no building', () => {
    setup();
    fireEvent.click(screen.getByTestId('wizard-template-infrastructure'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.queryAllByTestId('wizard-level-row')).toHaveLength(0);
  });
});
