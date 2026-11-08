import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';

/** Static specimen for Design V2. Hidden in production unless PF_DESIGN_SPECIMEN=1. */
export default function DesignSystemSpecimenPage() {
  if (process.env.NODE_ENV === 'production' && process.env.PF_DESIGN_SPECIMEN !== '1') {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-[var(--pf-bg-page)] text-[var(--pf-text-primary)]">
      <div className="flex min-h-dvh">
        <nav
          data-pf-slot="sidebar"
          aria-label="ניווט לדוגמה"
          className="hidden w-56 shrink-0 flex-col border-e border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 md:flex"
        >
          <p className="px-2 pb-3 text-sm font-semibold text-[var(--pf-text-brand)]">EXLFY</p>
          <a data-pf-slot="sidebar-item" aria-current="page" href="#home" className="px-3 py-2 text-sm">
            לוח בקרה
          </a>
          <a data-pf-slot="sidebar-item" href="#tasks" className="px-3 py-2 text-sm text-[var(--pf-text-secondary)]">
            משימות
          </a>
        </nav>
        <div className="min-w-0 flex-1">
          <header
            data-pf-slot="topbar"
            className="flex h-14 items-center justify-between border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4"
          >
            <h1 className="text-base font-semibold">מערכת העיצוב</h1>
            <Button type="button" size="md">
              פעולה ראשית
            </Button>
          </header>
          <div className="space-y-4 p-4">
            <header data-pf-slot="hero" className="p-4">
              <p className="text-xs text-[var(--pf-text-muted)]">פרויקט לדוגמה</p>
              <p className="text-lg font-semibold">מגדל הים התיכון</p>
            </header>
            <div role="tablist" data-pf-slot="tabs-list" className="flex gap-2">
              <button type="button" role="tab" data-pf-slot="tab" aria-selected="true" className="px-3 py-2 text-sm">
                סקירה
              </button>
              <button type="button" role="tab" data-pf-slot="tab" aria-selected="false" className="px-3 py-2 text-sm text-[var(--pf-text-secondary)]">
                כספים
              </button>
            </div>
            <div data-pf-slot="kpi-grid" className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['חוזה', '₪ 1,250,000'],
                ['שולם', '₪ 640,000'],
                ['פתוח', '₪ 82,000'],
                ['משימות', '14'],
              ].map(([label, value]) => (
                <article key={label} data-pf-slot="kpi-card" className="bg-[var(--pf-bg-surface)] p-3">
                  <p className="text-xs text-[var(--pf-text-muted)]">{label}</p>
                  <p className="text-lg font-semibold">{value}</p>
                </article>
              ))}
            </div>
            <div data-pf-slot="table-shell" className="overflow-hidden border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-start">משימה</th>
                    <th className="px-3 py-2 text-end">סכום</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--pf-border-default)]">
                    <td className="px-3 py-2">יציקת תקרה</td>
                    <td dir="ltr" className="px-3 py-2 text-end tabular-nums">
                      ₪ 18,400
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <nav data-pf-slot="bottom-nav" aria-label="ניווט תחתון" className="flex border-t border-[var(--pf-border-default)] md:hidden">
              <a data-pf-slot="bottom-nav-item" aria-current="page" href="#home" className="flex-1 px-2 py-3 text-center text-xs">
                בית
              </a>
              <a data-pf-slot="bottom-nav-item" href="#more" className="flex-1 px-2 py-3 text-center text-xs text-[var(--pf-text-secondary)]">
                עוד
              </a>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}