export function formatCostShare(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-TR" : "tr-TR", {
    style: "currency",
    currency: "TRY",
    // "symbol" (the default) renders as the "TRY" code in the ar-TR locale
    // data — "narrowSymbol" is what actually resolves to "₺" in both locales.
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(amount)
}
