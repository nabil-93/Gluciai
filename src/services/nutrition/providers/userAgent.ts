/**
 * THE IDENTITY OPEN FOOD FACTS REQUIRES (finding F-2).
 *
 * OFF's API documentation states a custom User-Agent is MANDATORY for every
 * call, in the form `AppName/Version (contact)`, and that unidentified traffic
 * is blocked. The `food-search` edge function has always sent one; the
 * device-side calls in `barcodeLookup.ts` and `openfoodfacts.ts` sent none —
 * so every barcode scan and every product search made from a phone was
 * anonymous traffic against a service that blocks exactly that.
 *
 * WHY IT STAYS ON THE DEVICE. OFF rate-limits per IP (15 req/min for product
 * reads, 10/min for search). Device calls use each patient's own IP, which
 * fits those limits naturally; routing them through an edge function would put
 * the ENTIRE user base behind one egress IP and share a single 15/min budget.
 * The correct fix is to identify the traffic, not to move it.
 *
 * The string is deliberately identical to the one the edge function sends
 * (`supabase/functions/food-search/index.ts`), so OFF sees one application
 * rather than two, and abuse from either path is attributable to us.
 *
 * NOTE ON `fetch` ON REACT NATIVE: a custom User-Agent header IS honoured on
 * iOS and Android. On web the browser owns the header and silently drops this
 * one — which is correct and harmless, because a browser request already
 * carries the user's own identifying UA and comes from their own IP.
 */

/** Kept in step with `app.json`'s `expo.version`. */
const APP_VERSION = '1.0.0';

/** `AppName/Version (contact)` — the format OFF documents. */
export const OFF_USER_AGENT = `GluciAI/${APP_VERSION} (diabetes education app; contact: support@gluciai.app)`;

/** Headers every device-side Open Food Facts request must carry. */
export const OFF_HEADERS: Record<string, string> = {
  'User-Agent': OFF_USER_AGENT,
};
