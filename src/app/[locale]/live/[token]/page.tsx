import type { Metadata } from 'next';
import { LiveShareViewer } from '@/modules/infra-mapping/ui/live-share-viewer';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * PUBLIC, isolated route: it sits outside the `(app)` group, so there is no sign-in gate, no app shell and no
 * project data here. It only renders the video of one live share, identified by a signed short-lived link.
 */
export default async function LiveShareViewerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LiveShareViewer viewerToken={decodeURIComponent(token)} />;
}
