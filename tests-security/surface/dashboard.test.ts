import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { decodeJwtClaims } from '../_env';

/**
 * SURFACE — the admin / doctor dashboard shipped from `public/panel-x7k42m/`.
 *
 * This was missed in the original audit inventory: it is a privileged UI that
 * ships inside the Vercel deployment from this repository, not a separate
 * project. It is a static browser bundle, so anything it embeds is public.
 *
 * These are static-analysis assertions, not runtime ones — the point is that
 * a service-role key must never reach a browser bundle, and that the panel's
 * privilege must rest on RLS rather than on the URL being unguessable.
 */

const PANEL_DIR = path.resolve(__dirname, '../../public/panel-x7k42m');

function panelFiles(): { name: string; content: string }[] {
  return readdirSync(PANEL_DIR)
    .filter((f) => /\.(js|html|css)$/i.test(f))
    .map((name) => ({ name, content: readFileSync(path.join(PANEL_DIR, name), 'utf8') }));
}

/** Every JWT-looking token in the bundle. */
function embeddedJwts(content: string): string[] {
  return content.match(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g) ?? [];
}

describe('the dashboard is part of this repository', () => {
  it('ships from public/, so it is served by the web deployment', () => {
    const names = panelFiles().map((f) => f.name).sort();
    expect(names).toContain('app.js');
    expect(names).toContain('index.html');
  });
});

describe('no privileged credential may reach the browser bundle', () => {
  it('embeds no service_role key', () => {
    for (const { name, content } of panelFiles()) {
      for (const jwt of embeddedJwts(content)) {
        const claims = decodeJwtClaims(jwt);
        expect(
          claims?.role,
          `${name} embeds a JWT with role="${String(claims?.role)}" — only "anon" is permissible in a browser bundle`
        ).toBe('anon');
      }
    }
  });

  it('contains no literal service_role secret material', () => {
    for (const { name, content } of panelFiles()) {
      expect(content, `${name} references a service_role key`).not.toMatch(
        /service_role["'\s:=]+ey[A-Za-z0-9_-]/
      );
      expect(content, `${name} contains an sb_secret_ key`).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
    }
  });

  it('the embedded anon key is a publishable client credential, as expected', () => {
    const app = readFileSync(path.join(PANEL_DIR, 'app.js'), 'utf8');
    const jwts = embeddedJwts(app);
    expect(jwts.length).toBeGreaterThan(0);
    for (const jwt of jwts) {
      const claims = decodeJwtClaims(jwt);
      expect(claims?.role).toBe('anon');
    }
  });
});

describe('KNOWN-BAD BASELINE — the panel authorizes in the browser', () => {
  /**
   * KNOWN-BAD BASELINE — P15 (privileged UI accountability)
   *
   * The panel resolves the caller's role client-side (`role === 'admin'`,
   * `role !== 'doctor'`) to decide what to render. That is fine as UX and
   * worthless as a control: the real boundary is the RLS policy set, which the
   * `rls/` tests in this suite exercise directly.
   *
   * What is recorded here is that the panel's location is a secret
   * (`panel-x7k42m`) and its privilege is not separately gated — no second
   * factor, no server-side admin session, no audit trail of privileged reads.
   * Owning remediation: RU-9 (privileged accountability). NOT FIXED.
   */
  it('decides what to show from a client-side role comparison', () => {
    const app = readFileSync(path.join(PANEL_DIR, 'app.js'), 'utf8');
    expect(app).toMatch(/role\s*[=!]==\s*['"]admin['"]/);
    expect(app).toMatch(/role\s*[=!]==\s*['"]doctor['"]/);
  });

  it('is reachable at a fixed, unauthenticated path — obscurity is not a control', () => {
    // The directory name IS the access control today. Recorded so that any
    // future server-side gate is a visible change rather than an assumption.
    expect(PANEL_DIR.endsWith('panel-x7k42m')).toBe(true);
  });
});
