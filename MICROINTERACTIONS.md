# Microinteractions

How every control **feels**. Only animate `opacity`, `transform`, and limited `filter`.

## Hover (buttons, problem cards)

- 100ms ease-out
- `translateY(-1px)`
- Subtle accent border
- No layout shift

## Pressed

- `scale(0.98)` for 100ms

## Released

- ease-out to rest

## Problem resolved

- 200ms opacity fade → collapse height (not instant remove)

## Toast

- Enter: slide up + 4px overshoot settle, 200ms
- Exit: slide down + fade, 150ms

## Confidence change

- Number tick via CSS (no layout reflow)
- Green pulse once on recovery

## Line flash (editor)

- 1.2s background fade, one-shot

## Forbidden

- Animating width, height, margin, padding
- Continuous box-shadow animation
- Animations > 300ms (except line-flash)
- Blocking pointer-events during transition

## Reduced motion

`prefers-reduced-motion` → all durations 0.01ms.
