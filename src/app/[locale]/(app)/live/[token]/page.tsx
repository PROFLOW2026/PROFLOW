import type { Metadata } from 'next';
import { LiveShareViewer } from '@/modules/infra-mapping/ui/live-share-viewer';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/** The second phone: opens the shared live camera (camera + infrastructure overlay). */
export default async function LiveShareViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LiveShareViewer shareToken={decodeURIComponent(token)} />;
}
