---

name: client-tests
description: Use whenever creating, editing or fixing tests in apps/client: service tests against mockDb, entity tests, and screen tests with the OpenTUI test renderer. Also use when the request only says "add a test" or "this test is flaky".
---

# Client tests

The application runs with no backend. Tests mirror ownership under `src/__tests__`.

- **Service tests**: `const app = await getApp();`, then drive `app.state` and assert source state, computed state and `mockDb`.
- **Screen tests**: `const view = await renderApp();`, then keys, clicks and frames.

## Screen test facts

- `pressKey('tab')` types the word tab. Use `press('TAB', 'RETURN')`; a single letter is a letter, and `X` is shift-x as a terminal sends it.
- Escape needs a real pause to be told apart from an arrow key, so use `pressEscape()`.
- After changing the store from a test, use `select(key)`, which flushes, or a key may run against the previous render.
- Prefer `waitForFrame` for anything async. `clickOn(text)` finds text on screen and clicks it.
- `captureSpans()` gives colors.

`apps/cli/test/tui-integration.test.tsx` runs the same App on a real backend with test doubles; it is what proves the `Api*` adapters.
