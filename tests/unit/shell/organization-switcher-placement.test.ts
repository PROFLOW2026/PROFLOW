import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('Organization switcher shell placement', () => {
  it('renders the switcher only in the sidebar company header, not the top bar', () => {
    const appShell = readFileSync(join(ROOT, 'src/components/shell/app-shell.tsx'), 'utf8');
    const topBar = readFileSync(join(ROOT, 'src/components/shell/top-bar.tsx'), 'utf8');

    expect(appShell).toContain('organizationSwitcher={{');
    expect(appShell).toMatch(/<Sidebar[\s\S]*organizationSwitcher=\{\{/);
    expect(appShell).not.toMatch(/<TopBar[\s\S]*organizationSwitcher/);

    expect(topBar).not.toContain('OrganizationSwitcher');
    expect(topBar).not.toContain('organizationSwitcher');
  });
});
