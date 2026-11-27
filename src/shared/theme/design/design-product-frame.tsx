'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/shared/i18n/navigation';
import { useMountedDesign } from './use-mounted-design';
import {
  classifyDesignHref,
  familyBodyLandmark,
  familyUsesStructuralTemplate,
} from './route-family';
import { DesignFamilyChrome } from './templates/design-family-chrome';

/**
 * Structural boundary for every signed-in product shell.
 * Current keeps the existing page as the only body. V9 and V10 add the family
 * template beside it, without a key and without refreshing the route.
 * Print is tokens only. Engine pages keep their canvas. The owner dashboard
 * keeps its own finance switch.
 */
export function DesignProductFrame({ children }: { children: ReactNode }) {
  const design = useMountedDesign();
  const pathname = usePathname();
  const family = classifyDesignHref(pathname);
  const structural = design !== 'current' && familyUsesStructuralTemplate(family);
  const landmark = design === 'v9' || design === 'v10' ? familyBodyLandmark(family, design) : undefined;

  return (
    <div
      data-pf-design-scope="product"
      data-pf-design-variant={design}
      data-pf-design-family={family}
      className={design === 'v9' ? 'pf-design-v9' : design === 'v10' ? 'pf-design-v10' : undefined}
    >
      <div data-pf-design-family-body="" data-pf-design-landmark={landmark}>
        {children}
      </div>
      {structural && (design === 'v9' || design === 'v10') ? (
        <DesignFamilyChrome family={family} design={design} />
      ) : null}
    </div>
  );
}
