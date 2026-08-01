import { describe, expect, it } from 'vitest';

import { parseDecimal, parsePositive, sanitizeDecimal } from '@/lib/num';

/**
 * CHARACTERIZATION — `lib/num`.
 *
 * Every numeric field in the app (insulin dose, glucose, carbs, weight, ratios)
 * parses through these helpers. Records what they do today.
 *
 * PARSING and DISPLAY are separate concerns: a locale that DISPLAYS "1,5" does
 * not imply the parser accepts it. Both directions are characterized explicitly.
 */

describe('parseDecimal — accepted forms', () => {
  it('parses a dot decimal', () => {
    expect(parseDecimal('12.5')).toBe(12.5);
  });

  it('parses a comma decimal by rewriting the first comma to a dot', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('1,5')).toBe(1.5);
  });

  it('parses a plain integer', () => {
    expect(parseDecimal('12')).toBe(12);
    expect(parseDecimal('0')).toBe(0);
  });

  it('tolerates surrounding whitespace (parseFloat skips leading space)', () => {
    expect(parseDecimal('  12.5')).toBe(12.5);
    expect(parseDecimal('12.5  ')).toBe(12.5);
  });

  it('accepts an explicit plus sign', () => {
    expect(parseDecimal('+5')).toBe(5);
  });

  it('does NOT enforce sign — a negative parses through', () => {
    // Documented in the source: "Does NOT enforce sign or range — callers decide."
    expect(parseDecimal('-5')).toBe(-5);
  });

  it('accepts scientific notation', () => {
    expect(parseDecimal('1e3')).toBe(1000);
  });

  it('accepts trailing non-numeric characters, keeping the leading number', () => {
    expect(parseDecimal('12abc')).toBe(12);
    expect(parseDecimal('12.5 g')).toBe(12.5);
  });

  it('returns negative zero for "-0"', () => {
    // `toBe` is Object.is-based, so -0 and +0 are distinguishable here.
    const r = parseDecimal('-0');
    expect(Object.is(r, -0)).toBe(true);
    expect(r === 0).toBe(true); // loose numeric equality still holds
  });
});

describe('parseDecimal — rejected forms', () => {
  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['letters', 'abc'],
    ['the literal NaN', 'NaN'],
    ['the literal Infinity', 'Infinity'],
    ['the literal -Infinity', '-Infinity'],
    ['a lone separator', '.'],
    ['a lone comma', ','],
  ])('returns undefined for %s', (_label, input) => {
    expect(parseDecimal(input)).toBeUndefined();
  });

  it('returns undefined for null and undefined', () => {
    expect(parseDecimal(null)).toBeUndefined();
    expect(parseDecimal(undefined)).toBeUndefined();
  });
});

describe('parseDecimal — separator edge cases', () => {
  /**
   * KNOWN-BAD BASELINE — P16-006
   * Only the FIRST comma is rewritten, so a thousands-grouped string is
   * truncated rather than rejected: "1,234.5" becomes "1.234.5", which
   * parseFloat reads as 1.234. A four-digit entry silently becomes ~1.
   * Owning remediation: RU-4 (numeric contract) / RU-12 (locale input).
   */
  it('KNOWN-BAD BASELINE — P16-006: a thousands-separated value is silently truncated', () => {
    expect(parseDecimal('1,234.5')).toBe(1.234);
    expect(parseDecimal('1,234')).toBe(1.234);
  });

  it('takes the leading number when two dot separators appear', () => {
    expect(parseDecimal('1.2.3')).toBe(1.2);
  });
});

describe('parseDecimal — non-Latin digits', () => {
  /**
   * KNOWN-BAD BASELINE — P16-006
   * Arabic is a supported UI language, but `parseFloat` does not understand
   * Arabic-Indic digits, so a value typed on an Arabic keypad parses to
   * undefined and the field reads as empty. Owning remediation: RU-12.
   */
  it('KNOWN-BAD BASELINE — P16-006: Arabic-Indic digits are not parseable', () => {
    expect(parseDecimal('٥')).toBeUndefined();
    expect(parseDecimal('١٢٫٥')).toBeUndefined();
    expect(parseDecimal('٠١٢٣٤٥٦٧٨٩')).toBeUndefined();
  });

  it('KNOWN-BAD BASELINE — P16-006: Eastern Arabic / Persian digits are not parseable', () => {
    expect(parseDecimal('۵')).toBeUndefined();
    expect(parseDecimal('۰۱۲۳۴۵۶۷۸۹')).toBeUndefined();
  });

  it('KNOWN-BAD BASELINE — P16-006: a mixed Arabic-digit and Latin-separator string is not parseable', () => {
    expect(parseDecimal('١٢,٥')).toBeUndefined();
  });
});

describe('sanitizeDecimal — keystroke filtering', () => {
  it('keeps digits and a single separator, preserving the comma as typed', () => {
    expect(sanitizeDecimal('12,5')).toBe('12,5');
    expect(sanitizeDecimal('12.5')).toBe('12.5');
  });

  it('strips a minus sign, so a negative cannot be typed into a sanitized field', () => {
    expect(sanitizeDecimal('-5')).toBe('5');
  });

  it('strips letters and symbols', () => {
    expect(sanitizeDecimal('12abc')).toBe('12');
    expect(sanitizeDecimal('abc')).toBe('');
    expect(sanitizeDecimal('$12.5')).toBe('12.5');
  });

  it('collapses repeated separators to one', () => {
    expect(sanitizeDecimal('1,2,3')).toBe('1,3');
    expect(sanitizeDecimal('1.2.3')).toBe('1.3');
  });

  it('leaves an empty string empty', () => {
    expect(sanitizeDecimal('')).toBe('');
  });

  it('strips Arabic-Indic digits entirely (they are not in [0-9])', () => {
    // Consequence of the same gap as P16-006: the character never reaches the
    // parser because the keystroke filter removes it first.
    expect(sanitizeDecimal('١٢')).toBe('');
  });
});

describe('parsePositive — strictly positive gate', () => {
  it('accepts a positive value', () => {
    expect(parsePositive('5')).toBe(5);
    expect(parsePositive('0.1')).toBe(0.1);
    expect(parsePositive('4,5')).toBe(4.5);
  });

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['negative zero', '-0'],
    ['letters', 'abc'],
    ['empty', ''],
    ['Infinity', 'Infinity'],
  ])('rejects %s', (_label, input) => {
    expect(parsePositive(input)).toBeUndefined();
  });

  it('rejects null and undefined', () => {
    expect(parsePositive(null)).toBeUndefined();
    expect(parsePositive(undefined)).toBeUndefined();
  });
});
