# Complexity Budget

## Rule

**Every feature must delete or simplify something else.** Net complexity stays flat.

## Phase 5 cap

- ~3,500 lines new code
- ~35 files max

## PR requirement

> This PR deletes or simplifies: ___

## Examples

| Adding | Must remove / merge |
|--------|---------------------|
| Debug Replay | Standalone build timeline |
| Confidence score | Raw problem count as primary |
| IdentityVoice | Scattered copy in controllers |
| Flow deferral | Immediate diagnostic flicker |

## Architecture freeze

No new `src/core/*` engines without CTO approval. Product changes preferred over infrastructure.
