import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function JobsLoading() {
  return (
    <MainAppPage>
      <PageHeader title={<Skeleton className="h-8 w-40" />} />
      <MainAppSection>
        <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-40 w-full" />
    
      </MainAppSection>
    </MainAppPage>
  );
}
