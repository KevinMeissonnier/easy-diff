#!/usr/bin/env node
'use strict';

/**
 * Stop hook for easy-diff's headless analysis runs.
 *
 * Like guard.cjs and validate-analysis.cjs, this is only ever active when `easy-diff
 * generate` registers it via `claude --settings` — it is never part of a repo's Claude Code
 * settings and never runs during normal interactive sessions.
 *
 * This is an independent layer alongside validate-analysis.cjs: that hook checks the
 * JSON's *shape*, this one checks that its prose was actually written in the expected
 * language, passed as the first argument ("en" or "fr", default "en") by `easy-diff
 * generate` from the repo's config — the prompt asks for this, but nothing stops the model
 * from ignoring it, so this blocks the stop and asks for a rewrite if the report reads as
 * the wrong language.
 *
 * Detection is a simple stopword-frequency heuristic, not real language detection —
 * dependency-free vanilla JS on purpose, like the other hooks here. It only acts once
 * there is enough signal (MIN_SIGNAL matches either way) to avoid false positives on
 * very short text, and it never blocks on unparseable output — that is
 * validate-analysis.cjs's job.
 */

const SUPPORTED_LANGUAGES = ['en', 'fr'];
const DEFAULT_LANGUAGE = 'en';
const MIN_SIGNAL = 4;

// Common stopwords that are essentially unambiguous to one language, avoiding words that
// exist as ordinary text in both (e.g. "a", "son", "est").
const FR_WORDS = [
  'le', 'la', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'que', 'qui', 'pas', 'cette',
  'ces', 'sans', 'entre', 'donc', 'ainsi', 'lorsque', 'être', 'avoir', 'fait', 'peut',
  'doit', 'vous', 'nous', 'elle', 'ils', 'elles', 'très', 'aussi', 'alors', 'mais',
];
const EN_WORDS = [
  'the', 'of', 'and', 'for', 'in', 'with', 'that', 'which', 'not', 'this', 'these',
  'without', 'between', 'thus', 'have', 'made', 'can', 'must', 'you', 'they', 'also',
  'very', 'then', 'but',
];

readStdin()
  .then((raw) => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return allow();
    }

    // Already retried once because a Stop hook blocked; don't loop forever.
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
    } catch {
      // Not valid/extractable JSON — validate-analysis.cjs's job to report, not ours.
      return allow();
    }
    if (!isObject(analysis)) {
      return allow();
    }

    const expected = SUPPORTED_LANGUAGES.includes(process.argv[2]) ? process.argv[2] : DEFAULT_LANGUAGE;
    const texts = collectProseText(analysis);
    if (texts.length === 0) {
      return allow();
    }

    const mismatch = detectMismatch(texts, expected);
    if (mismatch) {
      return block(
        `easy-diff-guard: language mismatch — ${mismatch}. Rewrite every prose field in ` +
          `${languageName(expected)} and respond again ` +
          `with the full structured data.`
      );
    }

    return allow();
  })
  .catch(() => allow());

/** Every prose field a reviewer actually reads — not ids, paths, enums, or line numbers. */
function collectProseText(analysis) {
  const texts = [];
  const push = (value) => {
    if (typeof value === 'string') texts.push(value);
  };

  if (isObject(analysis.merge_request)) {
    push(analysis.merge_request.title);
  }
  if (isObject(analysis.overview)) {
    push(analysis.overview.what);
    push(analysis.overview.why);
    push(analysis.overview.mental_model);
    if (Array.isArray(analysis.overview.decisions)) {
      for (const decision of analysis.overview.decisions) {
        if (!isObject(decision)) continue;
        push(decision.choice);
        push(decision.reason);
      }
    }
    push(analysis.overview.risks);
  }
  if (Array.isArray(analysis.steps)) {
    for (const step of analysis.steps) {
      if (!isObject(step)) continue;
      push(step.title);
      push(step.narrative);
      if (Array.isArray(step.files)) {
        for (const file of step.files) {
          if (!isObject(file)) continue;
          push(file.why);
          if (Array.isArray(file.watchpoints)) {
            file.watchpoints.forEach(push);
          }
        }
      }
    }
  }
  return texts;
}

function detectMismatch(texts, expected) {
  const combined = texts.join('\n').toLowerCase();
  const frScore = countMatches(combined, FR_WORDS);
  const enScore = countMatches(combined, EN_WORDS);

  if (frScore + enScore < MIN_SIGNAL) {
    return null; // not enough signal either way — don't risk a false positive
  }
  if (expected === 'fr' && enScore > frScore) {
    return `expected French but the text reads as English (fr signal: ${frScore}, en signal: ${enScore})`;
  }
  if (expected === 'en' && frScore > enScore) {
    return `expected English but the text reads as French (fr signal: ${frScore}, en signal: ${enScore})`;
  }
  return null;
}

function countMatches(text, words) {
  let count = 0;
  for (const word of words) {
    const matches = text.match(new RegExp(`\\b${word}\\b`, 'gu'));
    if (matches) count += matches.length;
  }
  return count;
}

function languageName(code) {
  return code === 'fr' ? 'French' : 'English';
}

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
