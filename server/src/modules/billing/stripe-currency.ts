/**
 * Stripe currency helpers. Most currencies use a minor unit (cents → divide by
 * 100), but zero-decimal currencies (VND, JPY, KRW, ...) express amounts in the
 * whole unit, so no scaling applies.
 * See: https://docs.stripe.com/currencies#zero-decimal
 */
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase());
}

/** Convert a human amount (e.g. 990000 VND, 9.99 USD) to Stripe's `unit_amount`. */
export function toMinorUnit(amount: number, currency: string): number {
  return isZeroDecimal(currency)
    ? Math.round(amount)
    : Math.round(amount * 100);
}

/** Convert a Stripe minor-unit amount back to the human amount. */
export function fromMinorUnit(minor: number, currency: string): number {
  return isZeroDecimal(currency) ? minor : minor / 100;
}
