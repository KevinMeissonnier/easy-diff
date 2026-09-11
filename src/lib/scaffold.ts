import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES_DIR } from './paths.js';

export type ScaffoldStatus = 'created' | 'skipped';

export interface ScaffoldResult {
  path: string;
  status: ScaffoldStatus;
}

/** Copies a file from templates/<relativeTemplatePath> to an absolute destination. */
export function copyTemplate(
  relativeTemplatePath: string,
  destination: string,
  force: boolean
): ScaffoldResult {
  const source = path.join(TEMPLATES_DIR, relativeTemplatePath);
  if (fs.existsSync(destination) && !force) {
    return { path: destination, status: 'skipped' };
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return { path: destination, status: 'created' };
}
