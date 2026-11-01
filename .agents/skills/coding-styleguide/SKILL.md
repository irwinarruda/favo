---

name: coding-styleguide
description: Use when writing, editing or reviewing any TypeScript in favo: names, enums, types, null versus undefined, functions, imports, try blocks, comments, file names and test names. Also use when the request only says "add a helper", "rename this" or "clean this up".
---

# Coding styleguide

## Authority

This skill owns how code reads. Where code lives comes from `server-architecture` and `client-architecture`.

## Rules

- Biome owns formatting and import order. Do not hand-tune what `bun run lint:fix` decides.
- `const` by default, `let` only for real reassignment, never `var`.
- Let TypeScript infer variables and return types. Annotate public contracts: gateways, ports and service types.
- `undefined` in application types and DTOs. `null` only where an external API forces it, converted at the boundary.
- `??` instead of `||` for defaults.
- Function declarations for named functions; arrows only for callbacks. No nested ternaries.
- When a function needs `try`, open it at the top so the whole body lives inside. Let errors propagate; `catch` only for real fallback behavior or to convert an external failure.
- Keep logic inline. Extract for reuse or a clearer name, never to shorten a file.
- Closed sets are const-object enums with `ValueOf`, members in camelCase. Never a TS `enum`, never an inline string union for our own sets.
- Booleans read as `is*`, `has*`, `can*`, `show*`. Constants are PascalCase.
- No comments in production code. The reason goes in a name, the plan or a skill.
- `../` imports are forbidden. Use `@/` inside an app, `@favo/<package>/<path>` across packages, `#<package>/<path>` inside a package, and `./` for the same folder. No barrels, except a `libs/<name>/index.ts` in the client.

## File names

| Where         | Style                                                                            | Example                           |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| `packages/*`  | kebab-case, no role                                                              | `shared-item.ts`                  |
| `apps/server` | kebab-case `<name>.<role>.ts`; a gateway implementation puts the mechanism first | `seats.service.ts`, `open.ssh.ts` |
| `apps/client` | PascalCase for classes, services and components                                  | `FleetService.ts`, `SeatRow.tsx`  |

## Checklist

1. `bun run lint` passes without suppressions.
2. No `null`, no `||` default, no TS `enum`, no comment, no `../`. The architecture test checks the last three.
3. Test names describe behavior in domain words.
