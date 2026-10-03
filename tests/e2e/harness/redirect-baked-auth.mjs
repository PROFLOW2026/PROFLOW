/**
 * Local smoke only. The production build inlines the public auth host.
 * This redirects that host to the harness auth stand-in for this process.
 * It does not change application source or production authentication.
 */
const FROM = 'https://rnjeggpsjchayprygkcw.supabase.co';
const TO = 'http://127.0.0.1:55321';

const original = globalThis.fetch;

function retarget(input) {
  const href =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!href.startsWith(FROM)) return input;
  const next = TO + href.slice(FROM.length);
  if (typeof input === 'string' || input instanceof URL) return next;
  return new Request(next, input);
}

globalThis.fetch = function patchedFetch(input, init) {
  return original.call(this, retarget(input), init);
};
