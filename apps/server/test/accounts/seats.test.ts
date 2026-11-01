import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { getSeatStatus } from '@favo/contracts/rpc/seats/get-seat-status';
import { inspectSeat } from '@favo/contracts/rpc/seats/inspect-seat';
import { provisionSeat } from '@favo/contracts/rpc/seats/provision-seat';
import { repairSeats } from '@favo/contracts/rpc/seats/repair-seats';
import { LoginState } from '@favo/contracts/rpc/views';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { createTestServer, Home, seedClaudeBase } from '#test/support/test-server';

const workSeat = { account: 'work', provider: 'claude' } as const;
const seatHome = `${Home}/.favo/accounts/work/claude`;

async function provisionedServer() {
  const server = createTestServer();
  await seedClaudeBase(server.fileSystem);
  await server.client.call(createAccount, { name: 'work' });
  await server.client.call(provisionSeat, workSeat);
  return server;
}

describe('sharing', () => {
  it('links what the base has and nothing else', async () => {
    const { fileSystem } = await provisionedServer();
    expect((await fileSystem.entry(`${seatHome}/CLAUDE.md`)).target).toBe(`${Home}/.claude/CLAUDE.md`);
    expect((await fileSystem.entry(`${seatHome}/skills`)).kind).toBe(EntryKind.link);
    expect((await fileSystem.entry(`${seatHome}/commands`)).kind).toBe(EntryKind.missing);
  });
  it('never carries a login or a thread into another account', async () => {
    const { fileSystem } = await provisionedServer();
    expect((await fileSystem.entry(`${seatHome}/.claude.json`)).kind).toBe(EntryKind.missing);
    expect((await fileSystem.entry(`${seatHome}/projects`)).kind).toBe(EntryKind.missing);
  });
  it('picks up an item that appeared in the base later', async () => {
    const { client, fileSystem } = await provisionedServer();
    await fileSystem.ensureDirectory(`${Home}/.claude/commands`);
    const repair = await client.call(provisionSeat, workSeat);
    expect(repair.linked).toEqual(['commands']);
    expect((await fileSystem.entry(`${seatHome}/commands`)).kind).toBe(EntryKind.link);
  });
  it('heals a broken link', async () => {
    const { client, fileSystem } = await provisionedServer();
    await fileSystem.unlink(`${seatHome}/skills`);
    await fileSystem.link('/gone', `${seatHome}/skills`);
    expect((await client.call(provisionSeat, workSeat)).linked).toEqual(['skills']);
    expect((await fileSystem.entry(`${seatHome}/skills`)).target).toBe(`${Home}/.claude/skills`);
  });
  it('reports a real file where a link belongs and leaves it alone', async () => {
    const { client, fileSystem } = await provisionedServer();
    await fileSystem.unlink(`${seatHome}/settings.json`);
    await fileSystem.writePrivateText(`${seatHome}/settings.json`, 'mine');
    const repair = await client.call(provisionSeat, workSeat);
    expect(repair.problems).toEqual([{ name: 'settings.json', state: 'conflict' }]);
    expect(await fileSystem.readText(`${seatHome}/settings.json`)).toBe('mine');
  });
  it('does nothing to the personal account', async () => {
    const { client, fileSystem } = await provisionedServer();
    const repair = await client.call(provisionSeat, { account: 'personal', provider: 'claude' });
    expect(repair).toEqual({ account: 'personal', provider: 'claude', linked: [], problems: [] });
    expect((await fileSystem.entry(`${Home}/.claude/CLAUDE.md`)).kind).toBe(EntryKind.file);
  });
  it('repairs every provisioned seat of every account', async () => {
    const { client, fileSystem } = await provisionedServer();
    await fileSystem.ensureDirectory(`${Home}/.claude/commands`);
    const repairs = await client.call(repairSeats, {});
    expect(repairs).toHaveLength(1);
    expect(repairs[0]!.linked).toEqual(['commands']);
  });
  it('shows every shared item with its state, and what favo has not classified', async () => {
    const { client, fileSystem } = await provisionedServer();
    await fileSystem.ensureDirectory(`${Home}/.claude/brand-new-feature`);
    const inspection = await client.call(inspectSeat, workSeat);
    expect(inspection.items.find((item) => item.name === 'skills')?.state).toBe('linked');
    expect(inspection.items.find((item) => item.name === 'commands')?.state).toBe('notInBase');
    expect(inspection.privateItems).toContain('projects');
    expect(inspection.unclassified).toEqual(['brand-new-feature']);
  });
});

describe('antigravity private home', () => {
  it('mirrors the real home and shares only the named config', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(`${Home}/.gitconfig`, '[user]');
    await fileSystem.ensureDirectory(`${Home}/.ssh`);
    await fileSystem.writePrivateText(`${Home}/.gemini/antigravity-cli/settings.json`, '{}');
    await fileSystem.ensureDirectory(`${Home}/.gemini/antigravity-cli/conversations`);
    await client.call(createAccount, { name: 'work' });
    await client.call(provisionSeat, { account: 'work', provider: 'antigravity' });
    const seat = `${Home}/.favo/accounts/work/antigravity`;
    expect((await fileSystem.entry(`${seat}/.gitconfig`)).target).toBe(`${Home}/.gitconfig`);
    expect((await fileSystem.entry(`${seat}/.ssh`)).target).toBe(`${Home}/.ssh`);
    expect((await fileSystem.entry(`${seat}/.gemini`)).kind).toBe(EntryKind.directory);
    expect((await fileSystem.entry(`${seat}/.gemini/antigravity-cli/settings.json`)).kind).toBe(EntryKind.link);
    expect((await fileSystem.entry(`${seat}/.gemini/antigravity-cli/conversations`)).kind).toBe(EntryKind.missing);
    const inspection = await client.call(inspectSeat, { account: 'work', provider: 'antigravity' });
    expect(inspection.mirrored).toBeGreaterThan(1);
  });
});

describe('a seat with a linked folder in it', () => {
  async function seatWithLinkedGemini() {
    const server = createTestServer();
    await server.fileSystem.writePrivateText(`${Home}/.gemini/GEMINI.md`, 'be kind');
    await server.fileSystem.ensureDirectory(`${Home}/elsewhere`);
    const seat = `${Home}/.favo/accounts/work/antigravity`;
    await server.client.call(createAccount, { name: 'work' });
    await server.fileSystem.ensureDirectory(seat);
    await server.fileSystem.link(`${Home}/elsewhere`, `${seat}/.gemini`);
    return { ...server, seat };
  }
  const geminiSeat = { account: 'work', provider: 'antigravity' } as const;

  it('reports what lives under the link and writes nothing through it', async () => {
    const { client, fileSystem, seat } = await seatWithLinkedGemini();
    const repair = await client.call(provisionSeat, geminiSeat);
    expect(repair.linked).toEqual([]);
    expect(repair.problems).toContainEqual({ name: '.gemini/GEMINI.md', state: 'conflict' });
    expect((await fileSystem.entry(`${seat}/.gemini/GEMINI.md`)).kind).toBe(EntryKind.missing);
  });
  it('shows the same problem when you inspect the seat', async () => {
    const { client } = await seatWithLinkedGemini();
    const { items } = await client.call(inspectSeat, geminiSeat);
    expect(items).toContainEqual({ name: '.gemini/GEMINI.md', state: 'conflict' });
  });
});

describe('seat status', () => {
  it('reads the login from the provider shim with the seat isolated', async () => {
    const { client, clis } = await provisionedServer();
    clis.claude.login = { login: LoginState.signedIn, identity: 'bee@hive.dev', plan: 'max' };
    const status = await client.call(getSeatStatus, workSeat);
    expect(status).toEqual({ login: 'signedIn', identity: 'bee@hive.dev', plan: 'max', problems: 0 });
    expect(clis.claude.sessions.at(-1)?.env.CLAUDE_CONFIG_DIR).toBe(seatHome);
  });
  it('does not isolate the personal account', async () => {
    const { client, clis } = await provisionedServer();
    await client.call(getSeatStatus, { account: 'personal', provider: 'claude' }).catch(() => undefined);
    await client.call(getSeatStatus, { account: 'personal', provider: 'codex' });
    expect(clis.codex.sessions).toHaveLength(0);
    expect(clis.claude.sessions.at(-1)?.env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });
  it('says signed out without running anything when the seat has no folder', async () => {
    const { client, clis } = await provisionedServer();
    const status = await client.call(getSeatStatus, { account: 'work', provider: 'codex' });
    expect(status.login).toBe('signedOut');
    expect(clis.codex.sessions).toHaveLength(0);
  });
  it('says not installed when the provider is missing', async () => {
    const { client, fileSystem } = createTestServer({ installed: [] });
    await fileSystem.ensureDirectory(`${Home}/.claude`);
    const status = await client.call(getSeatStatus, { account: 'personal', provider: 'claude' });
    expect(status.login).toBe('notInstalled');
  });
  it('counts link problems', async () => {
    const { client, fileSystem } = await provisionedServer();
    await fileSystem.unlink(`${seatHome}/skills`);
    expect((await client.call(getSeatStatus, workSeat)).problems).toBe(1);
  });
  it('refuses a seat path that climbs out of the accounts folder', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.ensureDirectory(`${Home}/.favo/precious`);
    await expect(client.call(provisionSeat, { account: '../precious', provider: 'claude' })).rejects.toMatchObject({
      code: 'invalidAccountName',
    });
  });
  it('refuses an account that does not exist', async () => {
    const { client } = createTestServer();
    await expect(client.call(getSeatStatus, { account: 'ghost', provider: 'claude' })).rejects.toMatchObject({
      code: 'accountNotFound',
    });
  });
});
