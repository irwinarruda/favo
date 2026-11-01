import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { removeAccount } from '@favo/contracts/rpc/accounts/remove-account';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { provisionSeat } from '@favo/contracts/rpc/seats/provision-seat';
import { listThreads } from '@favo/contracts/rpc/threads/list-threads';
import { recordThread } from '@favo/contracts/rpc/threads/record-thread';
import { reportThread } from '@favo/contracts/rpc/threads/report-thread';
import type { ProviderId } from '@favo/domain/providers/provider';
import { ThreadsPerFolder } from '@favo/domain/threads/thread';
import { createTestServer, Home } from '#test/support/test-server';

const Project = `${Home}/projects/hive`;
const WorkClaude = `${Home}/.favo/accounts/work/claude`;
const WorkEnv = { FAVO_ACCOUNT: 'work', FAVO_LAUNCH: 'launch-1', CLAUDE_CONFIG_DIR: WorkClaude };
const Personal = { account: 'personal', provider: 'claude' } as const;
const Work = { account: 'work', provider: 'claude' } as const;

async function seatServer(options: Parameters<typeof createTestServer>[0] = {}) {
  const server = createTestServer({ callerEnv: WorkEnv, ...options });
  await server.fileSystem.ensureDirectory(Project);
  await server.client.call(createAccount, { name: 'work' });
  return server;
}

function event(id: string, overrides: Partial<Parameters<typeof recordThread.params.parse>[0]> = {}) {
  return { provider: 'claude' as ProviderId, id, directory: Project, isFresh: true, ...overrides };
}

describe('keeping a thread', () => {
  it('remembers it for the seat and the folder', async () => {
    const { client } = await seatServer();
    expect(await client.call(recordThread, event('abc'))).toEqual({ isRecorded: true });
    expect(await client.call(listThreads, Work)).toEqual([
      { id: 'abc', directory: Project, updatedAt: '2026-10-31T12:00:00.000Z', isGuess: false, isDirectoryGone: false },
    ]);
  });
  it('keeps two sessions in one folder, because both are real', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('first'));
    await client.call(recordThread, event('second'));
    const threads = await client.call(listThreads, Work);
    expect(threads.map(({ id }) => id).toSorted()).toEqual(['first', 'second']);
  });
  it('saves one file per thread, so hooks at the same moment cannot lose each other', async () => {
    const { client, fileSystem, paths } = await seatServer();
    await Promise.all(['a', 'b', 'c'].map((id) => client.call(recordThread, event(id))));
    expect((await fileSystem.list(`${paths.threads}/work/claude`)).toSorted()).toEqual(['a.json', 'b.json', 'c.json']);
  });
  it('keeps a short list for each folder', async () => {
    const { client, fileSystem, paths } = await seatServer();
    for (let index = 0; index < ThreadsPerFolder + 2; index++) {
      await client.call(recordThread, event(`t${index}`));
    }
    expect(await fileSystem.list(`${paths.threads}/work/claude`)).toHaveLength(ThreadsPerFolder);
  });
  it('stores a personal seat beside the cells, not as a cell', async () => {
    const { client, fileSystem, paths } = await seatServer({ callerEnv: { FAVO_ACCOUNT: 'personal' } });
    await client.call(recordThread, event('abc'));
    expect(await client.call(listThreads, Personal)).toHaveLength(1);
    expect(await fileSystem.list(paths.accounts)).toEqual(['work']);
  });
});

describe('what favo refuses to keep', () => {
  it('ignores a provider started outside favo', async () => {
    const { client, fileSystem, paths } = await seatServer({ callerEnv: {} });
    expect(await client.call(recordThread, event('abc'))).toEqual({ isRecorded: false });
    expect(await fileSystem.list(paths.threads)).toEqual([]);
  });
  it('ignores a run inside the session that belongs to another process', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('real', { ownerProcess: '100' }));
    expect(await client.call(recordThread, event('nested', { ownerProcess: '200' }))).toEqual({ isRecorded: false });
    expect((await client.call(listThreads, Work)).map(({ id }) => id)).toEqual(['real']);
  });
  it('keeps a thread when the process that reported before is gone, as a forking login shell is', async () => {
    const { client, processes } = await seatServer();
    await client.call(recordThread, event('first', { ownerProcess: '100' }));
    processes.gone.add(100);
    expect(await client.call(recordThread, event('second', { ownerProcess: '200' }))).toEqual({ isRecorded: true });
  });
  it('keeps a second thread from the same process, as Codex /new sends it', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('first', { ownerProcess: '100' }));
    expect(await client.call(recordThread, event('second', { ownerProcess: '100' }))).toEqual({ isRecorded: true });
  });
  it('ignores another provider an agent ran from inside the seat', async () => {
    const { client } = await seatServer();
    const nested = event('codex-thread', { provider: 'codex' });
    expect(await client.call(recordThread, nested)).toEqual({ isRecorded: false });
  });
  it('ignores OpenCode an agent ran on its own data folder', async () => {
    const { client } = await seatServer();
    expect(await client.call(recordThread, event('other', { provider: 'opencode' }))).toEqual({ isRecorded: false });
  });
  it('keeps OpenCode running on the data folder of the seat', async () => {
    const callerEnv = { ...WorkEnv, XDG_DATA_HOME: `${Home}/.favo/accounts/work/opencode` };
    const { client } = await seatServer({ callerEnv });
    expect(await client.call(recordThread, event('abc', { provider: 'opencode' }))).toEqual({ isRecorded: true });
  });
  it('keeps Antigravity, whose seat is its whole home', async () => {
    const callerEnv = { ...WorkEnv, HOME: `${Home}/.favo/accounts/work/antigravity` };
    const { client } = await seatServer({ callerEnv });
    expect(await client.call(recordThread, event('abc', { provider: 'antigravity' }))).toEqual({ isRecorded: true });
  });
  it('fails on a cell that is gone, which the hook swallows', async () => {
    const { client } = await seatServer({ callerEnv: { ...WorkEnv, FAVO_ACCOUNT: 'gone' } });
    await expect(client.call(recordThread, event('abc'))).rejects.toMatchObject({ code: 'accountNotFound' });
  });
  it('fails on a name that could leave the folder', async () => {
    const { client } = await seatServer({ callerEnv: { ...WorkEnv, FAVO_ACCOUNT: '../evil' } });
    await expect(client.call(recordThread, event('abc'))).rejects.toMatchObject({ code: 'invalidAccountName' });
  });
});

describe('an empty session', () => {
  const transcript = `${WorkClaude}/projects/hive/empty.jsonl`;

  it('is not shown until the provider has written the thread', async () => {
    const { client, fileSystem } = await seatServer();
    await client.call(recordThread, event('empty', { transcript }));
    expect(await client.call(listThreads, Work)).toEqual([]);
    await fileSystem.writePrivateText(transcript, '{}');
    expect((await client.call(listThreads, Work)).map(({ id }) => id)).toEqual(['empty']);
  });
  it('never hides the last real thread', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('real'));
    await client.call(recordThread, event('empty', { transcript }));
    expect((await client.call(listThreads, Work)).map(({ id }) => id)).toEqual(['real']);
  });
  it('never pushes a real thread out of the list', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('real'));
    for (let index = 0; index < ThreadsPerFolder + 2; index++) {
      await client.call(recordThread, event(`empty${index}`, { transcript: `${transcript}${index}` }));
    }
    expect((await client.call(listThreads, Work)).map(({ id }) => id)).toEqual(['real']);
  });
});

describe('the folder of a thread', () => {
  it('comes first when it is the folder asked about', async () => {
    const { client, fileSystem } = await seatServer();
    await fileSystem.ensureDirectory(`${Home}/other`);
    await client.call(recordThread, event('there', { directory: `${Home}/other` }));
    await client.call(recordThread, event('here'));
    const threads = await client.call(listThreads, { ...Work, directory: `${Home}/other` });
    expect(threads.map(({ id }) => id)).toEqual(['there', 'here']);
  });
  it('says so when it is gone', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('abc', { directory: `${Home}/deleted` }));
    expect((await client.call(listThreads, Work))[0]?.isDirectoryGone).toBe(true);
  });
  it('shows Windows paths the way Windows does', async () => {
    const { client } = await seatServer({
      isWindows: true,
      callerEnv: { FAVO_ACCOUNT: 'personal' },
      directory: 'C:/code',
    });
    await client.call(recordThread, event('abc', { directory: 'C:/code' }));
    expect((await client.call(listThreads, Personal))[0]?.directory).toBe('C:\\code');
  });
});

describe('with no hook', () => {
  const found = { id: 'found', directory: Project, updatedAt: '2026-10-30T12:00:00.000Z' };

  async function serverWithCodexSeat() {
    const server = await seatServer();
    await server.client.call(provisionSeat, { account: 'work', provider: 'codex' });
    return server;
  }

  it('asks the provider and marks the answer as a guess', async () => {
    const { client, clis } = await serverWithCodexSeat();
    clis.codex.foundThreads = [found];
    const threads = await client.call(listThreads, { ...Work, provider: 'codex' });
    expect(threads).toEqual([{ ...found, isGuess: true, isDirectoryGone: false }]);
  });
  it('searches in the seat and the folder asked about', async () => {
    const { client, clis } = await serverWithCodexSeat();
    await client.call(listThreads, { ...Work, provider: 'codex' });
    expect(clis.codex.threadSearches[0]).toMatchObject({
      seatHome: `${Home}/.favo/accounts/work/codex`,
      directory: Project,
      session: { env: { CODEX_HOME: `${Home}/.favo/accounts/work/codex` } },
    });
  });
  it('never asks about a seat that was never set up, because asking would create it', async () => {
    const { client, clis } = await seatServer();
    await client.call(listThreads, { ...Work, provider: 'opencode' });
    expect(clis.opencode.threadSearches).toEqual([]);
  });
  it('stops guessing as soon as a hook reported this folder', async () => {
    const { client, clis } = await seatServer();
    clis.claude.foundThreads = [found];
    await client.call(recordThread, event('real'));
    expect((await client.call(listThreads, Work)).map(({ id }) => id)).toEqual(['real']);
    expect(clis.claude.threadSearches).toEqual([]);
  });
  it('shows a provider that is not installed as having no threads', async () => {
    const { client } = await seatServer({ installed: [] });
    expect(await client.call(listThreads, Work)).toEqual([]);
  });
});

describe('asking about a seat', () => {
  it('refuses a cell that does not exist', async () => {
    const { client } = await seatServer();
    await expect(client.call(listThreads, { ...Work, account: 'ghost' })).rejects.toMatchObject({
      code: 'accountNotFound',
    });
  });
});

describe('deleting a cell', () => {
  it('takes its threads to the trash with it', async () => {
    const { client, fileSystem } = await seatServer();
    await client.call(recordThread, event('abc'));
    const { trashedTo } = await client.call(removeAccount, { name: 'work' });
    expect(await fileSystem.readText(`${trashedTo}/threads/claude/abc.json`)).toContain('"abc"');
  });
  it('leaves a new cell with the same name empty', async () => {
    const { client } = await seatServer();
    await client.call(recordThread, event('abc'));
    await client.call(removeAccount, { name: 'work' });
    await client.call(createAccount, { name: 'work' });
    expect(await client.call(listThreads, Work)).toEqual([]);
  });
  it('works for a cell that never had a thread', async () => {
    const { client } = await seatServer();
    await expect(client.call(removeAccount, { name: 'work' })).resolves.toBeDefined();
  });
});

describe('on another machine', () => {
  it('keeps the thread over there', async () => {
    const mac = createTestServer();
    const devbox = createTestServer({ hostname: 'devbox', callerEnv: WorkEnv });
    await devbox.client.call(createAccount, { name: 'work' });
    await devbox.client.call(recordThread, event('over-there'));
    await mac.client.call(addMachine, { target: 'bee@devbox' });
    mac.remotes.connect('devbox', devbox.router);
    const threads = await mac.client.call(listThreads, Work, { machineId: 'devbox' });
    expect(threads.map(({ id }) => id)).toEqual(['over-there']);
    await expect(mac.client.call(listThreads, Personal)).resolves.toEqual([]);
  });
});

describe('telling Herdr', () => {
  const InHerdr = { ...WorkEnv, HERDR_ENV: '1', HERDR_BIN_PATH: '/bin/herdr', HERDR_PANE_ID: 'w1:p1' };
  const OnPath = ['claude', 'codex', 'favo'];

  it('reports how to resume this seat, by its folder name', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: OnPath });
    await client.call(recordThread, event('abc'));
    expect(herdr.reports).toEqual([
      {
        agent: 'claude',
        threadId: 'abc',
        resume: ['favo', 'resume', 'work', 'claude', 'abc'],
        seq: Date.parse('2026-10-31T12:00:00.000Z') * 1000,
        pane: { binary: '/bin/herdr', paneId: 'w1:p1' },
      },
    ]);
  });
  it('says nothing outside Herdr', async () => {
    const { client, herdr } = await seatServer({ installed: OnPath });
    await client.call(recordThread, event('abc'));
    expect(herdr.reports).toEqual([]);
  });
  it('leaves a personal seat alone', async () => {
    const callerEnv = { ...InHerdr, FAVO_ACCOUNT: 'personal' };
    const { client, herdr } = await seatServer({ callerEnv, installed: OnPath });
    await client.call(recordThread, event('abc'));
    expect(herdr.reports).toEqual([]);
  });
  it('says nothing when the pane could not find favo to run it', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: ['claude'] });
    await client.call(recordThread, event('abc'));
    expect(herdr.reports).toEqual([]);
  });
  it('still reports when another hook dropped the same old record first', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: OnPath });
    for (let index = 0; index < ThreadsPerFolder; index++) await client.call(recordThread, event(`old${index}`));
    herdr.reports.length = 0;
    await Promise.all([client.call(recordThread, event('new0')), client.call(recordThread, event('new1'))]);
    expect(herdr.reports.map(({ threadId }) => threadId).toSorted()).toEqual(['new0', 'new1']);
  });
  it('never reports a run it refused to keep', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: OnPath });
    await client.call(recordThread, event('real', { ownerProcess: '100' }));
    await client.call(recordThread, event('nested', { ownerProcess: '200' }));
    expect(herdr.reports.map(({ threadId }) => threadId)).toEqual(['real']);
  });
  it('hands a report that came too early to a process of its own, so the provider does not wait', async () => {
    const { client, herdr, processes } = await seatServer({
      callerEnv: InHerdr,
      installed: OnPath,
      binary: '/opt/favo',
    });
    herdr.answers.push('tooEarly');
    await client.call(recordThread, event('abc'));
    expect(herdr.reports).toHaveLength(1);
    expect(processes.calls.at(-1)).toMatchObject({ command: '/opt/favo', args: ['hook', 'claude', '--report', 'abc'] });
  });
  it('retries until Herdr accepts', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: OnPath });
    herdr.answers.push('tooEarly', 'tooEarly', 'accepted');
    await client.call(reportThread, { provider: 'claude', id: 'abc' });
    expect(herdr.reports).toHaveLength(3);
  });
  it('stops retrying on any other answer', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: OnPath });
    herdr.answers.push('tooEarly', 'failed');
    await client.call(reportThread, { provider: 'claude', id: 'abc' });
    expect(herdr.reports).toHaveLength(2);
  });
  it('gives up after a while instead of running forever', async () => {
    const { client, herdr } = await seatServer({ callerEnv: InHerdr, installed: OnPath });
    herdr.answers.push(...Array.from({ length: 100 }, () => 'tooEarly' as const));
    await client.call(reportThread, { provider: 'claude', id: 'abc' });
    expect(herdr.reports.length).toBeLessThan(100);
  });
});
