import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageFilePreviewShell } from '@/modules/external-storage/ui/storage-file-preview-shell';

describe('StorageFilePreviewShell', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.touchAction = '';
  });

  it('restores body scroll lock state after close', async () => {
    window.scrollTo(0, 120);
    document.body.style.overflow = 'auto';

    const user = userEvent.setup();
    const { rerender } = render(
      <StorageFilePreviewShell
        open={false}
        closeLabel="Close"
        title="drawing.pdf"
        onClose={() => undefined}
      >
        <p>Preview</p>
      </StorageFilePreviewShell>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <StorageFilePreviewShell
        open
        closeLabel="Close"
        title="drawing.pdf"
        onClose={() => undefined}
      >
        <p>Preview</p>
      </StorageFilePreviewShell>,
    );

    await waitFor(() => {
      expect(document.body.style.position).toBe('fixed');
      expect(document.body.style.overflow).toBe('hidden');
    });

    rerender(
      <StorageFilePreviewShell
        open={false}
        closeLabel="Close"
        title="drawing.pdf"
        onClose={() => undefined}
      >
        <p>Preview</p>
      </StorageFilePreviewShell>,
    );

    await waitFor(() => {
      expect(document.body.style.position).toBe('');
      expect(document.body.style.overflow).toBe('auto');
      expect(document.body.style.width).toBe('');
      expect(document.body.style.touchAction).toBe('');
    });
  });

  it('uses full inset sizing without w-screen', () => {
    render(
      <StorageFilePreviewShell open closeLabel="Close" title="drawing.pdf" onClose={() => undefined}>
        <p>Preview</p>
      </StorageFilePreviewShell>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('inset-0');
    expect(dialog.className).toContain('w-full');
    expect(dialog.className).not.toContain('w-screen');
  });
});
