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
        className="h-9 min-h-9 shrink-0 whitespace-normal px-2 py-0 text-[11px] font-medium leading-none"
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
                className="relative z-[1] flex max-h-[90dvh] w-full flex-col overflow-hidden bg-[var(--pf-bg-elevated)] text-start shadow-[var(--pf-shadow-lg)] sm:w-full sm:max-w-lg sm:rounded-lg rounded-t-xl"
              >
                <div className="flex flex-col gap-1 border-b border-[var(--pf-border-default)] px-5 py-4 pe-12">
                  <h2 id="cad-alternate-fonts-title" className="text-base font-semibold">
                    גופנים חלופיים
                  </h2>
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    הסבר על תצוגת טקסט בקובץ DWG. הקובץ עצמו לא משתנה.
                  </p>
                </div>
                <button
                  type="button"
                  className="absolute end-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--pf-text-muted)]"
                  aria-label="סגירה"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" aria-hidden />
                </button>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-[var(--pf-text-primary)]">
                  <p>גופן חלופי הוא גופן שהמערכת מציגה במקום הגופן המקורי שנשמר בקובץ ה־DWG.</p>
                  <p>זה קורה כשהגופן המקורי לא נמצא עם השרטוט, או כשהמערכת לא יכולה לקרוא את קובץ הגופן.</p>
                  <p>במצב כזה התצוגה יכולה להיות שונה מעט מהמקור. המערכת מנסה להציג את המילים והמספרים בצורה הקרובה ביותר.</p>
                  <p>זהו הסבר בלבד. לחיצה כאן לא משנה את קובץ השרטוט.</p>
                </div>
                <div className="flex justify-end border-t border-[var(--pf-border-default)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
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
