/**
 * `.claude/easy-diff/config.json` — repo-level settings for the generated report, written
 * by `easy-diff init`. Currently a single field: the language the LLM should write its
 * report in. `templates/hooks/validate-language.cjs` reads this same file (independently,
 * as vanilla JS — see that file) to check the model actually complied.
 */

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export interface EasyDiffConfig {
  language: Language;
}

/** Validates and normalizes a user-supplied language; falls back to English if omitted. */
export function resolveLanguage(input: string | undefined): Language {
  if (input === undefined) return DEFAULT_LANGUAGE;
  const normalized = input.toLowerCase();
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(normalized)) {
    return normalized as Language;
  }
  throw new Error(
    `Unsupported language "${input}". Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}.`
  );
}

export function buildConfig(language: Language): EasyDiffConfig {
  return { language };
}
