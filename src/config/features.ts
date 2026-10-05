/**
 * BUILD-TIME FEATURE SWITCHES.
 *
 * Read from EXPO_PUBLIC_* variables, which Expo inlines at build time — so a
 * switch is set per EAS build profile (eas.json → env) or per Vercel
 * environment, and a store build can ship without a feature that stays on in
 * development.
 */

/**
 * The insulin bolus calculator (store audit B-01).
 *
 * Apple guideline 1.4.1 only accepts drug-dose calculators from a
 * manufacturer, hospital, university, pharmacy or with regulatory clearance.
 * The owner chose to keep the calculator and submit it; this switch is the
 * fallback if App Review refuses it: build with
 * `EXPO_PUBLIC_BOLUS_CALCULATOR=off` and every way into the calculator — the
 * home chip, the + menu, the insulin page card, the food list, insights, the
 * programme's "my dose" button — disappears, and the route itself refuses to
 * open. Insulin LOGGING is untouched.
 */
export const BOLUS_CALCULATOR_ENABLED = process.env.EXPO_PUBLIC_BOLUS_CALCULATOR !== 'off';
