import { notFound } from 'next/navigation';

/** Public portal login is off. This route is not part of the product UI. */
export default function PublicPortalDisabledPage() {
  notFound();
}
