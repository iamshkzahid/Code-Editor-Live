# Platform Constitution

Engineering rules. Subordinate to [PRODUCT_PHILOSOPHY.md](./PRODUCT_PHILOSOPHY.md) and [TRUTHFUL_UI.md](./TRUTHFUL_UI.md) when they conflict — **product wins**.

1. Speed over features.
2. One obvious way to do everything.
3. Never surprise users.
4. Every feature keyboard accessible.
5. No modal interruption for non-critical information.
6. Offline first after first load.
7. Human-first language in all user-facing text.
8. Every subsystem disposable via LifecycleManager.
9. Every public API documented and semver-stable.
10. Every feature measurable (engineering + experience).
11. Every animation meaningful and contract-compliant.
12. Real performance matters; perceived performance matters more.
13. Local data never transmitted without explicit user action.
14. The editor never stops working because a subsystem failed.
15. Infrastructure serves experience — not the reverse.

## Engineering contracts (frozen)

- E1: Diagnostics via DiagnosticEngine only
- E2: Every controller implements `dispose()`
- E3: Subsystem crash does not crash editor
- E4: Preview frozen on build fail if prior success
- E5: PerformanceBudget fails CI on regression
- E6: Source maps resolve runtime locations
- E7: axe-core zero violations on Problems + Console
- E8: No new core subsystems without approval

## Scale language

| | |
|-|-|
| **Target** | 100,000 diagnostics addressable (virtualized) |
| **Guaranteed** | 5,000 interactive at 60 FPS (browser + hardware dependent) |

Do not market targets as guarantees.
