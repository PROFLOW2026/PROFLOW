import { ProjectClaimsScreen } from './screen';

export default function ProjectClaimsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  return <ProjectClaimsScreen params={params} searchParams={searchParams} />;
}
