/**
 * Suggest a project for an OCR review from vendor memory, open POs, and engagements.
 * Suggestion only — never writes Actual or posts a draft by itself.
 */

export interface ProjectSuggestionRow {
  readonly projectId: string;
  readonly projectName: string;
  readonly reason: 'memory' | 'open_po' | 'engagement' | 'recent_bill';
}

export interface ProjectSuggestionIndex {
  readonly memoryProjectIds: readonly string[];
  readonly openPoProjectIds: readonly string[];
  readonly engagementProjectIds: readonly string[];
  readonly recentBillProjectIds: readonly string[];
  readonly names: Readonly<Record<string, string>>;
}

export function suggestProjects(index: ProjectSuggestionIndex): ProjectSuggestionRow[] {
  const seen = new Set<string>();
  const out: ProjectSuggestionRow[] = [];
  const push = (ids: readonly string[], reason: ProjectSuggestionRow['reason']) => {
    for (const projectId of ids) {
      if (!projectId || seen.has(projectId)) continue;
      seen.add(projectId);
      out.push({
        projectId,
        projectName: index.names[projectId] ?? projectId,
        reason,
      });
    }
  };
  push(index.memoryProjectIds, 'memory');
  push(index.openPoProjectIds, 'open_po');
  push(index.engagementProjectIds, 'engagement');
  push(index.recentBillProjectIds, 'recent_bill');
  return out.slice(0, 5);
}
