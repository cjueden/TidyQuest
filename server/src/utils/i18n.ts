import fs from 'fs';
import path from 'path';

/**
 * The app's own translations (client/src/i18n/<lang>.json, also copied into the Docker image), so
 * server messages like notifications use the same words, in each person's language.
 * From server/src/utils and server/dist/utils alike, ../../../ is the app root.
 */
const I18N_DIR = path.join(__dirname, '..', '..', '..', 'client', 'src', 'i18n');
export const LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'nl'];

const cache = new Map<string, Record<string, Record<string, string>>>();

function strings(lang: string): Record<string, Record<string, string>> {
  if (!cache.has(lang)) {
    try {
      cache.set(lang, JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf-8')).ui ?? {});
    } catch {
      cache.set(lang, {});
    }
  }
  return cache.get(lang)!;
}

/** "section.key" in `lang` (falls back to English, then the key), with {name} placeholders filled. */
export function tr(lang: string | null | undefined, key: string, vars: Record<string, string | number> = {}): string {
  const [section, ...rest] = key.split('.');
  const k = rest.join('.');
  const language = lang && LANGUAGES.includes(lang) ? lang : 'en';
  const text = strings(language)[section]?.[k] ?? strings('en')[section]?.[k] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
