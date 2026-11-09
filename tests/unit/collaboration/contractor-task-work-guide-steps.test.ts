import { describe, expect, it } from 'vitest';
import { buildContractorTaskWorkGuideSteps } from '@/modules/collaboration/domain/contractor-task-work-guide-steps';

describe('buildContractorTaskWorkGuideSteps', () => {
  const base = {
    canAct: true,
    availableCommands: ['acknowledge', 'start', 'submit_completion'] as const,
    status: 'assigned' as const,
    drawingDrawingId: 'd-1',
    canCaptureInfra: true,
  };

  it('lists all steps when capabilities and commands are available', () => {
    const steps = buildContractorTaskWorkGuideSteps(base);
    expect(steps.map((s) => s.key)).toEqual(['acknowledge', 'drawing', 'photo', 'submit']);
  });

  it('hides acknowledge and submit when the contractor cannot act', () => {
    const steps = buildContractorTaskWorkGuideSteps({ ...base, canAct: false, availableCommands: ['acknowledge'] });
    expect(steps.map((s) => s.key)).toEqual(['drawing', 'photo']);
  });

  it('hides drawing without a linked visible plan', () => {
    const steps = buildContractorTaskWorkGuideSteps({ ...base, drawingDrawingId: null });
    expect(steps.map((s) => s.key)).toEqual(['acknowledge', 'photo', 'submit']);
  });

  it('hides photo without document capability or on terminal status', () => {
    expect(buildContractorTaskWorkGuideSteps({ ...base, canCaptureInfra: false }).map((s) => s.key)).not.toContain('photo');
    expect(
      buildContractorTaskWorkGuideSteps({ ...base, status: 'closed' }).map((s) => s.key),
    ).not.toContain('photo');
  });
});
