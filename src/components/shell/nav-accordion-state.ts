import type { MoreNavGroup, NavItem } from './navigation';

export type NavAccordionGroup = {
  readonly group: MoreNavGroup;
  readonly items: readonly NavItem[];
};

export function findActiveNavGroup(
  groups: readonly NavAccordionGroup[],
  pathname: string,
  isActive: (pathname: string, href: string) => boolean,
): MoreNavGroup | null {
  for (const entry of groups) {
    if (entry.items.some((item) => isActive(pathname, item.href))) {
      return entry.group;
    }
  }
  return null;
}

/** Exclusive accordion: open clicked group, or close if it is already open. */
export function nextExclusiveOpenGroup(
  current: MoreNavGroup | null,
  clicked: MoreNavGroup,
): MoreNavGroup | null {
  return current === clicked ? null : clicked;
}
