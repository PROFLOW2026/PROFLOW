import { describe, expect, it } from 'vitest';
import {
  DEPENDENCY_CYCLE_MESSAGE,
  DEPENDENCY_SELF_MESSAGE,
  collectPredecessorChain,
  validateDependencyGraph,
  wouldCreateCycle,
} from '@/modules/planning/domain/dependencies';

const PROJECT = '018f1234-5678-7abc-8def-0123456789ab';

function item(id: string) {
  return { id, projectId: PROJECT, archivedAt: null as Date | null };
}

function edge(predecessorId: string, successorId: string) {
  return { predecessorId, successorId, projectId: PROJECT };
}

describe('planning dependency validation', () => {
  it('accepts a linear finish-to-start chain and returns topo order', () => {
    const result = validateDependencyGraph({
      projectId: PROJECT,
      workItems: [item('a'), item('b'), item('c')],
      dependencies: [edge('a', 'b'), edge('b', 'c')],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.topologicalOrder).toEqual(['a', 'b', 'c']);
    }
  });

  it('rejects a cycle', () => {
    const result = validateDependencyGraph({
      projectId: PROJECT,
      workItems: [item('a'), item('b'), item('c')],
      dependencies: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(DEPENDENCY_CYCLE_MESSAGE);
      expect([...result.cycleNodeIds].sort()).toEqual(['a', 'b', 'c']);
    }
  });

  it('rejects self-dependency', () => {
    const result = validateDependencyGraph({
      projectId: PROJECT,
      workItems: [item('a')],
      dependencies: [edge('a', 'a')],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(DEPENDENCY_SELF_MESSAGE);
    }
  });

  it('detects wouldCreateCycle without mutating the graph', () => {
    const workItems = [item('a'), item('b'), item('c')];
    const dependencies = [edge('a', 'b'), edge('b', 'c')];
    expect(
      wouldCreateCycle({
        projectId: PROJECT,
        workItems,
        dependencies,
        edge: edge('c', 'a'),
      }),
    ).toBe(true);
    expect(
      wouldCreateCycle({
        projectId: PROJECT,
        workItems,
        dependencies,
        edge: edge('a', 'c'),
      }),
    ).toBe(false);
  });

  it('collects transitive predecessor chain', () => {
    const chain = collectPredecessorChain('c', [edge('a', 'b'), edge('b', 'c')]);
    expect([...chain].sort()).toEqual(['a', 'b']);
  });

  it('ignores archived work items in active id set', () => {
    const result = validateDependencyGraph({
      projectId: PROJECT,
      workItems: [
        item('a'),
        { id: 'b', projectId: PROJECT, archivedAt: new Date() },
        item('c'),
      ],
      dependencies: [edge('a', 'c')],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects cross-project dependency edges (same-project integrity)', () => {
    const otherProject = '018f9999-5678-7abc-8def-0123456789ab';
    const result = validateDependencyGraph({
      projectId: PROJECT,
      workItems: [item('a'), item('b')],
      dependencies: [{ predecessorId: 'a', successorId: 'b', projectId: otherProject }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe('planning.dependency.crossProject');
    }
  });
});
