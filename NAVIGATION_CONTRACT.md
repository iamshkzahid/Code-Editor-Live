# Navigation Contract

One obvious way to do everything. VS Code-level consistency.

## Problems → Editor

| Step | Action |
|------|--------|
| Focus problem | Click card or F8 / Shift+F8 |
| Open location | **Enter** or primary action button |
| Return to Problems | **Esc** (if panel open) |

**Not allowed:** double-click only, Ctrl+Enter only, inconsistent click targets.

## Editor line navigation

- Problems, Console stack traces, Replay steps → same `jumpToLine()` path
- Same 150ms choreography everywhere

## Panels

| Panel | Open | Close |
|-------|------|-------|
| Problems | Tab click or status badge | Tab switch or panel close |
| Console | Tab click | Tab switch or panel close |
| Notifications | Bell icon | Click away or Esc |

## Command Palette

- All actions reachable via palette **and** one primary UI path
- Palette is accelerator, not the only way

## Workflow benchmark

For every debugging task, measure interactions vs alternatives:

```
Observe → Understand → Act → Recover
```

Shorter or clearer sequence wins. Document in cohort benchmarks.
