import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

/** Minimal stable legal routes for marketing/auth integration. */
export function LegalFooterLinks({ className }: { className?: string }) {
  return (
    <nav className={cn('flex flex-wrap gap-x-4 gap-y-1', className)} aria-label="מסמכים משפטיים">
      <Link href="/legal/terms" className="no-underline hover:underline">
        תנאי שימוש
      </Link>
      <Link href="/legal/privacy" className="no-underline hover:underline">
        מדיניות פרטיות
      </Link>
    </nav>
  );
}
