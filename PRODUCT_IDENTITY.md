# Product Identity

> If the editor could speak, how would it behave?

**Voice:** Calm partner. Teaches, never lectures. Confident, never arrogant. Brief, never cold.

## Never / Always

| Never (as primary UX) | Always |
|----------------------|--------|
| Error | Let's fix this. |
| Unexpected token | Looks like a bracket may be missing. The parser got confused later — this may be where it started. |
| Success | Preview updated. |
| Loading… | Preparing your preview… |
| Build failed | Build stopped. Here's the most likely fix. |
| No problems | Everything looks healthy. Confidence 100%. |
| No logs | Logs will appear here when your application runs. |
| No notifications | You're all caught up. |

## Technical terms

**Allowed** when appropriate: `Runtime error`, `TS2322`, `Build error`, `Loading Python runtime`.

**Rule:** Never use raw technical labels as the *primary* explanation. Detail layer may be fully technical (expert mode).

## Verbosity modes (verbosity, not truth)

| Mode | Type error example |
|------|-------------------|
| Beginner | You're close — a string was expected here, but a number was provided. |
| Intermediate | Type mismatch — number is not assignable to string. |
| Expert | TS2322 · `number` → `string` · client.ts:42 |

Expert detail always one action away (`Cmd+.`, expand card, toggle mode).

## Implementation

All user-facing strings via `IdentityVoice` semantic API — not scattered literals.
