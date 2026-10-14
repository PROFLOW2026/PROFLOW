import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { evaluateDependencyGate } from '@/modules/tasks/domain/dependency-gate';

const openPredecessors = [
  { taskId: 'pred-1', title: 'Predecessor', status: 'in_progress' as const },
];

function permissions(...keys: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]) {
  return new Set(keys);
}

describe('evaluateDependencyGate', () => {
  it('allows when there are no open predecessors', () => {
    expect(
      evaluateDependencyGate({
        policy: 'block',
        targetStatus: 'done',
        openPredecessors: [],
        permissions: permissions(),
        confirmDependencyWarning: false,
        actorIsSystem: false,
      }),
    ).toBe('allow');
  });

  it('warn policy requires confirmation', () => {
    expect(
      evaluateDependencyGate({
        policy: 'warn',
        targetStatus: 'in_progress',
        openPredecessors,
        permissions: permissions(),
        confirmDependencyWarning: false,
        actorIsSystem: false,
      }),
    ).toBe('warn');

    expect(
      evaluateDependencyGate({
        policy: 'warn',
        targetStatus: 'in_progress',
        openPredecessors,
        permissions: permissions(),
        confirmDependencyWarning: true,
        actorIsSystem: false,
      }),
    ).toBe('allow');
  });

  it('block policy blocks members without manage-all', () => {
    expect(
      evaluateDependencyGate({
        policy: 'block',
        targetStatus: 'done',
        openPredecessors,
        permissions: permissions(PERMISSIONS.TASKS_UPDATE),
        confirmDependencyWarning: false,
        actorIsSystem: false,
      }),
    ).toBe('block');
  });

  it('block policy allows override with manage-all and reason', () => {
    expect(
      evaluateDependencyGate({
        policy: 'block',
        targetStatus: 'done',
        openPredecessors,
        permissions: permissions(PERMISSIONS.TASKS_MANAGE_ALL),
        confirmDependencyWarning: false,
        dependencyOverrideReason: '  urgent site fix  ',
        actorIsSystem: false,
      }),
    ).toBe('override');

    expect(
      evaluateDependencyGate({
        policy: 'block',
        targetStatus: 'done',
        openPredecessors,
        permissions: permissions(PERMISSIONS.TASKS_MANAGE_ALL),
        confirmDependencyWarning: false,
        dependencyOverrideReason: '   ',
        actorIsSystem: false,
      }),
    ).toBe('override_reason_required');
  });

  it('skips gate for system actor', () => {
    expect(
      evaluateDependencyGate({
        policy: 'block',
        targetStatus: 'done',
        openPredecessors,
        permissions: permissions(),
        confirmDependencyWarning: false,
        actorIsSystem: true,
      }),
    ).toBe('allow');
  });

  it('does not gate transitions to todo', () => {
    expect(
      evaluateDependencyGate({
        policy: 'block',
        targetStatus: 'todo',
        openPredecessors,
        permissions: permissions(),
        confirmDependencyWarning: false,
        actorIsSystem: false,
      }),
    ).toBe('allow');
  });
});
