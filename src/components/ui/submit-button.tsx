'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * Submit control for server-action forms (`<form action={…}>`).
 * Shows the shared Button spinner while the form request is pending.
 */
export function SubmitButton({ loading, disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" loading={Boolean(loading) || pending} disabled={disabled} />;
}
