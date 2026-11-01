---

name: domain-styleguide
description: Use when a rule is added or changed, or anything under packages/domain is touched: providers and what they share, account names, link reconciliation, machine rules, terminal plans. Also use when the request only says "share this file", "add a provider rule" or "what happens to this link". Not for loading data, processes or UI.
---

# Domain styleguide

## Authority

This skill owns what belongs in `packages/domain` and how it is written. How a use case runs comes from `server-service-styleguide`. Wire shapes come from `contracts-styleguide`.

## Boundary

- The package imports only `zod` and its own files. No `node:*`, no Bun, no React, no clock, no I/O. `apps/server/test/architecture.test.ts` enforces it.
- Rules are pure functions that take what was observed and return a decision. `planSharedItem` takes two entries and returns what to do; it never touches a disk.
- Failures are `DomainError` with a stable code, raised by `assertDomain(condition, code, message)`.

## The rule that shapes everything

Shared is a named allowlist in `Providers`. Everything else is private. Adding a credential or a thread to `shared` hands one account's login to every other account, and a domain test fails if you try. A real file where a link belongs is reported, never overwritten.

## Themes

A theme is data: `packages/domain/src/themes/built-in-themes.ts` holds the built-ins, and a test keeps each one readable. Only add a theme whose license allows it in this repo. Paid or personal palettes belong in `~/.favo/themes`, never here.

## Working references

- `src/sharing/shared-item.ts`: reconciliation as a pure decision.
- `src/providers/provider.ts`: a provider is a table entry, not a class.
- `src/terminal/terminal-plan.ts`: login and launch are data until a front end runs them.

## Checklist

1. No import outside `zod`, `#domain/*` and `./`.
2. Each new rule has a test in `packages/domain/test/<area>/` that fails without it.
