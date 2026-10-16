/** The app's languages mapped to locales for dates and numbers. */
const LOCALES: Record<string, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', nl: 'nl-NL' };

export function localeFor(language?: string | null): string {
  return LOCALES[language || 'en'] || 'en-US';
}
