import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SeededWorld } from './seed';

export async function writeWorldJson(world: SeededWorld): Promise<void> {
  await writeFile(
    path.resolve(process.cwd(), 'tests/e2e/.world.json'),
    `${JSON.stringify(world, null, 2)}\n`,
    'utf8',
  );
}
