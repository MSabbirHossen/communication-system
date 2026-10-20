# @cs/design-tokens

Foundations of the design system, transcribed from `docs/UI_UX_BRIEF.md` §4 (color, typography, shape and spacing) and §8 (breakpoints). `tokens.json` is the only file to edit; `pnpm build` regenerates `dist/`.

## Outputs

- `dist/tokens.css`: CSS custom properties prefixed `--cs-`. Light values on `:root`, dark values under `[data-theme="dark"]` and, when no theme is forced, under `prefers-color-scheme: dark`.
- `dist/tokens.js` + `dist/tokens.d.ts`: the same tokens as a typed object (`tokens`), the variable names (`cssVars`) and the `Theme` type.

## Rules

- Components use the semantic color names only (`--cs-color-text`, `--cs-color-surface`, `--cs-color-danger`, …), never raw hex values.
- `accent` fails AA for white text; it is for highlights, never for text or buttons with text.
- Color is never the only carrier of a state (brief §4.2); pair with an icon or label.

## What is derived (needs design review)

The brief defines light-theme colors and three dark-theme colors. The remaining dark values (`surfaceRaised`, `textMuted`, `border`, `primaryText`, `accent`, `success`, `warning`, `danger`, `focus`) and `onPrimary` are marked `"derived": true` in `tokens.json`. They were chosen so the contrast tests in `src/tokens.test.ts` pass WCAG 2.2 AA (4.5:1 for text, 3:1 for focus rings and borders) in both themes.

## Tests

`pnpm test` checks palette completeness, 4px spacing, breakpoints, AA contrast for every text/background pair in both themes, and that the generated CSS and JS contain every token.
