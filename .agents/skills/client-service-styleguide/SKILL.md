---

name: client-service-styleguide
description: Always load when creating or changing Zustand services, computed values, cross-service actions, repository or gateway ports and adapters, the container or mockDb in apps/client.
---

# Client service styleguide

## Rules

- One flat store, `useApp`, composed in `shared/stores/app.ts` through `composeServices`, which throws on a duplicate key.
- One service per file: the contract, then the creator, then private helpers at the bottom with a `_` prefix.
- `compute(get, producer)` recalculates on every publication. `computeFrom(get, selectDependencies, producer)` recalculates when a dependency changes.
- Keep selected ids as source state and derive selected entities.
- At the start of an action, destructure what it needs from `get()`. Resolve ports inside the action into a local: `const fleetRepository = container.get('IFleetRepository');`.
- `try/finally` for a loading flag, whole body inside. Let errors bubble to `useError` unless the workflow shows them itself, as a dialog error does.
- Reading another service's state and calling its action is fine. Writing its fields is not.
- Confirmation is a View interaction. A service action receives an already confirmed command.
- `Test*` adapters share the plain `mockDb`. They throw the same domain errors as `Api*` adapters, so callers cannot tell them apart.

## Checklist

1. Add the port and both adapters before wiring the action.
2. Register them in `libs/container`, `shared/container/app.ts` and `shared/container/dev.ts`.
3. Test source state, computed state and side effects in `mockDb`.
