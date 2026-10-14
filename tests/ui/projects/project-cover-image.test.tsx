import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectCoverImage } from '@/modules/projects/ui/project-cover-image';

describe('ProjectCoverImage', () => {
  it('renders img with alt when url provided', () => {
    render(<ProjectCoverImage projectName="Tower A" imageUrl="https://example.test/cover.jpg" />);
    const img = screen.getByRole('img', { name: 'Tower A' });
    expect(img).not.toHaveAttribute('download');
  });

  it('renders placeholder without img when no url', () => {
    render(<ProjectCoverImage projectName="Tower B" />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
