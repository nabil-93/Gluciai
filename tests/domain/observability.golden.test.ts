import { describe, expect, it } from 'vitest';

import {
  REDACTED,
  hasQuery,
  observabilityOptions,
  scrubBreadcrumb,
  scrubDeep,
  scrubEvent,
  scrubText,
  scrubUrl,
} from '@/lib/observability';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

/**
 * PRIVACY GATE — crash reporting.
 *
 * Every value below is SYNTHETIC and deliberately implausible (weight 999 kg,
 * glucose 1234 mg/dL, a structurally-valid but meaningless JWT). No real
 * patient data appears here, and no test transmits anything: these exercise
 * pure functions.
 *
 * If one of these fails, the correct response is to fix the scrubber — never
 * to relax the assertion. This suite is what makes "we do not send health
 * data" a checked property rather than an intention.
 */

/** Structurally a JWT, cryptographically meaningless. */
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXRlc3Qtb25seSJ9.ZmFrZS1zaWduYXR1cmU';

describe('scrubUrl', () => {
  it('drops the query string', () => {
    expect(scrubUrl('/program?weight=999&targetWeight=888')).toBe('/program');
  });

  it('drops the fragment', () => {
    expect(scrubUrl('/day#glucose=1234')).toBe('/day');
  });

  it('leaves a clean path untouched', () => {
    expect(scrubUrl('/bolus')).toBe('/bolus');
    expect(scrubUrl('https://example.test/a/b')).toBe('https://example.test/a/b');
  });
});

describe('scrubText', () => {
  it('redacts a JWT', () => {
    expect(scrubText(`token=${FAKE_JWT}`)).not.toContain('eyJ');
    expect(scrubText(`token=${FAKE_JWT}`)).toContain(REDACTED);
  });

  it('redacts publishable and secret keys', () => {
    expect(scrubText('sb_secret_ABC123xyz')).toBe(REDACTED);
    expect(scrubText('sb_publishable_ABC123xyz')).toBe(REDACTED);
  });

  it('redacts an Authorization bearer value', () => {
    expect(scrubText('Authorization: Bearer abc.def.ghi')).toContain(REDACTED);
  });

  it('strips the query string from an embedded project URL', () => {
    const out = scrubText('failed GET https://exampleref.supabase.co/rest/v1/glucose_logs?value=1234');
    expect(out).not.toContain('1234');
    expect(out).not.toContain('?');
  });

  it('truncates very long text', () => {
    expect(scrubText('x'.repeat(900)).length).toBeLessThanOrEqual(501);
  });

  it('leaves ordinary developer text intact', () => {
    expect(scrubText("Cannot read property 'x' of undefined")).toBe(
      "Cannot read property 'x' of undefined"
    );
  });
});

describe('scrubDeep — sensitive keys', () => {
  it.each([
    'glucose',
    'currentGlucose',
    'blood_sugar',
    'hba1c',
    'dose',
    'editDose',
    'insulin_logs',
    'iob',
    'bolusTotal',
    'carb_ratio',
    'correctionFactor',
    'carbs',
    'mealName',
    'foodItems',
    'weight',
    'targetWeight',
    'height',
    'bmi',
    'birth_date',
    'diabetes_type',
    'labResults',
    'email',
    'phone',
    'user_id',
    'patientName',
    'doctor_id',
    'promo_code',
    'access_token',
    'apiKey',
    'secret',
    'password',
    'chatMessage',
    'transcript',
    'note',
  ])('redacts the value under %s', (key) => {
    const out = scrubDeep({ [key]: 'SENSITIVE-SYNTHETIC-VALUE' }) as Record<string, unknown>;
    expect(out[key]).toBe(REDACTED);
  });

  it('keeps structural diagnostic keys', () => {
    const out = scrubDeep({
      environment: 'development',
      release: '1.0.0',
      platform: 'web',
      boundary: 'clinical',
      level: 'error',
    }) as Record<string, unknown>;
    expect(out).toEqual({
      environment: 'development',
      release: '1.0.0',
      platform: 'web',
      boundary: 'clinical',
      level: 'error',
    });
  });

  it('redacts nested values', () => {
    const out = scrubDeep({ a: { b: { glucose: 1234 } } }) as any;
    expect(out.a.b.glucose).toBe(REDACTED);
  });

  it('walks arrays', () => {
    const out = scrubDeep([{ dose: 88.8 }, { safe: 'ok' }]) as any[];
    expect(out[0].dose).toBe(REDACTED);
    expect(out[1].safe).toBe('ok');
  });

  it('stops at a depth limit rather than recursing forever', () => {
    let deep: any = { safe: 'bottom' };
    for (let i = 0; i < 12; i += 1) deep = { nest: deep };
    expect(JSON.stringify(scrubDeep(deep))).toContain(REDACTED);
  });

  it('does not forward functions', () => {
    const out = scrubDeep({ fn: () => 'x' }) as Record<string, unknown>;
    expect(out.fn).toBe(REDACTED);
  });
});

describe('scrubBreadcrumb — navigation fails closed', () => {
  /**
   * The reason this rule exists: program-setup.tsx navigates to `/program`
   * with the patient's body weight, target weight and dietary constraints in
   * the params. Rather than decide which params are safe, any navigation
   * breadcrumb carrying a query string is dropped outright.
   */
  it('drops a navigation crumb whose destination carries params', () => {
    const crumb: Breadcrumb = {
      category: 'navigation',
      data: { from: '/program-setup', to: '/program?create=1&weight=999&targetWeight=888' },
    };
    expect(scrubBreadcrumb(crumb)).toBeNull();
  });

  it('drops it when the ORIGIN carries params', () => {
    const crumb: Breadcrumb = {
      category: 'navigation',
      data: { from: '/day?date=2026-01-15', to: '/home' },
    };
    expect(scrubBreadcrumb(crumb)).toBeNull();
  });

  it('keeps a clean navigation crumb', () => {
    const crumb: Breadcrumb = {
      category: 'navigation',
      data: { from: '/home', to: '/bolus' },
    };
    const out = scrubBreadcrumb(crumb);
    expect(out).not.toBeNull();
    expect((out!.data as any).to).toBe('/bolus');
  });

  it('scrubs sensitive data on a non-navigation crumb', () => {
    const crumb: Breadcrumb = {
      category: 'touch',
      data: { glucose: 1234, componentName: 'DoseHero' },
    };
    const out = scrubBreadcrumb(crumb)!;
    expect((out.data as any).glucose).toBe(REDACTED);
  });

  it('returns null for a null crumb', () => {
    expect(scrubBreadcrumb(null)).toBeNull();
  });
});

describe('scrubEvent', () => {
  const baseEvent = (): ErrorEvent =>
    ({
      message: 'boom',
      user: { id: 'auth-user-uuid', email: 'patient@example.test' },
      request: {
        url: '/program?weight=999',
        query_string: 'weight=999',
        headers: { Authorization: `Bearer ${FAKE_JWT}` },
        data: { glucose: 1234 },
      },
      extra: { editDose: 88.8, safeCounter: 3 },
      tags: { boundary: 'clinical', patientName: 'Synthetic Person' },
      contexts: { app: { app_version: '1.0.0' }, meal: { carbs: 777 } },
      breadcrumbs: [
        { category: 'navigation', data: { to: '/program?weight=999' } },
        { category: 'navigation', data: { to: '/bolus' } },
      ],
      exception: {
        values: [{ type: 'Error', value: `failed with token ${FAKE_JWT}` }],
      },
    }) as unknown as ErrorEvent;

  it('removes user identity entirely', () => {
    const out = scrubEvent(baseEvent())!;
    expect(out.user).toBeUndefined();
  });

  it('strips the request query string, headers and body', () => {
    const out = scrubEvent(baseEvent())!;
    const req = out.request as Record<string, unknown>;
    expect(req.url).toBe('/program');
    expect(req.query_string).toBeUndefined();
    expect(req.headers).toBeUndefined();
    expect(req.data).toBeUndefined();
  });

  it('redacts sensitive extra and tag values but keeps safe ones', () => {
    const out = scrubEvent(baseEvent())!;
    expect((out.extra as any).editDose).toBe(REDACTED);
    expect((out.extra as any).safeCounter).toBe(3);
    expect((out.tags as any).patientName).toBe(REDACTED);
    expect((out.tags as any).boundary).toBe('clinical');
  });

  it('redacts sensitive contexts', () => {
    const out = scrubEvent(baseEvent())!;
    expect((out.contexts as any).meal).toBe(REDACTED);
    expect((out.contexts as any).app.app_version).toBe('1.0.0');
  });

  it('drops the navigation breadcrumb with params and keeps the clean one', () => {
    const out = scrubEvent(baseEvent())!;
    expect(out.breadcrumbs).toHaveLength(1);
    expect((out.breadcrumbs![0].data as any).to).toBe('/bolus');
  });

  it('scrubs a credential out of the exception message', () => {
    const out = scrubEvent(baseEvent())!;
    const value = out.exception!.values![0].value!;
    expect(value).not.toContain('eyJ');
    expect(value).toContain(REDACTED);
  });

  it('leaks no synthetic sensitive value anywhere in the serialized event', () => {
    // The catch-all: whatever the structure, none of these may survive.
    const serialized = JSON.stringify(scrubEvent(baseEvent()));
    for (const forbidden of ['999', '1234', '88.8', '777', 'patient@example.test', 'auth-user-uuid', 'eyJ']) {
      expect(serialized, `"${forbidden}" survived scrubbing`).not.toContain(forbidden);
    }
  });

  it('returns null for a null event', () => {
    expect(scrubEvent(null)).toBeNull();
  });
});

describe('observabilityOptions — transmission is off by default', () => {
  it('is DISABLED when no DSN is configured', () => {
    expect(observabilityOptions({ dsn: '', isDev: false }).enabled).toBe(false);
  });

  it('is DISABLED in development even if a DSN were present', () => {
    expect(observabilityOptions({ dsn: 'https://fake@example.test/1', isDev: true }).enabled).toBe(
      false
    );
  });

  it('would only enable with a DSN outside development', () => {
    expect(observabilityOptions({ dsn: 'https://fake@example.test/1', isDev: false }).enabled).toBe(
      true
    );
  });

  it('never sends default PII and never samples traces', () => {
    const o = observabilityOptions({ dsn: 'https://fake@example.test/1', isDev: false });
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0);
  });

  it('always installs both scrubbers, including in development', () => {
    const dev = observabilityOptions({ dsn: '', isDev: true });
    expect(dev.beforeSend).toBe(scrubEvent);
    expect(dev.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });

  it('tags the environment', () => {
    expect(observabilityOptions({ dsn: '', isDev: true }).environment).toBe('development');
    expect(observabilityOptions({ dsn: '', isDev: false, environment: 'preview' }).environment).toBe(
      'preview'
    );
  });
});

describe('hasQuery', () => {
  it('detects query and fragment markers', () => {
    expect(hasQuery('/a?b=c')).toBe(true);
    expect(hasQuery('/a#b')).toBe(true);
    expect(hasQuery('/a')).toBe(false);
    expect(hasQuery(undefined)).toBe(false);
  });
});
