import fs from 'node:fs';

/**
 * `.claude/easy-diff/config.json` — repo-level settings for the generated report, written
 * by `easy-diff init`. Two independent fields, both `Language`:
 * - `language`: the language the LLM should write the report's prose in.
 *   `templates/hooks/validate-language.cjs` reads this same file (independently, as
 *   vanilla JS — see that file) to check the model actually complied.
 * - `reportLanguage`: the language of the report *viewer*'s own static UI (buttons,
 *   headings, etc. in `templates/report/`) — not model output at all, so nothing checks
 *   compliance for it. Defaults to English; edit `config.json` by hand to change it.
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

/**
 * Reads `reportLanguage` back out of `config.json` for `easy-diff generate` to pass into
 * the rendered report. Fails open to the default on anything missing/unreadable/invalid —
 * same policy as `validate-language.cjs`'s `readConfiguredLanguage`, kept independent of it.
 */
export function readReportLanguage(configFile: string): Language {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (
      raw &&
      typeof raw === 'object' &&
      (SUPPORTED_LANGUAGES as readonly string[]).includes((raw as { reportLanguage?: unknown }).reportLanguage as string)
    ) {
      return (raw as { reportLanguage: Language }).reportLanguage;
    }
  } catch {}
  return DEFAULT_LANGUAGE;
}
