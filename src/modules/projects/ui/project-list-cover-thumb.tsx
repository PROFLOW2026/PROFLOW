import { ProjectCoverImage } from './project-cover-image';

export function ProjectListCoverThumb({
  projectName,
  imageUrl,
}: {
  projectName: string;
  imageUrl: string | null;
}) {
  return (
    <ProjectCoverImage
      projectName={projectName}
      imageUrl={imageUrl}
      className="h-10 w-[4.5rem] shrink-0 rounded-md"
      showInitialWhenEmpty
    />
  );
}
