'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScreenshotFrame } from './screenshot-frame';

type TourTab = {
  id: string;
  label: string;
  caption: string;
  src: string;
  alt: string;
};

export function ProductTour() {
  const t = useTranslations('marketing.tour');
  const tabs = t.raw('tabs') as TourTab[];

  return (
    <div data-pf-product-tour>
      <Tabs defaultValue={tabs[0]?.id ?? 'dashboard'} className="min-w-0">
        <TabsList aria-label={t('title')} className="mb-2">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id}>
            <ScreenshotFrame src={tab.src} alt={tab.alt} caption={tab.caption} className="mx-auto max-w-4xl" />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
