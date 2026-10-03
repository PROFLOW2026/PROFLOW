'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  resolveTourTabSrc,
  type MarketingTourTabConfig,
} from '@/modules/marketing/domain/marketing-screenshots';
import { ScreenshotFrame } from './screenshot-frame';

export function ProductTour() {
  const t = useTranslations('marketing.tour');
  const locale = useLocale();
  const tabs = t.raw('tabs') as MarketingTourTabConfig[];

  return (
    <div data-pf-product-tour>
      <Tabs defaultValue={tabs[0]?.id ?? 'today'} className="min-w-0">
        <TabsList aria-label={t('title')} className="mb-2 h-auto flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="shrink-0 whitespace-nowrap">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <ScreenshotFrame
              src={resolveTourTabSrc(locale, tab)}
              alt={tab.alt}
              caption={tab.caption}
              className="mx-auto max-w-4xl"
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
