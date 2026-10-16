/** Coin amounts with thousands separators (999999999 -> 999,999,999), in the viewer's language. */
export function formatCoins(n: number | null | undefined, locale?: string): string {
  return Number(n ?? 0).toLocaleString(locale);
}
