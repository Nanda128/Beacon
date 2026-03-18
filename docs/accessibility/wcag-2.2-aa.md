# Beacon WCAG 2.2 AA Accessibility Evidence

This project now includes a repeatable contrast audit that validates both themes against WCAG thresholds.

## 1) Contrast proof (WCAG 2.2)

Run:

```bash
npm run a11y:contrast
```

The script in `scripts/contrast-audit.mjs` checks theme-token pairs and writes evidence to `reports/contrast-report.json`.

Current measured minimums from the report:

- **SC 1.4.3 Contrast (Minimum)** (normal text >= 4.5:1)
  - Light theme minimum text ratio: **4.63:1** (`muted-text`)
  - Dark theme minimum text ratio: **6.36:1** (`muted-on-raised`)
- **SC 1.4.11 Non-text Contrast** (UI/focus/boundaries >= 3:1)
  - Light theme minimum UI ratio: **3.65:1** (`panel-border`)
  - Dark theme minimum UI ratio: **3.18:1** (`panel-border`)

Because all audited pairs pass, the contrast gate exits successfully and can be used in CI.

## 2) Additional WCAG standards covered

The app also includes accommodations beyond minimum contrast:

- **SC 2.4.1 Bypass Blocks**
  - Keyboard-first skip link in `src/index.css` (`.skip-link`) to jump past repeated navigation.
- **SC 2.4.7 Focus Visible**
  - Global focus styling in `src/index.css` (`*:focus-visible`) and control-specific focus rings.
- **SC 1.4.11 Non-text Contrast**
  - Focus ring and control boundaries use tokens that now clear 3:1 in both themes.
- **SC 1.4.3 Contrast (Minimum)**
  - Updated muted/success/warning text tokens to clear 4.5:1 in light mode.
- **SC 1.4.6 Contrast (Enhanced) tracking (informational)**
  - Many dark-theme text pairs exceed AAA-level contrast; the audit report captures exact ratios.
- **SC 1.4.8/1.4.13 user preference support (practical support)**
  - `@media (prefers-contrast: more)` and `@media (forced-colors: active)` overrides in `src/index.css`.

## 3) Files changed for accessibility hardening

- `scripts/contrast-audit.mjs` - automated contrast calculator and pass/fail gate.
- `reports/contrast-report.json` - generated evidence artifact.
- `src/theme/tokens.ts` - token updates for text and non-text contrast.
- `src/index.css` - default token alignment, stronger acknowledged-alert readability, high-contrast and forced-colors support.
- `package.json` - new `a11y:contrast` script.

## 4) Recommended next step

Add `npm run a11y:contrast` to CI so every PR must preserve AA contrast compliance.

