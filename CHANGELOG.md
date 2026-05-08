# Changelog

All notable changes to **FavouriteTimezones** are documented here. Entries reflect the current work on the `weather` branch (staged changes as of 2026-05-08).

## [Unreleased]

### US timezone card: “Freedom units” weather temperature

- Cards with the class `clock-card--us` show the fetched temperature converted from Celsius to Fahrenheit and labeled **Freedom units** (playful copy instead of °F).
- Other cards continue to show rounded Celsius with the `°C` suffix.
- The weather line uses HTML for the US case (`<strong>` for the number and a `clock-freedom-units-label` span) so the label can be styled separately.
- Screen readers get plain text via `formatTemperatureAria` so `aria-label` strings are not polluted with markup.

**CSS**

- `.clock-freedom-units-label`: bold, full-size text, accent color (`var(--lemon-custard)`).

**Code**

- `celsiusToFahrenheit(c)`
- `formatTemperature(tempC, freedomUnits)`
- `formatTemperatureAria(tempC, freedomUnits)`
- `fetchWeatherForCard` sets `freedomUnits` from `card.classList.contains("clock-card--us")` and wires `tempHtml` / `tempAria` into the DOM and ARIA string.

### US flag: interactive fireworks (canvas overlay)

- The flag badge inside `.clock-card--us` (`.flag-badge`) is keyboard- and pointer-activated: click or **Enter** / **Space** launches a short fireworks animation.
- Bursts are drawn on a full-viewport `<canvas class="fireworks-canvas">` appended to `document.body`, positioned with `fixed` + high `z-index`, `pointer-events: none` so it does not block the UI.
- Origin uses the flag’s bounding rect; additional bursts are timed across the viewport for a fuller effect.
- **Accessibility**
  - Flag gets `role="button"`, `tabIndex = 0`, and an extended `aria-label` suffix: “tik voor vuurwerk” (Dutch), preserving any previous label or `alt` as the prefix.
  - Canvas is `aria-hidden="true"` (decorative).
- **Motion**
  - If `prefers-reduced-motion: reduce` is set, fireworks do not run (`prefersReducedMotion()` early return).
- **Lifecycle**
  - Single shared `fireworksState`; resize listener keeps canvas in sync with DPR (capped at 2).
  - Animation stops and the canvas is removed after particles have cleared and there has been no new burst for ~2.2s (`teardownFireworks`).

**CSS**

- `.clock-card--us .flag-badge`: pointer cursor, hover scale and shadow, `focus-visible` outline using `--lemon-custard`.
- `.fireworks-canvas`: fixed fullscreen overlay as above.

**Code (appendix in `app.js`)**

- Constants: `FIREWORK_PALETTE`
- State/helpers: `createFireworksState`, `resizeFireworksCanvas`, `spawnBurst`, `tickFireworks`, `teardownFireworks`, `launchFireworksFromFlag`, `initUsFlagFireworks`
- Initialized once at load: `initUsFlagFireworks()`

---

### How to verify manually

1. Open the app, find a US card (`clock-card--us`): weather should show a whole-number “Freedom units” value with the styled label, not `°C`.
2. Tab to the US flag badge: focus ring visible; **Enter** / **Space** or click should show fireworks; repeat after they finish.
3. Enable “Reduce motion” in the OS/browser: flag should still be focusable/clickable but no canvas fireworks.
