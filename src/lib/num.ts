/**
 * Decimal-aware number entry, used by every numeric input in the app.
 *
 * Two problems this solves, both of which matter for insulin:
 *  1. A patient's dose is very often a half unit (4.5 U, 0.5 U). The field must
 *     accept a decimal point — and, since Moroccan / French keyboards produce a
 *     COMMA, both "4,5" and "4.5" have to work.
 *  2. Parsing with the bare `Number()` returns NaN for "4,5", silently turning a
 *     real dose into nothing. Every parse goes through `parseDecimal` so the
 *     comma is honoured instead of dropped.
 */

/** Keep only digits and a single decimal separator while the user types.
 *  Leaves the comma the patient entered in place (don't convert on each
 *  keystroke, or the caret jumps); conversion happens at parse time. */
export function sanitizeDecimal(input: string): string {
  return input
    .replace(/[^0-9.,]/g, '') // digits + separators only
    .replace(/([.,]).*?([.,])/g, '$1') // collapse a second separator
    .replace(/([.,])(?=.*[.,])/g, ''); // …and any further ones
}

/** Parse a possibly-comma-decimal string to a number, or `undefined` if it
 *  isn't a finite number. Does NOT enforce sign or range — callers decide. */
export function parseDecimal(input: string | null | undefined): number | undefined {
  if (input == null) return undefined;
  const n = parseFloat(String(input).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a strictly-positive quantity (a dose, a ratio, a weight): the value
 *  must be a finite number greater than zero, else `undefined`. */
export function parsePositive(input: string | null | undefined): number | undefined {
  const n = parseDecimal(input);
  return n != null && n > 0 ? n : undefined;
}
