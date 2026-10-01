#!/usr/bin/env node
'use strict';

/**
 * Stop hook for easy-diff's headless analysis runs.
 *
 * Like guard.cjs, this is only ever active when `easy-diff generate` registers it via
 * `claude --settings` — it is never part of a repo's Claude Code settings and never runs
 * during normal interactive sessions.
 *
 * `easy-diff generate` already constrains the model's output shape via `--json-schema`
 * and re-validates it with zod once the process exits (see src/lib/schema.ts). This hook
 * is a third, independent layer: before the model's turn is even allowed to end, it
 * structurally checks the JSON it just produced and, if something required is missing or
 * the wrong type, blocks the stop and tells the model exactly what to fix — so a malformed
 * result can be corrected in the same run instead of failing the whole command afterwards.
 *
 * It intentionally only checks the shape that matters (required fields present, right
 * type, non-empty arrays), not the full contract in templates/analysis.schema.json
 * (e.g. it doesn't reject unknown extra properties) — that stricter check already happens
 * downstream via zod. This is dependency-free vanilla JS on purpose: it runs via plain
 * `node` in any target repo, which may not have this package's own dependencies installed.
 */

const ENUMS = {
  change_type: ['added', 'modified', 'deleted', 'renamed'],
  confidence: ['high', 'medium', 'low'],
  kind: ['foundation', 'core', 'wiring', 'delicate', 'tests'],
};

readStdin()
  .then((raw) => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      // Can't tell what happened — don't block on a hook input we can't even parse.
      return allow();
    }

    // Already retried once because this same hook blocked; don't loop forever.
    if (input.stop_hook_active) {
      return allow();
    }

    const message = input.last_assistant_message;
    if (typeof message !== 'string' || message.trim() === '') {
      return allow();
    }

    let analysis;
    try {
      analysis = extractJson(message);
    } catch (err) {
      return block(`easy-diff-guard: the response is not valid JSON (${err.message}). ` +
        `Respond with structured data matching the required schema, no prose outside of it.`);
    }

    const errors = validateAnalysis(analysis);
    if (errors.length > 0) {
      return block(
        `easy-diff-guard: the JSON does not match the required analysis format:\n` +
          errors.map((e) => `  - ${e}`).join('\n') +
          `\nFix these and respond again with structured data matching the required schema.`
      );
    }

    return allow();
  })
  .catch(() => allow());

function extractJson(message) {
  const trimmed = message.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through — the model may have wrapped the JSON in prose or a code fence.
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON object found');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

/** Returns a list of human-readable problems; empty means valid. */
function validateAnalysis(analysis) {
  const errors = [];
  const at = (path, ok, message) => {
    if (!ok) errors.push(`${path}: ${message}`);
  };

  if (!isObject(analysis)) {
    return ["root: expected a JSON object"];
  }

  at('version', analysis.version === '1.0', 'must be "1.0"');

  const mr = analysis.merge_request;
  at('merge_request', isObject(mr), 'must be an object');
  if (isObject(mr)) {
    for (const field of ['title', 'source_branch', 'target_branch', 'base_sha', 'head_sha']) {
      at(`merge_request.${field}`, typeof mr[field] === 'string', 'must be a string');
    }
  }

  const overview = analysis.overview;
  at('overview', isObject(overview), 'must be an object');
  if (isObject(overview)) {
    for (const field of ['what', 'why', 'mental_model', 'risks', 'out_of_scope']) {
      at(`overview.${field}`, typeof overview[field] === 'string', 'must be a string');
    }
    const decisions = overview.decisions;
    at('overview.decisions', Array.isArray(decisions), 'must be an array (empty if there are none)');
    if (Array.isArray(decisions)) {
      decisions.forEach((decision, i) => {
        for (const field of ['choice', 'reason']) {
          at(
            `overview.decisions[${i}].${field}`,
            isObject(decision) && typeof decision[field] === 'string',
            'must be a string'
          );
        }
      });
    }
    at(
      'overview.estimated_reading_minutes',
      Number.isInteger(overview.estimated_reading_minutes) && overview.estimated_reading_minutes >= 1,
      'must be an integer >= 1'
    );
  }

  const steps = analysis.steps;
  at('steps', Array.isArray(steps) && steps.length > 0, 'must be a non-empty array');
  if (Array.isArray(steps)) {
    steps.forEach((step, i) => validateStep(step, `steps[${i}]`, at));
  }

  return errors;
}

function validateStep(step, path, at) {
  at(path, isObject(step), 'must be an object');
  if (!isObject(step)) return;

  for (const field of ['id', 'title', 'narrative']) {
    at(`${path}.${field}`, typeof step[field] === 'string', 'must be a string');
  }
  at(`${path}.kind`, ENUMS.kind.includes(step.kind), `must be one of ${ENUMS.kind.join(', ')}`);

  const files = step.files;
  at(`${path}.files`, Array.isArray(files) && files.length > 0, 'must be a non-empty array');
  if (Array.isArray(files)) {
    files.forEach((file, i) => validateFile(file, `${path}.files[${i}]`, at));
  }
}

function validateFile(file, path, at) {
  at(path, isObject(file), 'must be an object');
  if (!isObject(file)) return;

  at(`${path}.path`, typeof file.path === 'string', 'must be a string');
  at(
    `${path}.change_type`,
    ENUMS.change_type.includes(file.change_type),
    `must be one of ${ENUMS.change_type.join(', ')}`
  );
  at(`${path}.why`, file.why === undefined || typeof file.why === 'string', 'must be a string if present');
  at(
    `${path}.confidence`,
    ENUMS.confidence.includes(file.confidence),
    `must be one of ${ENUMS.confidence.join(', ')}`
  );

  const hunks = file.hunks;
  at(`${path}.hunks`, Array.isArray(hunks) && hunks.length > 0, 'must be a non-empty array');
  if (Array.isArray(hunks)) {
    hunks.forEach((hunk, i) => validateHunk(hunk, `${path}.hunks[${i}]`, at));
  }
}

function validateHunk(hunk, path, at) {
  at(path, isObject(hunk), 'must be an object');
  if (!isObject(hunk)) return;

  for (const field of ['index', 'old_start', 'old_lines', 'new_start', 'new_lines']) {
    at(`${path}.${field}`, Number.isInteger(hunk[field]) && hunk[field] >= 0, 'must be an integer >= 0');
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function allow() {
  process.exit(0);
}

function block(reason) {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}
