import { type StylePreference } from './config';

/** Metadata-only persist. The cookie is written in the browser so the document does not refresh. */
export async function persistStylePreference(style: StylePreference): Promise<void> {
  await fetch('/api/preferences/ui-style', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ style }),
    keepalive: true,
  });
}