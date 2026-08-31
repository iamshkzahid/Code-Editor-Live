# Feature Lifecycle

Every major feature has explicit lifecycle metadata.

## States

```
Experimental → Preview → Stable → Deprecated → Removed
```

## Metadata template

```yaml
feature: Flow Engine
status: Stable
owner: Product
introduced: Phase 5
review: every 6 months
dependencies: [DiagnosticEngine, productPolicy]
```

## Phase 5 features

| Feature | Status | Owner | Review |
|---------|--------|-------|--------|
| Flow Engine | Stable | Product | 6 months |
| Confidence Engine | Stable | Product | 6 months |
| Debug Replay | Preview | Product | 3 months |
| Explainability | Stable | Product | 6 months |
| Developer Memory | Preview | Product | 3 months |
| Notification Center | Stable | Product | 6 months |

Deprecated features must document migration path before removal.
