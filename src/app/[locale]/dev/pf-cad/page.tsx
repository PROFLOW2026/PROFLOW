import { notFound } from 'next/navigation';
import { PfCadDevHarness } from '@/modules/external-storage/ui/cad/pf-cad/pf-cad-dev-harness';

export default function PfCadDevPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return (
    <div className="flex h-dvh flex-col bg-background">
      <PfCadDevHarness />
    </div>
  );
}
