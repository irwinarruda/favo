---

name: server-service-styleguide
description: Use when writing or changing a backend use case, a gateway or its test double, or a server test. Also use when the request only says "implement this flow", "run this command" or "add a shim". Not for placement, which belongs to server-architecture.
---

# Server service styleguide

## Rules

- A use case is a public method of a cohesive service, one service per lifecycle. No class per command, no command bus.
- Order: validate, load, let the domain decide, write.
- A service never reads the environment, spawns a process or touches a file directly. It receives what it needs in its constructor. There is no container on the server; `server.ts` wires everything by hand.
- Every external thing has a gateway: an abstract class in `gateways/`, its real implementation and its test double beside it (`ssh.ts`, `open.ssh.ts`, `scripted.ssh.ts`). Production never reads a flag to switch them; only the composition root chooses.
- A real gateway owns the mapping from an external failure to a `DomainError`.
- favo never reads a token's value. Identity comes from the official status commands, and a login runs the official command with the right folder set.

## Tests

Layers, cheapest first:

1. `apps/server/test/<module>/`: through the RPC client with test doubles (`createTestServer`). Two servers joined by `LoopbackRemoteBackends` are a remote machine.
2. `apps/server/test/system/file-system.contract.test.ts`: the same spec against the real and the memory file system, so the double cannot drift.
3. `apps/cli/test/e2e.test.ts`: the real entry point against fake `claude`, `codex`, `agy`, `opencode` and `ssh` binaries.

An HTTP gateway tests its real class against a loopback `Bun.serve` on `127.0.0.1`, never the internet.

Always `await expect(...).rejects`; an unawaited one passes silently.

## Checklist

1. A new external call goes through a gateway, with a double.
2. The test proves the rule through the contract, not through a private method.
