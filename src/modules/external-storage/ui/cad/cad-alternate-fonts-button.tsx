'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Explanation only. Portaled above the file preview (z-70). The shared Dialog
 * sits at z-60, so opening it under that preview locks the page without a visible window.
 */
export function CadAlternateFontsButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-9 min-h-9 shrink-0 whitespace-normal border-[rgb(64_150_145/0.4)] bg-[rgb(190_235_230/0.82)] px-2 py-0 text-[11px] font-medium leading-none text-[#14524e] hover:bg-[rgb(190_235_230/0.94)]"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="flex flex-col items-center gap-0.5">
          <span>גופנים</span>
          <span>חלופיים</span>
        </span>
      </Button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="absolute inset-0 bg-[rgb(27_36_48/0.45)]"
                aria-label="סגירה"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="cad-alternate-fonts-title"
                dir="rtl"
                className="relative z-[1] flex w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-[var(--pf-bg-elevated)] text-start shadow-[var(--pf-shadow-lg)] sm:rounded-lg"
              >
                <div className="border-b border-[var(--pf-border-default)] px-4 py-3 pe-12">
                  <h2 id="cad-alternate-fonts-title" className="text-base font-semibold">
                    גופנים חלופיים
                  </h2>
                </div>
                <button
                  type="button"
                  className="absolute end-3 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--pf-text-muted)]"
                  aria-label="סגירה"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" aria-hidden />
                </button>
                <p className="px-4 py-3 text-sm leading-relaxed text-[var(--pf-text-primary)]">
                  חלק מהגופנים המקוריים בשרטוט אינם זמינים במערכת, ולכן מוצגים במקומם גופנים חלופיים. כתוצאה מכך, חלק מהכיתובים עשויים להיראות מעט שונים מהמקור.
                </p>
                <div className="flex justify-end px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    סגירה
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
