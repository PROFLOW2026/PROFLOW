import { QuickCreate, type QuickCreateAction } from './quick-create';
import { loadProjectQuickCreateActions } from './quick-create-project-actions';

/**
 * Employee shell create button. Reuses Quick Create without the owner shell
 * prefs helper. Project links pick `/employee/projects/...` from the pathname.
 */
export function EmployeeQuickCreate({ actions }: { actions: readonly QuickCreateAction[] }) {
  return <QuickCreate actions={[...actions]} loadProjectActions={loadProjectQuickCreateActions} />;
}
