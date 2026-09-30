import fs from 'node:fs';
import path from 'node:path';

export type ScaffoldStatus = 'created' | 'skipped';

export interface ScaffoldResult {
  path: string;
  status: ScaffoldStatus;
}

export function writeConfigFile(
  destination: string,
  content: unknown,
  force: boolean
): ScaffoldResult {
  if (fs.existsSync(destination) && !force) {
    return { path: destination, status: 'skipped' };
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(content, null, 2) + '\n');
  return { path: destination, status: 'created' };
}
