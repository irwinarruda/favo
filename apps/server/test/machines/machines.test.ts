import { describe, expect, it } from 'bun:test';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { discoverMachines } from '@favo/contracts/rpc/machines/discover-machines';
import { getMachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { installMachine } from '@favo/contracts/rpc/machines/install-machine';
import { listMachines } from '@favo/contracts/rpc/machines/list-machines';
import { removeMachine } from '@favo/contracts/rpc/machines/remove-machine';
import { getSeatStatus } from '@favo/contracts/rpc/seats/get-seat-status';
import { LoginState } from '@favo/contracts/rpc/views';
import { FavoVersion } from '@favo/contracts/version';
import { installPlanFor } from '@favo/domain/machines/remote-commands';
import { DomainErrorCode } from '@favo/domain/shared/domain-error';
import { createTestServer, Home } from '#test/support/test-server';

const VersionedAssets = `${Home}/.favo/assets/${FavoVersion}`;

async function twoMachines() {
  const mac = createTestServer();
  const devbox = createTestServer({ hostname: 'devbox' });
  await mac.client.call(addMachine, { target: 'bee@devbox' });
  mac.remotes.connect('devbox', devbox.router);
  return { mac, devbox };
}

describe('the machine list', () => {
  it('always has this machine first', async () => {
    const { client } = createTestServer();
    expect(await client.call(listMachines, {})).toEqual([{ id: 'local', name: 'macbook', isLocal: true }]);
  });
  it('adds a machine it can reach and remembers it', async () => {
    const { client, fileSystem, paths } = createTestServer();
    const machine = await client.call(addMachine, { target: 'bee@devbox' });
    expect(machine).toEqual({ id: 'devbox', name: 'devbox', target: 'bee@devbox', isLocal: false, system: 'posix' });
    expect(await fileSystem.readText(paths.machinesFile)).toContain('bee@devbox');
    expect((await client.call(listMachines, {})).map((candidate) => candidate.id)).toEqual(['local', 'devbox']);
  });
  it('refuses a machine it cannot reach, and says why', async () => {
    const { client, ssh } = createTestServer();
    ssh.unreachable.add('nope');
    await expect(client.call(addMachine, { target: 'nope' })).rejects.toMatchObject({
      code: 'machineUnreachable',
      message: 'nope: ssh: connect to host: timed out',
    });
  });
  it('quotes the reason ssh gave without its escape sequences', async () => {
    const { client, ssh } = createTestServer();
    ssh.reply('echo favo', { code: 255, stderr: 'banner\nDenied\u001b]0;pwned\u0007\u001b[2J\u009b31m\r\n' });
    await expect(client.call(addMachine, { target: 'bee@devbox' })).rejects.toMatchObject({
      message: 'bee@devbox: Denied]0;pwned[2J31m',
    });
  });
  it('refuses a stored target that would reach ssh as an option', async () => {
    const { client, fileSystem, paths } = createTestServer();
    const stored = { id: 'evil', name: 'evil', target: '-oProxyCommand=touch /tmp/pwned', isLocal: false };
    await fileSystem.writePrivateText(paths.machinesFile, JSON.stringify({ machines: [stored] }));
    await expect(client.call(listMachines, {})).rejects.toMatchObject({
      code: 'invalidMachineTarget',
      message: `The target of "evil" in ${paths.machinesFile} must look like user@host.`,
    });
  });
  it('refuses a stored machine with no target, because every stored machine is remote', async () => {
    const { client, fileSystem, paths } = createTestServer();
    const stored = { id: 'evil', name: 'evil', isLocal: false };
    await fileSystem.writePrivateText(paths.machinesFile, JSON.stringify({ machines: [stored] }));
    await expect(client.call(listMachines, {})).rejects.toMatchObject({ code: 'invalidMachineTarget' });
  });
  it('refuses the same machine twice', async () => {
    const { client } = createTestServer();
    await client.call(addMachine, { target: 'bee@devbox' });
    await expect(client.call(addMachine, { target: 'bee@devbox' })).rejects.toMatchObject({
      code: 'machineExists',
    });
  });
  it('removes a machine and closes its connection', async () => {
    const { mac } = await twoMachines();
    await mac.client.call(removeMachine, { id: 'devbox' });
    expect(mac.remotes.closed).toEqual(['devbox']);
    expect(await mac.client.call(listMachines, {})).toHaveLength(1);
  });
});

describe('forwarding', () => {
  it('runs an action on the other machine, not on this one', async () => {
    const { mac, devbox } = await twoMachines();
    await mac.client.call(createAccount, { name: 'side' }, { machineId: 'devbox' });
    const there = await devbox.client.call(listAccounts, {});
    const here = await mac.client.call(listAccounts, {});
    expect(there.map((account) => account.name)).toEqual(['personal', 'side']);
    expect(here.map((account) => account.name)).toEqual(['personal']);
  });
  it('reads the other machine as if it were local', async () => {
    const { mac, devbox } = await twoMachines();
    await devbox.fileSystem.ensureDirectory(`${Home}/.claude`);
    devbox.clis.claude.login = { login: LoginState.signedIn, identity: 'devbox@bee.dev' };
    const status = await mac.client.call(
      getSeatStatus,
      { account: 'personal', provider: 'claude' },
      { machineId: 'devbox' }
    );
    expect(status.identity).toBe('devbox@bee.dev');
    expect(mac.clis.claude.sessions).toHaveLength(0);
  });
  it('treats the local id as this machine', async () => {
    const { mac } = await twoMachines();
    await mac.client.call(createAccount, { name: 'here' }, { machineId: 'local' });
    expect((await mac.client.call(listAccounts, {})).map((account) => account.name)).toContain('here');
  });
  it('brings an error from the other machine back with its code', async () => {
    const { mac } = await twoMachines();
    await mac.client.call(createAccount, { name: 'side' }, { machineId: 'devbox' });
    await expect(mac.client.call(createAccount, { name: 'side' }, { machineId: 'devbox' })).rejects.toMatchObject({
      code: 'accountExists',
    });
  });
  it('fails clearly when the machine is unknown', async () => {
    const { client } = createTestServer();
    await expect(client.call(listAccounts, {}, { machineId: 'ghost' })).rejects.toMatchObject({
      code: 'machineNotFound',
    });
  });
});

describe('machine status', () => {
  it('reports online with the version running there', async () => {
    const { mac } = await twoMachines();
    const status = await mac.client.call(getMachineStatus, { id: 'devbox' });
    expect(status).toEqual({
      state: 'online',
      version: '0.1.0',
      hostname: 'devbox',
      directory: `${Home}/projects/hive`,
    });
  });
  it('is always online for this machine', async () => {
    const { client } = createTestServer();
    expect((await client.call(getMachineStatus, { id: 'local' })).state).toBe('online');
  });
  it('reports the directory a launch runs in, for each machine', async () => {
    const mac = createTestServer({ directory: '/Users/bee/code/app' });
    const remote = createTestServer({ hostname: 'devbox', directory: '/home/remote' });
    await mac.client.call(addMachine, { target: 'bee@devbox' });
    mac.remotes.connect('devbox', remote.router);
    expect((await mac.client.call(getMachineStatus, { id: 'local' })).directory).toBe('/Users/bee/code/app');
    expect((await mac.client.call(getMachineStatus, { id: 'devbox' })).directory).toBe('/home/remote');
  });
  it('reports a machine without favo so the client can offer to install it', async () => {
    const { mac } = await twoMachines();
    mac.remotes.failure = DomainErrorCode.machineNeedsInstall;
    expect((await mac.client.call(getMachineStatus, { id: 'devbox' })).state).toBe('needsInstall');
  });
  it('reports a machine that is down', async () => {
    const { mac } = await twoMachines();
    mac.remotes.failure = DomainErrorCode.machineUnreachable;
    const status = await mac.client.call(getMachineStatus, { id: 'devbox' });
    expect(status.state).toBe('offline');
    expect(status.message).toContain('devbox');
  });
  it('reports a machine on an older protocol', async () => {
    const mac = createTestServer();
    await mac.client.call(addMachine, { target: 'bee@devbox' });
    mac.remotes.connect('devbox', {
      async send(request) {
        const result = {
          version: '0.0.1',
          protocol: 0,
          hostname: 'x',
          platform: 'linux',
          arch: 'x64',
          home: '/h',
          directory: '/h',
        };
        return { id: request.id, ok: true, result };
      },
    });
    expect((await mac.client.call(getMachineStatus, { id: 'devbox' })).state).toBe('outdated');
  });
});

describe('installing favo on a machine', () => {
  async function serverWithAsset() {
    const server = createTestServer();
    await server.client.call(addMachine, { target: 'bee@devbox' });
    await server.fileSystem.writePrivateText(`${VersionedAssets}/favo-linux-x64`, 'binary');
    server.ssh.reply('uname -sm', { stdout: 'Linux x86_64\n' });
    return server;
  }

  it('uploads the binary that machine can run, then swaps it in', async () => {
    const { client, ssh } = await serverWithAsset();
    const { activate } = installPlanFor('posix', 'Linux x86_64');
    ssh.reply(activate, { stdout: '0.1.0\n' });
    expect(await client.call(installMachine, { id: 'devbox' })).toEqual({ version: '0.1.0' });
    expect(ssh.uploads).toEqual([
      { target: 'bee@devbox', localPath: `${VersionedAssets}/favo-linux-x64`, remotePath: '.favo/bin/favo.new' },
    ]);
  });
  it('never reports success without seeing favo run there', async () => {
    const { client } = await serverWithAsset();
    await expect(client.call(installMachine, { id: 'devbox' })).rejects.toMatchObject({
      code: 'machineUnreachable',
      message: 'favo did not start on devbox.',
    });
  });
  it('refuses a system favo cannot run on', async () => {
    const { client, ssh } = await serverWithAsset();
    ssh.reply('uname -sm', { stdout: 'FreeBSD amd64\n' });
    await expect(client.call(installMachine, { id: 'devbox' })).rejects.toMatchObject({
      code: 'unsupportedPlatform',
    });
  });
  it('quotes a system it cannot run on without its escape sequences', async () => {
    const { client, ssh } = await serverWithAsset();
    ssh.reply('uname -sm', { stdout: '\u001b]0;pwned\u0007Evil\u009b2J amd64\n' });
    await expect(client.call(installMachine, { id: 'devbox' })).rejects.toMatchObject({
      message: 'favo does not run on "]0;pwnedEvil2J amd64".',
    });
  });
});

describe('getting the binary a machine needs', () => {
  const uname = 'Linux x86_64';
  const asset = 'favo-linux-x64';

  async function serverWithNoBinary() {
    const server = createTestServer();
    await server.client.call(addMachine, { target: 'bee@devbox' });
    server.ssh.reply('uname -sm', { stdout: `${uname}\n` });
    server.ssh.reply(installPlanFor('posix', uname).activate, { stdout: `${FavoVersion}\n` });
    return server;
  }

  it('uses a binary already on disk and downloads nothing', async () => {
    const { client, fileSystem, paths, releaseAssets, ssh } = await serverWithNoBinary();
    await fileSystem.writePrivateText(`${VersionedAssets}/${asset}`, 'from dist');
    await client.call(installMachine, { id: 'devbox' });
    expect(releaseAssets.downloads).toEqual([]);
    expect(ssh.uploads.map((upload) => upload.localPath)).toEqual([`${VersionedAssets}/${asset}`]);
    await fileSystem.writePrivateText(`${paths.versionedAssets}/${asset}`, 'fresh local build');
    await client.call(installMachine, { id: 'devbox' });
    expect(ssh.uploads.at(-1)?.localPath).toBe(`${paths.versionedAssets}/${asset}`);
  });
  it('downloads a missing binary for this version and uploads that exact file', async () => {
    const { client, fileSystem, paths, releaseAssets, ssh } = await serverWithNoBinary();
    const destination = `${paths.assets}/${FavoVersion}/${asset}`;
    expect(await client.call(installMachine, { id: 'devbox' })).toEqual({ version: FavoVersion });
    expect(releaseAssets.downloads).toEqual([{ assetName: asset, version: FavoVersion, destination }]);
    expect(ssh.uploads).toEqual([{ target: 'bee@devbox', localPath: destination, remotePath: '.favo/bin/favo.new' }]);
    expect(await fileSystem.readText(destination)).toBe(`${asset} ${FavoVersion}`);
  });
  it('keeps what it downloaded, so the next machine needs no download', async () => {
    const { client, releaseAssets, ssh } = await serverWithNoBinary();
    await client.call(installMachine, { id: 'devbox' });
    await client.call(installMachine, { id: 'devbox' });
    expect(releaseAssets.downloads).toHaveLength(1);
    expect(ssh.uploads).toHaveLength(2);
  });
  it('does not reuse a binary from another version', async () => {
    const { client, fileSystem, paths, releaseAssets, ssh } = await serverWithNoBinary();
    await fileSystem.writePrivateText(`${paths.assets}/${asset}`, 'unversioned, from an old favo');
    await fileSystem.writePrivateText(`${paths.assets}/0.0.1/${asset}`, 'from an old favo');
    await client.call(installMachine, { id: 'devbox' });
    expect(releaseAssets.downloads).toHaveLength(1);
    expect(ssh.uploads.map((upload) => upload.localPath)).toEqual([`${paths.versionedAssets}/${asset}`]);
  });
  it('surfaces a failed download and leaves the machine untouched', async () => {
    const { client, releaseAssets, ssh } = await serverWithNoBinary();
    const { prepare } = installPlanFor('posix', uname);
    releaseAssets.failure = `Could not download ${asset}.gz (favo ${FavoVersion}): it timed out`;
    await expect(client.call(installMachine, { id: 'devbox' })).rejects.toMatchObject({
      code: 'assetMissing',
      message: releaseAssets.failure,
    });
    expect(ssh.uploads).toEqual([]);
    expect(ssh.commands).not.toContain(prepare);
  });
});

describe('a Windows machine', () => {
  async function serverWithWindows() {
    const server = createTestServer();
    server.ssh.reply('uname -sm', { code: 1, stderr: "'uname' is not recognized" });
    server.ssh.reply('cmd.exe /c ver', { stdout: 'Microsoft Windows [Version 10.0.26200.6899]' });
    await server.fileSystem.writePrivateText(`${VersionedAssets}/favo-windows-x64.exe`, 'binary');
    return server;
  }

  it('is recognized when it joins, and remembered', async () => {
    const { client, fileSystem, paths } = await serverWithWindows();
    const machine = await client.call(addMachine, { target: 'bee@winbox' });
    expect(machine.system).toBe('windows');
    expect(await fileSystem.readText(paths.machinesFile)).toContain('"system": "windows"');
    expect((await client.call(listMachines, {})).at(-1)?.system).toBe('windows');
  });
  it('gets the Windows binary', async () => {
    const { client, ssh } = await serverWithWindows();
    await client.call(addMachine, { target: 'bee@winbox' });
    ssh.reply(installPlanFor('windows', '').activate, { stdout: 'moved\r\n0.1.0\r\n' });
    expect(await client.call(installMachine, { id: 'winbox' })).toEqual({ version: '0.1.0' });
    expect(ssh.uploads).toEqual([
      {
        target: 'bee@winbox',
        localPath: `${VersionedAssets}/favo-windows-x64.exe`,
        remotePath: '.favo/bin/favo.exe.new',
      },
    ]);
  });
  it('never asks a Windows machine to run a Unix command', async () => {
    const { client, ssh } = await serverWithWindows();
    await client.call(addMachine, { target: 'bee@winbox' });
    ssh.commands.length = 0;
    ssh.reply(installPlanFor('windows', '').activate, { stdout: '0.1.0' });
    await client.call(installMachine, { id: 'winbox' });
    expect(ssh.commands.join(' ')).not.toMatch(/uname|mkdir -p|chmod|ln -sf/);
  });
});

describe('discovery', () => {
  it('finds machines from Tailscale and the ssh config, and skips what is known', async () => {
    const server = createTestServer({
      peers: [
        { name: 'devbox', isOnline: true, os: 'linux' },
        { name: 'iphone', isOnline: false, os: 'iOS' },
        { name: 'macbook', isOnline: true, os: 'macOS' },
        { name: 'winbox', isOnline: true, os: 'windows' },
      ],
    });
    await server.fileSystem.writePrivateText(`${Home}/.ssh/config`, 'Host studio *.internal\n  User bee\nHost *\n');
    const found = await server.client.call(discoverMachines, {});
    expect(found).toEqual([
      { name: 'devbox', target: 'devbox', source: 'tailscale', isOnline: true },
      { name: 'winbox', target: 'winbox', source: 'tailscale', isOnline: true },
      { name: 'studio', target: 'studio', source: 'sshConfig' },
    ]);
    await server.client.call(addMachine, { target: 'bee@devbox' });
    expect((await server.client.call(discoverMachines, {})).map((machine) => machine.name)).toEqual([
      'winbox',
      'studio',
    ]);
  });
  it('strips escape sequences from names it did not choose', async () => {
    const server = createTestServer({
      peers: [{ name: 'ev\u001b]0;pwned\u0007il\u009b', isOnline: true, os: 'linux' }],
    });
    await server.fileSystem.writePrivateText(`${Home}/.ssh/config`, 'Host st\u001b[2Judio\n');
    expect(await server.client.call(discoverMachines, {})).toEqual([
      { name: 'ev]0;pwnedil', target: 'ev]0;pwnedil', source: 'tailscale', isOnline: true },
      { name: 'st[2judio', target: 'st[2Judio', source: 'sshConfig' },
    ]);
  });
});
