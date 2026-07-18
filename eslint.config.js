// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // `src/_legacy` is unrouted dead code kept only for reference — linting
    // it just buries real diagnostics from shipping screens.
    ignores: ["dist/*", "src/_legacy/*"],
  },
  {
    rules: {
      // `react-hooks/refs` flags every React Native `Animated.Value` stored
      // in a useRef and passed to interpolate()/timing() during render. That
      // is THE documented RN Animated pattern (the rule targets DOM refs), so
      // in this codebase the rule is ~170 false positives drowning real
      // issues. Real ref misuse still surfaces through `react-hooks/purity`
      // and review.
      'react-hooks/refs': 'off',
      // French/Arabic copy in JSX is full of apostrophes and quotes; escaping
      // them everywhere hurts readability and brings no safety.
      'react/no-unescaped-entities': 'off',
    },
  },
  {
    // i18next is driven through its initialized default instance
    // (i18n.use(...), i18n.changeLanguage(...), i18next.t(...)) — the
    // named-export alternative this rule suggests is not what we want.
    files: ['src/i18n/index.ts', 'src/services/reminders.ts'],
    rules: {
      'import/no-named-as-default-member': 'off',
    },
  },
]);
