import { describe, expect, it, vi } from 'vitest';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';

describe('openFilePicker', () => {
  it('clears value then clicks so the same file can be re-selected', () => {
    const input = {
      disabled: false,
      value: 'C:\\fakepath\\same.jpg',
      click: vi.fn(),
    } as unknown as HTMLInputElement;

    expect(openFilePicker(input)).toBe(true);
    expect(input.value).toBe('');
    expect(input.click).toHaveBeenCalledTimes(1);
  });

  it('does not click a disabled input', () => {
    const input = {
      disabled: true,
      value: 'C:\\fakepath\\same.jpg',
      click: vi.fn(),
    } as unknown as HTMLInputElement;

    expect(openFilePicker(input)).toBe(false);
    expect(input.click).not.toHaveBeenCalled();
    expect(input.value).toBe('C:\\fakepath\\same.jpg');
  });
});
