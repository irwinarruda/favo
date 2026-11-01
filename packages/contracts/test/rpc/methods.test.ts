import { describe, expect, it } from 'bun:test';
import { BuiltInThemes } from '@favo/domain/themes/built-in-themes';
import { createAccount } from '#contracts/rpc/accounts/create-account';
import { listAccounts } from '#contracts/rpc/accounts/list-accounts';
import { createRpcClient } from '#contracts/rpc/client';
import type { RpcResponse } from '#contracts/rpc/envelope';
import { Protocol, RpcRequest, RpcResponse as RpcResponseSchema } from '#contracts/rpc/envelope';
import { addMachine } from '#contracts/rpc/machines/add-machine';
import { getSeatStatus } from '#contracts/rpc/seats/get-seat-status';
import { ping } from '#contracts/rpc/system/ping';
import { planTerminal } from '#contracts/rpc/terminal/plan-terminal';
import { listThemes } from '#contracts/rpc/themes/list-themes';
import { selectTheme } from '#contracts/rpc/themes/select-theme';

const seat = {
  account: 'work',
  provider: 'claude',
  label: 'Claude Code',
  path: '/h/.favo/accounts/work/claude',
  pathHint: 'CLAUDE_CONFIG_DIR path',
  loginScope: 'perAccount',
  isInstalled: true,
  isProvisioned: true,
  canLogout: true,
};

describe('method descriptors', () => {
  it('accepts a valid seat status request and refuses an unknown provider', () => {
    expect(getSeatStatus.params.safeParse({ account: 'work', provider: 'claude' }).success).toBe(true);
    expect(getSeatStatus.params.safeParse({ account: 'work', provider: 'gemini' }).success).toBe(false);
  });
  it('refuses an unknown key in params', () => {
    expect(createAccount.params.safeParse({ name: 'side', admin: true }).success).toBe(false);
  });
  it('parses an account list and refuses a seat with a missing path', () => {
    const account = { name: 'work', displayName: 'side', isPersonal: false, seats: [seat] };
    expect(listAccounts.result.safeParse([account]).success).toBe(true);
    const { path: _path, ...withoutPath } = seat;
    expect(listAccounts.result.safeParse([{ ...account, seats: [withoutPath] }]).success).toBe(false);
  });
  it('requires a target to add a machine', () => {
    expect(addMachine.params.safeParse({ target: 'bee@devbox' }).success).toBe(true);
    expect(addMachine.params.safeParse({}).success).toBe(false);
  });
  it('accepts a terminal plan request for another machine', () => {
    const params = { machineId: 'devbox', action: 'login', account: 'work', provider: 'codex', args: [] };
    expect(planTerminal.params.safeParse(params).success).toBe(true);
    expect(planTerminal.params.safeParse({ ...params, action: 'delete' }).success).toBe(false);
  });
});

describe('the protocol', () => {
  it('is at least 5, the first one whose machines read --argv-b64', () => {
    expect(Protocol).toBeGreaterThanOrEqual(5);
  });
});

describe('errors from the other side', () => {
  it.each(['constructor', '__proto__', 'toString'])('treats the code %s as an internal error', async (code) => {
    const client = createRpcClient({
      send: async ({ id }) => ({ id, ok: false, error: { code, message: 'boom' } }),
    });
    await expect(client.call(listAccounts, {})).rejects.toMatchObject({ code: 'internal', message: 'boom' });
  });
  it('keeps a code it knows', async () => {
    const client = createRpcClient({
      send: async ({ id }) => ({ id, ok: false, error: { code: 'accountExists', message: 'taken' } }),
    });
    await expect(client.call(listAccounts, {})).rejects.toMatchObject({ code: 'accountExists' });
  });
});

describe('themes', () => {
  it('requires a theme id to select one', () => {
    expect(selectTheme.params.safeParse({ id: 'honey' }).success).toBe(true);
    expect(selectTheme.params.safeParse({}).success).toBe(false);
  });
  it('refuses a theme with a bad color', () => {
    const theme = BuiltInThemes[0]!;
    const list = { activeId: 'honey', problems: [] };
    expect(listThemes.result.safeParse({ ...list, themes: [theme] }).success).toBe(true);
    const broken = { ...theme, colors: { ...theme.colors, accent: 'orange' } };
    expect(listThemes.result.safeParse({ ...list, themes: [broken] }).success).toBe(false);
  });
});

describe('envelope', () => {
  it('round-trips a request and both kinds of response through JSON', () => {
    const request = { id: 1, method: 'system.ping', params: {}, machineId: 'devbox' };
    expect(RpcRequest.parse(JSON.parse(JSON.stringify(request)))).toEqual(request);
    expect(RpcResponseSchema.parse({ id: 1, ok: true, result: {} }).ok).toBe(true);
    expect(RpcResponseSchema.safeParse({ id: 1, ok: false }).success).toBe(false);
  });
});

describe('rpc client', () => {
  const pingResult = {
    version: '1',
    protocol: 4,
    hostname: 'h',
    platform: 'linux',
    arch: 'x64',
    home: '/h',
    directory: '/h',
  };

  it('sends the machine in the envelope and parses the result', async () => {
    const seen: unknown[] = [];
    const client = createRpcClient({
      async send(request) {
        seen.push(request.machineId);
        return { id: request.id, ok: true, result: pingResult };
      },
    });
    expect((await client.call(ping, {}, { machineId: 'devbox' })).hostname).toBe('h');
    expect(seen).toEqual(['devbox']);
  });
  it('turns an error response into a domain error with its code', async () => {
    const client = createRpcClient({
      async send(request): Promise<RpcResponse> {
        return { id: request.id, ok: false, error: { code: 'accountExists', message: 'taken' } };
      },
    });
    await expect(client.call(ping, {})).rejects.toMatchObject({ code: 'accountExists', message: 'taken' });
  });
  it('refuses a result that does not work the contract', async () => {
    const client = createRpcClient({
      async send(request): Promise<RpcResponse> {
        return { id: request.id, ok: true, result: { version: 1 } };
      },
    });
    await expect(client.call(ping, {})).rejects.toThrow();
  });
});
