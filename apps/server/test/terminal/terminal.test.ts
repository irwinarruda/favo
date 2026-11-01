import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { Protocol } from '@favo/contracts/rpc/envelope';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { planTerminal } from '@favo/contracts/rpc/terminal/plan-terminal';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { encodeArguments } from '@favo/domain/terminal/terminal-plan';
import { createTestServer, Home, seedClaudeBase } from '#test/support/test-server';

const launchWork = { action: 'launch', account: 'work', provider: 'claude', args: [] as string[] } as const;

async function serverWithWork(options?: Parameters<typeof createTestServer>[0]) {
  const server = createTestServer(options);
  await seedClaudeBase(server.fileSystem);
  await server.client.call(createAccount, { name: 'work' });
  return server;
}

describe('terminal plans on this machine', () => {
  it('launches the provider isolated, after reconciling its links', async () => {
    const { client, fileSystem } = await serverWithWork();
    const plan = await client.call(planTerminal, launchWork);
    expect(plan.command).toBe('/usr/bin/claude');
    expect(plan.env.CLAUDE_CONFIG_DIR).toBe(`${Home}/.favo/accounts/work/claude`);
    expect((await fileSystem.entry(`${Home}/.favo/accounts/work/claude/CLAUDE.md`)).kind).toBe(EntryKind.link);
  });
  it('passes the caller arguments through', async () => {
    const { client } = await serverWithWork();
    const plan = await client.call(planTerminal, { ...launchWork, args: ['--resume', 'abc'] });
    expect(plan.args).toEqual(['--resume', 'abc']);
  });
  it('adds the configured launch arguments', async () => {
    const { client, fileSystem, paths } = await serverWithWork();
    await fileSystem.writePrivateText(
      paths.configFile,
      JSON.stringify({ providers: { claude: { launchArgs: ['--dangerously-skip-permissions'] } } })
    );
    const plan = await client.call(planTerminal, { ...launchWork, args: ['-c'] });
    expect(plan.args).toEqual(['--dangerously-skip-permissions', '-c']);
  });
  it('signs in and out with the official commands', async () => {
    const { client } = await serverWithWork();
    expect((await client.call(planTerminal, { ...launchWork, action: 'login' })).args).toEqual(['login']);
    expect((await client.call(planTerminal, { ...launchWork, action: 'logout' })).args).toEqual(['logout']);
  });
  it('refuses to sign out of a provider without that command', async () => {
    const { client } = await serverWithWork();
    const params = { ...launchWork, action: 'logout', provider: 'antigravity' } as const;
    await expect(client.call(planTerminal, params)).rejects.toMatchObject({ code: 'logoutUnsupported' });
  });
  it('adds what the provider needs to stay isolated, only for a managed account', async () => {
    const { client, clis } = await serverWithWork();
    clis.opencode.isolation = ['--standalone'];
    const managed = await client.call(planTerminal, { ...launchWork, provider: 'opencode' });
    expect(managed.args).toContain('--standalone');
    expect(managed.env.XDG_DATA_HOME).toBe(`${Home}/.favo/accounts/work/opencode`);
    expect(managed.env.XDG_CONFIG_HOME).toBeUndefined();
    const personal = await client.call(planTerminal, { ...launchWork, account: 'personal', provider: 'opencode' });
    expect(personal.args).not.toContain('--standalone');
  });
  it('keeps isolation on sign in too', async () => {
    const { client, clis } = await serverWithWork();
    clis.opencode.isolation = ['--standalone'];
    const plan = await client.call(planTerminal, { ...launchWork, action: 'login', provider: 'opencode' });
    expect(plan.args).toEqual(['login', '--standalone']);
  });
  it('explains a provider that is not installed', async () => {
    const { client } = await serverWithWork({ installed: [] });
    await expect(client.call(planTerminal, launchWork)).rejects.toMatchObject({ code: 'providerNotInstalled' });
  });
});

describe('terminal plans on another machine', () => {
  it('runs favo on that machine through a real terminal', async () => {
    const { client } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    const plan = await client.call(planTerminal, { ...launchWork, machineId: 'devbox', args: ['-c'] });
    expect(plan.command).toBe('ssh');
    const encoded = encodeArguments(['claude', 'work', '--', '-c']);
    expect(plan.args).toEqual(['-t', '--', 'bee@devbox', `~/.favo/bin/favo --argv-b64 ${encoded}`]);
  });
  it('uses the provider command name, which is what favo accepts', async () => {
    const { client } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    const params = { ...launchWork, machineId: 'devbox', provider: 'antigravity' } as const;
    expect((await client.call(planTerminal, params)).args.at(-1)).toEndWith(encodeArguments(['agy', 'work']));
    const login = { ...params, action: 'login' } as const;
    expect((await client.call(planTerminal, login)).args.at(-1)).toEndWith(encodeArguments(['login', 'work', 'agy']));
  });
  it('uses the Windows path for a Windows machine', async () => {
    const { client, ssh } = await serverWithWork();
    ssh.reply('uname -sm', { code: 1 });
    ssh.reply('cmd.exe /c ver', { stdout: 'Microsoft Windows [Version 10.0.26200]' });
    await client.call(addMachine, { target: 'bee@winbox' });
    const plan = await client.call(planTerminal, { ...launchWork, machineId: 'winbox', args: ['hi there'] });
    const encoded = encodeArguments(['claude', 'work', '--', 'hi there']);
    expect(plan.args.at(-1)).toBe(`.favo\\bin\\favo.exe --argv-b64 ${encoded}`);
  });
  it.each(['Bad Name', '--help', '$(calc)', 'a" & calc', ''])(
    'refuses the account %j before it reaches ssh',
    async (account) => {
      const { client } = await serverWithWork();
      await client.call(addMachine, { target: 'bee@devbox' });
      const plan = client.call(planTerminal, { ...launchWork, machineId: 'devbox', account });
      await expect(plan).rejects.toMatchObject({ code: 'invalidAccountName' });
    }
  );
  it('still lets you reach the base account of another machine', async () => {
    const { client } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    const plan = await client.call(planTerminal, { ...launchWork, machineId: 'devbox', account: 'personal' });
    expect(plan.args.at(-1)).toEndWith(encodeArguments(['claude', 'personal']));
  });
  it('says a machine is outdated instead of sending it a flag it does not know', async () => {
    const { client, remotes } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    remotes.connect('devbox', {
      async send(request) {
        const facts = { version: '0.0.9', hostname: 'x', platform: 'linux', arch: 'x64', home: '/h', directory: '/h' };
        return { id: request.id, ok: true, result: { ...facts, protocol: Protocol - 1 } };
      },
    });
    const plan = client.call(planTerminal, { ...launchWork, machineId: 'devbox' });
    await expect(plan).rejects.toMatchObject({
      code: 'machineOutdated',
      message: 'devbox runs an older favo. To update it: favo machine install devbox',
    });
  });
  it('refuses a machine it does not know', async () => {
    const { client } = await serverWithWork();
    await expect(client.call(planTerminal, { ...launchWork, machineId: 'ghost' })).rejects.toMatchObject({
      code: 'machineNotFound',
    });
  });
});
