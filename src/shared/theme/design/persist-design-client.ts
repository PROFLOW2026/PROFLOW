import { type DesignPreference } from './config';

/** Metadata-only persist. The cookie is written in the browser so the document does not refresh. */
export async function persistDesignPreference(design: DesignPreference): Promise<void> {
  await fetch('/api/preferences/ui-design', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ design }),
    keepalive: true,
  });
}
