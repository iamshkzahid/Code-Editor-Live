# Product Migrations

Workspace and behavior compatibility across phases.

## Principles

- Existing workspaces must behave predictably after upgrade
- Breaking behavior changes require migration + changelog
- Preferences stored with schema version in IndexedDB

## Schema version

```ts
// cel-workspace-v3 → v4 when Phase 6+ changes layout keys
```

## Migration checklist (new phase)

1. Document behavior changes in this file
2. Bump workspace schema version
3. Provide `migrateV3toV4()` in store restore
4. Default new fields — never require user action
5. Test restore from prior phase snapshot

## Phase 5 migrations

| From | Change | Migration |
|------|--------|-----------|
| Pre-Phase 5 | Flat `diagnostics[]` | DiagnosticEngine ingests on boot; same store key |
| Pre-Phase 5 | `buildState` boolean | Map to `buildPhase` FSM on restore |

## Feature flags

Experimental features off by default only when unstable. Stable features on by default (P22).
