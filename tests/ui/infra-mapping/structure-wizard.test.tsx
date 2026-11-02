// @vitest-environment jsdom
/**
 * The structure wizard: three steps, a preview that promises no cloud folders, and ONE create call
 * with the full spec (the server writes rows only - the wizard never touches the cloud).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('an infrastructure project needs no building', () => {
    setup();
    fireEvent.click(screen.getByTestId('wizard-template-infrastructure'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.queryAllByTestId('wizard-level-row')).toHaveLength(0);
  });
});
