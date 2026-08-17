import { describe, expect, it } from 'vitest';
import { collectAssistantAccessScope } from '@/modules/assistant/domain/tools';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { AssistantToolResult } from '@/modules/assistant/domain/types';

function tool(
  key: AssistantToolResult['tool'],
  overrides: Partial<AssistantToolResult> = {},
): AssistantToolResult {
  return {
    tool: key,
    ok: true,
    claimKind: 'fact',
    title: key,
    body: 'ok',
    citations: [],
    ...overrides,
  };
}

describe('assistant stored-data access scope', () => {
  it('records profit permissions and the project used for the answer', () => {
    const projectId = '01900000-0000-7000-8000-0000000000aa';
    const scope = collectAssistantAccessScope(
      [tool('explain_project_profit')],
      projectId,
    );
    expect(scope.permissions).toContain(PERMISSIONS.PROJECT_PROFIT_READ);
    expect(scope.permissions).toContain(PERMISSIONS.PROJECT_FINANCIALS_READ);
    expect(scope.projectIds).toEqual([projectId]);
  });

  it('records permissions and project ids for financial, document, and today tools', () => {
    const projectId = '01900000-0000-7000-8000-0000000000aa';
    const scope = collectAssistantAccessScope(
      [
        tool('clients_owing_money', { accessProjectIds: [projectId] }),
        tool('find_document', { citations: [{ label: 'file', href: `/projects/${projectId}`, claimKind: 'fact' }] }),
        tool('today_attention'),
      ],
      projectId,
    );
    expect(scope.permissions).toContain(PERMISSIONS.BILLING_READ);
    expect(scope.permissions).toContain(PERMISSIONS.DOCUMENTS_READ);
    expect(scope.permissions).toContain(PERMISSIONS.COMMAND_CENTER_READ);
    expect(scope.projectIds).toContain(projectId);
    expect(scope.documentIds).toEqual([]);
  });

  it('records document ids used by find_document answers', () => {
    const documentId = '01900000-0000-7000-8000-0000000000dd';
    const scope = collectAssistantAccessScope([
      tool('find_document', { accessDocumentIds: [documentId] }),
    ]);
    expect(scope.permissions).toContain(PERMISSIONS.DOCUMENTS_READ);
    expect(scope.documentIds).toEqual([documentId]);
  });

  it('does not persist scope for denied or empty tools', () => {
    const scope = collectAssistantAccessScope([
      tool('explain_project_profit', { ok: false, permissionDenied: true }),
    ], '01900000-0000-7000-8000-0000000000aa');
    expect(scope.permissions).toEqual([]);
    expect(scope.projectIds).toEqual([]);
    expect(scope.documentIds).toEqual([]);
  });
});
