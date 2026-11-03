import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { Protocol } from '@favo/contracts/rpc/envelope';
import { listHooks } from '@favo/contracts/rpc/hooks/list-hooks';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { planTerminal } from '@favo/contracts/rpc/terminal/plan-terminal';
import { recordThread } from '@favo/contracts/rpc/threads/record-thread';
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

describe('what a launch tells the hook', () => {
  it('names the seat by its folder', async () => {
    const { client } = await serverWithWork();
    const { env } = await client.call(planTerminal, launchWork);
    expect(env.FAVO_ACCOUNT).toBe('work');
  });
  it('gives every launch its own mark', async () => {
    const { client } = await serverWithWork();
    const first = await client.call(planTerminal, launchWork);
    const second = await client.call(planTerminal, launchWork);
    expect(first.env.FAVO_LAUNCH).toBeString();
    expect(first.env.FAVO_LAUNCH).not.toBe(second.env.FAVO_LAUNCH);
  });
  it('points the hook at this binary when favo runs compiled', async () => {
    const { client } = await serverWithWork({ binary: '/opt/favo/favo' });
    expect((await client.call(planTerminal, launchWork)).env.FAVO_BIN).toBe('/opt/favo/favo');
  });
  it('tells a sign in nothing, because no thread starts there', async () => {
    const { client } = await serverWithWork();
    const plan = await client.call(planTerminal, { ...launchWork, action: 'login' });
    expect(plan.env.FAVO_ACCOUNT).toBeUndefined();
  });
});

describe('resuming on this machine', () => {
  const Project = `${Home}/projects/hive`;
  const WorkEnv = {
    FAVO_ACCOUNT: 'work',
    FAVO_LAUNCH: 'l1',
    CLAUDE_CONFIG_DIR: `${Home}/.favo/accounts/work/claude`,
  };
  const resumeWork = { ...launchWork, action: 'resume' } as const;

  async function serverWithThread(options?: Parameters<typeof createTestServer>[0]) {
    const server = await serverWithWork({ callerEnv: WorkEnv, ...options });
    await server.fileSystem.ensureDirectory(Project);
    await server.client.call(recordThread, {
      provider: 'claude',
      id: 'abc',
      directory: Project,
      isFresh: true,
    });
    return server;
  }

  it('resumes the newest thread, from its folder', async () => {
    const { client } = await serverWithThread();
    const plan = await client.call(planTerminal, resumeWork);
    expect(plan.cwd).toBe(Project);
    expect(plan.args).toEqual(['--resume', 'abc']);
  });
  it('passes what you typed after -- on to the provider', async () => {
    const { client } = await serverWithThread();
    const plan = await client.call(planTerminal, { ...resumeWork, args: ['--model', 'x'] });
    expect(plan.args).toEqual(['--resume', 'abc', '--model', 'x']);
  });
  it('brings the configured launch arguments back by itself', async () => {
    const { client, fileSystem, paths } = await serverWithThread();
    await fileSystem.writePrivateText(
      paths.configFile,
      JSON.stringify({ providers: { claude: { launchArgs: ['--dangerously-skip-permissions'] } } })
    );
    const plan = await client.call(planTerminal, resumeWork);
    expect(plan.args).toEqual(['--dangerously-skip-permissions', '--resume', 'abc']);
  });
  it('resumes from a thread in another folder when this one has none', async () => {
    const { client } = await serverWithThread({ directory: `${Home}/elsewhere` });
    expect((await client.call(planTerminal, resumeWork)).cwd).toBe(Project);
  });
  it('takes a position or part of an id', async () => {
    const { client } = await serverWithThread();
    expect((await client.call(planTerminal, { ...resumeWork, thread: '1' })).args).toContain('abc');
    expect((await client.call(planTerminal, { ...resumeWork, thread: 'ab' })).args).toContain('abc');
  });
  it('says so when there is no thread yet', async () => {
    const { client } = await serverWithWork();
    await expect(client.call(planTerminal, resumeWork)).rejects.toMatchObject({ code: 'threadNotFound' });
  });
  it('says so when a position is past the end', async () => {
    const { client } = await serverWithThread();
    await expect(client.call(planTerminal, { ...resumeWork, thread: '9' })).rejects.toMatchObject({
      code: 'threadNotFound',
    });
  });
  it('says so when the folder of the thread is gone', async () => {
    const { client, fileSystem } = await serverWithThread();
    await fileSystem.move(Project, `${Home}/moved`);
    await expect(client.call(planTerminal, resumeWork)).rejects.toThrow(
      `That thread was in ${Project}, which is gone.`
    );
  });
  it('passes an id favo does not hold through to the provider', async () => {
    const { client } = await serverWithThread();
    const plan = await client.call(planTerminal, { ...resumeWork, thread: 'unknown-id' });
    expect(plan.args).toEqual(['--resume', 'unknown-id']);
    expect(plan.cwd).toBeUndefined();
  });
  it('starts an id favo does not hold in the folder you asked for', async () => {
    const { client } = await serverWithThread();
    const plan = await client.call(planTerminal, { ...resumeWork, thread: 'unknown-id', directory: Project });
    expect(plan.cwd).toBe(Project);
  });
  it('says so when a session that never got a message has lost its folder', async () => {
    const { client, fileSystem } = await serverWithThread();
    const transcript = '/gone.jsonl';
    await client.call(recordThread, { provider: 'claude', id: 'empty', directory: Project, transcript, isFresh: true });
    await fileSystem.move(Project, `${Home}/moved`);
    await expect(client.call(planTerminal, { ...resumeWork, thread: 'empty' })).rejects.toThrow(
      `That thread was in ${Project}, which is gone.`
    );
  });
  it('starts the seat fresh in its folder for a session that never got a message', async () => {
    const { client } = await serverWithThread();
    const transcript = '/gone.jsonl';
    await client.call(recordThread, { provider: 'claude', id: 'empty', directory: Project, transcript, isFresh: true });
    const plan = await client.call(planTerminal, { ...resumeWork, thread: 'empty' });
    expect(plan.args).toEqual([]);
    expect(plan.cwd).toBe(Project);
  });
  it('uses the provider own words', async () => {
    const env = { ...WorkEnv, CODEX_HOME: `${Home}/.favo/accounts/work/codex` };
    const { client, fileSystem } = await serverWithWork({ callerEnv: env });
    await fileSystem.ensureDirectory(Project);
    await client.call(recordThread, { provider: 'codex', id: 'abc', directory: Project, isFresh: true });
    const plan = await client.call(planTerminal, { ...resumeWork, provider: 'codex' });
    expect(plan.args.slice(0, 2)).toEqual(['resume', 'abc']);
  });
});

describe('inside Herdr', () => {
  const InHerdr = { HERDR_ENV: '1', HERDR_BIN_PATH: '/bin/herdr', HERDR_PANE_ID: 'w1:p1' };

  it('releases the pane when the provider exits, so a closed thread stays closed', async () => {
    const { client } = await serverWithWork({ callerEnv: InHerdr });
    const plan = await client.call(planTerminal, launchWork);
    expect(plan.afterExit).toEqual({
      command: '/bin/herdr',
      args: ['pane', 'release-agent', 'w1:p1', '--source', 'favo', '--agent', 'claude'],
      stampFlag: '--seq',
    });
  });
  it('leaves a personal seat alone', async () => {
    const { client } = await serverWithWork({ callerEnv: InHerdr });
    const plan = await client.call(planTerminal, { ...launchWork, account: 'personal' });
    expect(plan.afterExit).toBeUndefined();
  });
  it('releases nothing outside Herdr', async () => {
    const { client } = await serverWithWork();
    expect((await client.call(planTerminal, launchWork)).afterExit).toBeUndefined();
  });
  it('releases nothing after a sign in', async () => {
    const { client } = await serverWithWork({ callerEnv: InHerdr });
    expect((await client.call(planTerminal, { ...launchWork, action: 'login' })).afterExit).toBeUndefined();
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
  it('explains that a machine on an older favo keeps no threads', async () => {
    const { client, remotes } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    const newer = createTestServer({ hostname: 'devbox' });
    remotes.connect('devbox', {
      async send(request) {
        if (request.method !== listHooks.name) return newer.router.send(request);
        return { id: request.id, ok: false, error: { code: 'unknownMethod', message: 'Unknown method.' } };
      },
    });
    const params = { ...launchWork, action: 'resume', machineId: 'devbox' } as const;
    await expect(client.call(planTerminal, params)).rejects.toMatchObject({ code: 'machineOutdated' });
    await expect(client.call(planTerminal, { ...params, action: 'launch' })).resolves.toBeDefined();
  });
  it('resumes through favo over there, which holds the thread', async () => {
    const { client, remotes } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    remotes.connect('devbox', createTestServer({ hostname: 'devbox' }).router);
    const params = { ...launchWork, action: 'resume', machineId: 'devbox', thread: 'abc' } as const;
    const plan = await client.call(planTerminal, params);
    const encoded = encodeArguments(['resume', 'claude', 'work', 'abc']);
    expect(plan.args).toEqual(['-t', '--', 'bee@devbox', `~/.favo/bin/favo --argv-b64 ${encoded}`]);
  });
  it('uses the provider command name, which is what favo accepts', async () => {
    const { client } = await serverWithWork();
    await client.call(addMachine, { target: 'bee@devbox' });
    const params = { ...launchWork, machineId: 'devbox', provider: 'antigravity' } as const;
    expect((await client.call(planTerminal, params)).args.at(-1)).toEndWith(encodeArguments(['agy', 'work']));
    const login = { ...params, action: 'login' } as const;
    expect((await client.call(planTerminal, login)).args.at(-1)).toEndWith(encodeArguments(['login', 'agy', 'work']));
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
