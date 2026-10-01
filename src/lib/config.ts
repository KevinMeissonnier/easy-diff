import fs from 'node:fs';

/**
 * `config-easy-diff.json` at the repo root (gitignored, per developer), written by
 * `easy-diff init`. A single `language` drives both the LLM-written prose (`generate`
 * injects it into the prompt and passes it to `templates/hooks/validate-language.cjs`, which
 * checks the model actually complied) and the report viewer's static UI labels.
 */

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'fr';

export interface EasyDiffConfig {
  language: Language;
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

export function buildConfig(language: Language): EasyDiffConfig {
  return { language };
}

/** Fails open to the default on anything missing, unreadable or invalid. */
export function readConfig(configFile: string): EasyDiffConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    raw = {};
  }
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).language : undefined;
  const language = (SUPPORTED_LANGUAGES as readonly unknown[]).includes(value) ? (value as Language) : DEFAULT_LANGUAGE;
  return { language };
}
