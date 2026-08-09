const stubUrl = new URL('../../setup/server-only-stub.ts', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { shortCircuit: true, url: stubUrl };
  }
  return nextResolve(specifier, context);
}
