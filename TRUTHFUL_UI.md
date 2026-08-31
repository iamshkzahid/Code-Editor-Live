# Truthful UI

> **Hierarchy:** Truth & Safety supersedes Product, Identity, and Engineering.

## Principle

**Never make the interface appear more certain than the underlying system actually is.**

## Durable Simplicity

> Every release should make the editor feel simpler than the previous release, even if it becomes more capable internally.

## Rules

| Never show | Show instead |
|------------|--------------|
| Confidence as probability of correctness | Project Confidence — heuristic, with breakdown |
| Preview ready (stale build) | Showing last working preview |
| Fixed (build in progress) | Fix applied · rebuilding… |
| Root cause as fact (unverified) | This may be where the problem started |
| Likely fix as certainty | Most likely cause based on available evidence |

## Calibrated language

Prefer: **may**, **likely**, **based on available evidence**, **heuristic**.

Avoid: **definitely**, **always**, **100%**, **this is the cause**.

## Stale state

Any stale preview, queued diagnostic, delayed build, or cached result must be **visually and semantically distinct** from current state.

Example: *"Showing last working preview. You can keep editing while we rebuild."*

## Accessibility

- `aria-live` uses the same calibrated copy as visual UI
- Stale preview exposed via `aria-describedby`
- Confidence breakdown available to screen readers

## Consistency test (every screen, < 2 seconds)

1. **What happened?**
2. **What should I do?**
3. **Am I safe to continue?**

If any screen fails one question, redesign it.
