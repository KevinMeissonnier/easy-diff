/**
 * The analysis the `easy-diff:analyst` agent writes, and its validation. Dependency-free on
 * purpose: the plugin runs straight from its install directory, where nothing installs
 * packages. Two places call `validateAnalysis` — the `SubagentStop` hook, so the agent fixes
 * a malformed file before its turn ends, and `render`, so a file that got past it anyway is
 * never rendered. The model-facing JSON schema lives in `agents/analyst.md`.
 */

export const STEP_KINDS = ['foundation', 'core', 'wiring', 'delicate', 'tests'] as const;
export const CHANGE_TYPES = ['added', 'modified', 'deleted', 'renamed'] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;

export interface HunkWatchpoint {
  line: number;
  note: string;
}

export interface AnalysisHunk {
  index: number;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  label?: string;
  note?: string;
  watchpoints?: HunkWatchpoint[];
}

export interface AnalysisFile {
  path: string;
  change_type: (typeof CHANGE_TYPES)[number];
  why?: string;
  confidence: (typeof CONFIDENCES)[number];
  hunks: AnalysisHunk[];
}

export interface AnalysisStep {
  id: string;
  kind: (typeof STEP_KINDS)[number];
  title: string;
  narrative: string;
  files: AnalysisFile[];
}

export interface Analysis {
  version: '1.0';
  merge_request: {
    id?: string | null;
    title: string;
    source_branch: string;
    target_branch: string;
    base_sha: string;
    head_sha: string;
  };
  overview: {
    what: string;
    why: string;
    mental_model: string;
    decisions: { choice: string; reason: string }[];
    risks: string;
    estimated_reading_minutes: number;
  };
  steps: AnalysisStep[];
}

type Check = (path: string, ok: boolean, message: string) => void;

/** Returns one human-readable problem per line; empty means `value` is a valid `Analysis`. */
export function validateAnalysis(value: unknown): string[] {
  const errors: string[] = [];
  const at: Check = (path, ok, message) => {
    if (!ok) errors.push(`${path}: ${message}`);
  };

  if (!isObject(value)) return ['root: expected a JSON object'];

  at('version', value.version === '1.0', 'must be "1.0"');

  const mr = value.merge_request;
  at('merge_request', isObject(mr), 'must be an object');
  if (isObject(mr)) {
    for (const field of ['title', 'source_branch', 'target_branch', 'base_sha', 'head_sha']) {
      at(`merge_request.${field}`, typeof mr[field] === 'string', 'must be a string');
    }
    at('merge_request.id', mr.id === undefined || mr.id === null || typeof mr.id === 'string', 'must be a string or null');
  }

  const overview = value.overview;
  at('overview', isObject(overview), 'must be an object');
  if (isObject(overview)) {
    for (const field of ['what', 'why', 'mental_model', 'risks']) {
      at(`overview.${field}`, typeof overview[field] === 'string', 'must be a string');
    }
    const decisions = overview.decisions;
    at('overview.decisions', Array.isArray(decisions), 'must be an array (empty if there are none)');
    if (Array.isArray(decisions)) {
      decisions.forEach((decision, i) => {
        for (const field of ['choice', 'reason']) {
          at(`overview.decisions[${i}].${field}`, isObject(decision) && typeof decision[field] === 'string', 'must be a string');
        }
      });
    }
    at('overview.estimated_reading_minutes', isInteger(overview.estimated_reading_minutes, 1), 'must be an integer >= 1');
  }

  const steps = value.steps;
  at('steps', Array.isArray(steps) && steps.length > 0, 'must be a non-empty array');
  if (Array.isArray(steps)) {
    steps.forEach((step, i) => validateStep(step, `steps[${i}]`, at));
  }

  return errors;
}

function validateStep(step: unknown, path: string, at: Check): void {
  at(path, isObject(step), 'must be an object');
  if (!isObject(step)) return;

  for (const field of ['id', 'title', 'narrative']) {
    at(`${path}.${field}`, typeof step[field] === 'string', 'must be a string');
  }
  at(`${path}.kind`, oneOf(step.kind, STEP_KINDS), `must be one of ${STEP_KINDS.join(', ')}`);

  const files = step.files;
  at(`${path}.files`, Array.isArray(files) && files.length > 0, 'must be a non-empty array');
  if (Array.isArray(files)) {
    files.forEach((file, i) => validateFile(file, `${path}.files[${i}]`, at));
  }
}

function validateFile(file: unknown, path: string, at: Check): void {
  at(path, isObject(file), 'must be an object');
  if (!isObject(file)) return;

  at(`${path}.path`, typeof file.path === 'string', 'must be a string');
  at(`${path}.change_type`, oneOf(file.change_type, CHANGE_TYPES), `must be one of ${CHANGE_TYPES.join(', ')}`);
  at(`${path}.why`, file.why === undefined || typeof file.why === 'string', 'must be a string if present');
  at(`${path}.confidence`, oneOf(file.confidence, CONFIDENCES), `must be one of ${CONFIDENCES.join(', ')}`);

  const hunks = file.hunks;
  at(`${path}.hunks`, Array.isArray(hunks) && hunks.length > 0, 'must be a non-empty array');
  if (Array.isArray(hunks)) {
    hunks.forEach((hunk, i) => validateHunk(hunk, `${path}.hunks[${i}]`, at));
  }
}

function validateHunk(hunk: unknown, path: string, at: Check): void {
  at(path, isObject(hunk), 'must be an object');
  if (!isObject(hunk)) return;

  for (const field of ['index', 'old_start', 'old_lines', 'new_start', 'new_lines']) {
    at(`${path}.${field}`, isInteger(hunk[field], 0), 'must be an integer >= 0');
  }
  for (const field of ['label', 'note']) {
    at(`${path}.${field}`, hunk[field] === undefined || typeof hunk[field] === 'string', 'must be a string if present');
  }

  const watchpoints = hunk.watchpoints;
  if (watchpoints === undefined) return;
  at(`${path}.watchpoints`, Array.isArray(watchpoints), 'must be an array if present');
  if (!Array.isArray(watchpoints)) return;
  watchpoints.forEach((watchpoint, i) => {
    const wp = `${path}.watchpoints[${i}]`;
    at(`${wp}.line`, isObject(watchpoint) && isInteger(watchpoint.line, 1), 'must be an integer >= 1');
    at(`${wp}.note`, isObject(watchpoint) && typeof watchpoint.note === 'string', 'must be a string');
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInteger(value: unknown, min: number): boolean {
  return Number.isInteger(value) && (value as number) >= min;
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}
