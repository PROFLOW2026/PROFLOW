/**
 * Runs async tasks with a fixed upper bound on in-flight work.
 * Used by the daily ops bundle (OPS-001) to avoid fanning out all sub-workers at once.
 */
export async function runWithMaxConcurrency<T>(
  tasks: readonly (() => Promise<T>)[],
  maxConcurrent: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const limit = Math.max(1, Math.min(maxConcurrent, tasks.length));
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]!();
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
