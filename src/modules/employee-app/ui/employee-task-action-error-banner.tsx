'use client';

import { Alert } from '@/components/ui/alert';

export function EmployeeTaskActionErrorBanner({ message }: { readonly message: string }) {
  return (
    <Alert tone="danger" className="mx-0">
      {message}
    </Alert>
  );
}
