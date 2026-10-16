'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Toolbar control and explanation only. Does not load fonts or change drawing. */
export function CadAlternateFontsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-9 min-h-9 whitespace-normal px-2 py-0 text-[11px] font-medium leading-none"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-col items-center gap-0.5">
          <span>גופנים</span>
          <span>חלופיים</span>
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" closeLabel="סגירה" mobileSheet>
          <DialogHeader>
            <DialogTitle>גופנים חלופיים</DialogTitle>
            <DialogDescription>הסבר קצר על הצגת טקסט כשהגופן המקורי חסר.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm text-[var(--pf-text-primary)]">
            <p>גופן חלופי הוא גופן שהמערכת מציגה במקום הגופן המקורי של השרטוט.</p>
            <p>זה קורה כשקובצי הגופן המקוריים לא נמצאים עם קובץ ה־DWG, או כשהם לא זמינים לקריאה.</p>
            <p>במצב כזה המערכת מנסה להציג את הטקסט בגופן הקרוב ביותר, כדי שהמילים והמספרים יישארו קריאים.</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              סגירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
