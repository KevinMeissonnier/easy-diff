import type { Analysis } from './analysis.ts';

/**
 * The plugin's `language` option (`userConfig` in `.claude-plugin/plugin.json`) drives both
 * the prose the agent writes and the report viewer's static labels. The prompt asks for it,
 * but nothing stops the model from ignoring it, so `detectLanguageMismatch` checks the
 * written analysis before the agent's turn may end.
 */

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'fr';

/**
 * The plugin's `language` option as the skill passes it. An option the user never set (a
 * shell `claude plugin install`, `--plugin-dir`) is not replaced by its `default`: the skill
 * receives the literal `${user_config.language}` placeholder, which means the default here.
 */
export function languageOption(raw: string | undefined): Language {
  return raw?.startsWith('${') ? DEFAULT_LANGUAGE : resolveLanguage(raw);
}

export function resolveLanguage(input: string | undefined): Language {
  if (input === undefined || input === '') return DEFAULT_LANGUAGE;
  const normalized = input.toLowerCase();
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)) {
    return normalized as Language;
  }
  throw new Error(
    `Unsupported language "${input}". Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}.`
  );
}

// Below this many stopword matches either way, there isn't enough text to judge.
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

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', fr: 'French' };

export function languageName(language: Language): string {
  return LANGUAGE_NAMES[language];
}

/**
 * A stopword-frequency heuristic, not real language detection. Returns why the prose reads as
 * the wrong language, or null when it matches or there's too little text to tell.
 */
export function detectLanguageMismatch(analysis: Analysis, expected: Language): string | null {
  const combined = collectProse(analysis).join('\n').toLowerCase();
  const frScore = countMatches(combined, FR_WORDS);
  const enScore = countMatches(combined, EN_WORDS);

  if (frScore + enScore < MIN_SIGNAL) return null;
  const actual: Language = enScore > frScore ? 'en' : frScore > enScore ? 'fr' : expected;
  if (actual === expected) return null;
  return (
    `expected ${languageName(expected)} but the text reads as ${languageName(actual)} ` +
    `(fr signal: ${frScore}, en signal: ${enScore})`
  );
}

/** Every prose field a reviewer actually reads — not ids, paths, enums, or line numbers. */
function collectProse(analysis: Analysis): string[] {
  const { merge_request, overview } = analysis;
  const texts = [merge_request.title, overview.what, overview.why, overview.mental_model, overview.risks];
  for (const decision of overview.decisions) texts.push(decision.choice, decision.reason);
  for (const step of analysis.steps) {
    texts.push(step.title, step.narrative);
    for (const file of step.files) {
      if (file.why) texts.push(file.why);
      for (const hunk of file.hunks) {
        if (hunk.note) texts.push(hunk.note);
        for (const watchpoint of hunk.watchpoints ?? []) texts.push(watchpoint.note);
      }
    }
  }
  return texts;
}

function countMatches(text: string, words: string[]): number {
  let count = 0;
  for (const word of words) {
    count += text.match(new RegExp(`\\b${word}\\b`, 'gu'))?.length ?? 0;
  }
  return count;
}
