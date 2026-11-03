import { describe, expect, it } from 'bun:test';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { listDirectories } from '@favo/contracts/rpc/directories/list-directories';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { getMachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { planTerminal } from '@favo/contracts/rpc/terminal/plan-terminal';
import { encodeArguments } from '@favo/domain/terminal/terminal-plan';
import { createTestServer, Home } from '#test/support/test-server';

async function serverWithFolders(options?: Parameters<typeof createTestServer>[0]) {
  const server = createTestServer(options);
  for (const folder of ['Desktop', 'Developer', 'Documents/projects/app', 'Downloads', 'Music', '.config']) {
    await server.fileSystem.ensureDirectory(`${Home}/${folder}`);
  }
  await server.fileSystem.writePrivateText(`${Home}/Dockerfile`, 'not a folder');
  return server;
}

describe('listing folders', () => {
  it('autocompletes what you typed, with folders only, like the T3 picker', async () => {
    const { client } = await serverWithFolders();
    const listing = await client.call(listDirectories, { input: '~/D' });
    expect(listing.entries.map((entry) => entry.name)).toEqual(['Desktop', 'Developer', 'Documents', 'Downloads']);
    expect(listing.entries[2]).toEqual({
      name: 'Documents',
      path: `${Home}/Documents`,
      completion: '~/Documents/',
    });
  });
  it('says whether the exact path is a folder', async () => {
    const { client } = await serverWithFolders();
    expect((await client.call(listDirectories, { input: '~/Documents' })).exists).toBe(true);
    expect((await client.call(listDirectories, { input: '~/D' })).exists).toBe(false);
    expect((await client.call(listDirectories, { input: '~/Dockerfile' })).exists).toBe(false);
  });
  it('lists inside a folder', async () => {
    const { client } = await serverWithFolders();
    const listing = await client.call(listDirectories, { input: '~/Documents/' });
    expect(listing.directory).toBe(`${Home}/Documents`);
    expect(listing.entries.map((entry) => entry.name)).toEqual(['projects']);
  });
  it('hides dot folders until you type a dot', async () => {
    const { client } = await serverWithFolders();
    const names = async (input: string) =>
      (await client.call(listDirectories, { input })).entries.map((entry) => entry.name);
    expect(await names('~/')).not.toContain('.config');
    expect(await names('~/.')).toContain('.config');
  });
  it('returns nothing for a folder that is not there', async () => {
    const { client } = await serverWithFolders();
    expect(await client.call(listDirectories, { input: '/nowhere/x' })).toMatchObject({ entries: [], exists: false });
  });
  it('lists the folders of the machine you asked about', async () => {
    const mac = await serverWithFolders();
    const devbox = createTestServer({ hostname: 'devbox' });
    await devbox.fileSystem.ensureDirectory(`${Home}/only-on-devbox`);
    await mac.client.call(addMachine, { target: 'bee@devbox' });
    mac.remotes.connect('devbox', devbox.router);
    const listing = await mac.client.call(listDirectories, { input: '~/' }, { machineId: 'devbox' });
    expect(listing.entries.map((entry) => entry.name)).toEqual(['only-on-devbox']);
  });
});

describe('launching in a folder', () => {
  const launch = { action: 'launch', account: 'personal', provider: 'claude', args: [] as string[] } as const;

  it('starts the provider there', async () => {
    const { client } = await serverWithFolders();
    const plan = await client.call(planTerminal, { ...launch, directory: `${Home}/Documents` });
    expect(plan.cwd).toBe(`${Home}/Documents`);
  });
  it('leaves the folder alone when none was chosen', async () => {
    const { client } = await serverWithFolders();
    expect((await client.call(planTerminal, launch)).cwd).toBeUndefined();
  });
  it('refuses a folder that does not exist', async () => {
    const { client } = await serverWithFolders();
    await expect(client.call(planTerminal, { ...launch, directory: '/nowhere' })).rejects.toMatchObject({
      code: 'directoryNotFound',
    });
  });
  it('sends the folder to the other machine, which checks it there', async () => {
    const { client } = await serverWithFolders();
    await client.call(addMachine, { target: 'bee@devbox' });
    const plan = await client.call(planTerminal, { ...launch, machineId: 'devbox', directory: '/srv/my app' });
    const encoded = encodeArguments(['--dir', '/srv/my app', 'claude', 'personal']);
    expect(plan.args.at(-1)).toBe(`~/.favo/bin/favo --argv-b64 ${encoded}`);
  });
});

describe('native paths', () => {
  it('shows and copies a Windows path the Windows way', async () => {
    const { client } = createTestServer({ isWindows: true });
    const [personal] = await client.call(listAccounts, {});
    expect(personal?.seats[0]?.path).toBe('\\home\\bee\\.claude');
  });
  it('reports the launch folder as the machine sees it', async () => {
    const { client } = createTestServer({ directory: 'C:\\Users\\bee\\code', isWindows: true });
    expect((await client.call(getMachineStatus, { id: 'local' })).directory).toBe('C:\\Users\\bee\\code');
  });
  it('completes with backslashes on Windows', async () => {
    const { client, fileSystem } = createTestServer({ isWindows: true });
    await fileSystem.ensureDirectory(`${Home}/Documents`);
    const listing = await client.call(listDirectories, { input: '~\\D' });
    expect(listing.entries[0]).toEqual({
      name: 'Documents',
      path: '\\home\\bee\\Documents',
      completion: '~\\Documents\\',
    });
  });
});
