---

name: contracts-styleguide
description: Use when an RPC method or wire shape is added or changed, or anything under packages/contracts is touched. Also use when the request only says "add a method", "the client needs this field" or "change this response". Not for rules, which belong to domain-styleguide.
---

# Contracts styleguide

## Authority

This skill owns the language between front ends and the backend. Every front end, local or remote, speaks only this.

## Rules

- One descriptor per method in `src/rpc/<area>/<method>.ts`, built with `defineMethod`: `name`, `routing`, `params`, `result`.
- `params` is a `z.strictObject`, so an unknown key is an error.
- `routing` decides where a method runs. `machine` is forwarded to the machine in the envelope. `hub` always runs on the backend you talk to.
- Reuse a domain schema when the wire shape is a domain shape. Projections live in `src/rpc/views.ts`.
- A change that breaks an older machine bumps `Protocol` in `src/rpc/envelope.ts`, so it shows as outdated instead of failing strangely.
- The package imports only `zod`, `@favo/domain/*` and its own files.

## Working references

- `src/rpc/seats/get-seat-status.ts`: a machine method.
- `src/rpc/terminal/plan-terminal.ts`: a hub method, because a remote plan is built here.

## Checklist

1. The descriptor has `params` and `result`.
2. A valid and an invalid example in `test/rpc/`.
