import { describe, expect, it } from 'vitest';

import { DEFAULT_EMERGENCY_NUMBER, emergencyNumberFor } from '@/services/emergencyNumber';

describe('C-09 — the emergency number follows the device region, not the language', () => {
  it('Morocco → SAMU 141, France → 15, Germany → 112', () => {
    expect(emergencyNumberFor('MA')).toBe('141');
    expect(emergencyNumberFor('FR')).toBe('15');
    expect(emergencyNumberFor('DE')).toBe('112');
  });

  it('French speakers outside France get their own country number', () => {
    expect(emergencyNumberFor('BE')).toBe('112');
    expect(emergencyNumberFor('CH')).toBe('144');
    expect(emergencyNumberFor('CA')).toBe('911');
  });

  it('the UK is 999, the US 911', () => {
    expect(emergencyNumberFor('GB')).toBe('999');
    expect(emergencyNumberFor('US')).toBe('911');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(emergencyNumberFor(' ma ')).toBe('141');
  });

  it('unknown, empty or missing regions fall back to 112', () => {
    expect(DEFAULT_EMERGENCY_NUMBER).toBe('112');
    for (const r of [null, undefined, '', 'ZZ', 'XX']) {
      expect(emergencyNumberFor(r)).toBe('112');
    }
  });
});
