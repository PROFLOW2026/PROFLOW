/**
 * Dropbox content endpoints pass JSON via the Dropbox-API-Arg HTTP header.
 * Node/Vercel fetch requires ByteString-safe header values, so non-ASCII path
 * characters must be emitted as JSON \uXXXX escapes while preserving semantics.
 */
export function stringifyDropboxApiArgHeader(value: unknown): string {
  const json = JSON.stringify(value);
  return json.replace(/[^\x00-\x7F]/g, (char) => {
    const code = char.charCodeAt(0);
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}
