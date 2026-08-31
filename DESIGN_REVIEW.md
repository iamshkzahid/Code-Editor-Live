# Design Review Gate

Visual consistency is reviewed like code quality. **Required for any PR touching UI.**

## Checklist

Answer each question. All must be **yes** or N/A.

1. **Cognitive load** — Does this reduce cognitive load (or justify increase)?
2. **One way** — Does it introduce another way to do the same thing?
3. **IdentityVoice** — Is wording consistent with [PRODUCT_IDENTITY.md](./PRODUCT_IDENTITY.md)?
4. **Truthful UI** — Does it respect [TRUTHFUL_UI.md](./TRUTHFUL_UI.md)?
5. **Duplicate surface** — Is there already another UI surface doing this?
6. **Consistency test** — Can user answer in < 2s: What happened? What to do? Safe to continue?
7. **Defaults** — Does it work with zero configuration?
8. **Agency** — Does it recommend without taking control?

## Experience regression budget

PR must not increase without justification:

| Metric | Budget (per 30 min session) |
|--------|----------------------------|
| Notifications during flow | 0 non-critical |
| Automatic focus changes | 0 |
| Unexpected scroll | 0 |
| Modal dialogs (non-settings) | 0 |
| Panel auto-opens on error | 0 |
| Decorative animations | minimal |

## No Surprise test

Ask: *"Did anything happen that you didn't expect?"*

If yes — investigate notification, panel, animation, auto-navigation, replay, or confidence change.
