function canonicalSearch(value: string): string {
  const raw = value.startsWith('?') ? value.slice(1) : value;
  const params = new URLSearchParams(raw.split('#')[0] ?? '');
  const entries = [...params.entries()].sort(([left], [right]) => left.localeCompare(right));
  return new URLSearchParams(entries).toString();
}

function pathOnly(href: string): string {
  const withoutQuery = href.split('?')[0]?.split('#')[0] ?? href;
  return withoutQuery.replace(/\/$/, '') || '/';
}

/** True when a section tab's href is already the current path and query. */
export function sectionNavTargetSettled(pathname: string, search: string, href: string): boolean {
  const query = href.split('?')[1] ?? '';
  return pathOnly(href) === pathOnly(pathname) && canonicalSearch(query) === canonicalSearch(search);
}
