import fs from 'node:fs';

/**
 * `config-easy-diff.json` at the repo root (gitignored, per developer), written by
 * `easy-diff init`. Two independent fields, both `Language`:
 * - `language`: the language the LLM writes the report's prose in. `generate` injects it
 *   into the prompt and passes it to `templates/hooks/validate-language.cjs`, which checks
 *   the model actually complied.
 * - `reportLanguage`: the language of the report *viewer*'s own static UI (buttons,
 *   headings, etc. in `templates/report/`) — not model output at all, so nothing checks
 *   compliance for it. Defaults to English; edit the file by hand to change it.
 */

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export interface EasyDiffConfig {
  language: Language;
  reportLanguage: Language;
}

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

export function buildConfig(language: Language, reportLanguage: Language = DEFAULT_LANGUAGE): EasyDiffConfig {
  return { language, reportLanguage };
}

/** Fails open, field by field, to the default on anything missing, unreadable or invalid. */
export function readConfig(configFile: string): EasyDiffConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    raw = {};
  }
  const pick = (field: keyof EasyDiffConfig): Language => {
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[field] : undefined;
    return (SUPPORTED_LANGUAGES as readonly unknown[]).includes(value) ? (value as Language) : DEFAULT_LANGUAGE;
  };
  return { language: pick('language'), reportLanguage: pick('reportLanguage') };
}
