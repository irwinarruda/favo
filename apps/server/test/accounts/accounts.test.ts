import { describe, expect, it } from 'bun:test';
import { adoptAccount } from '@favo/contracts/rpc/accounts/adopt-account';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { removeAccount } from '@favo/contracts/rpc/accounts/remove-account';
import { renameAccount } from '@favo/contracts/rpc/accounts/rename-account';
import { selectTheme } from '@favo/contracts/rpc/themes/select-theme';
import { DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import { createTestServer, Home, seedClaudeBase } from '#test/support/test-server';

describe('accounts', () => {
  it('starts with only the personal account, at the labs own folders', async () => {
    const { client } = createTestServer();
    const accounts = await client.call(listAccounts, {});
    expect(accounts.map((account) => account.name)).toEqual(['personal']);
    expect(accounts[0]!.seats.find((seat) => seat.provider === 'claude')?.path).toBe(`${Home}/.claude`);
  });
  it('creates a cell without touching any provider yet', async () => {
    const { client, fileSystem } = createTestServer();
    const account = await client.call(createAccount, { name: 'work' });
    expect(account.seats.every((seat) => !seat.isProvisioned)).toBe(true);
    expect(account.seats.find((seat) => seat.provider === 'codex')?.path).toBe(`${Home}/.favo/accounts/work/codex`);
    expect(await fileSystem.list(`${Home}/.favo/accounts`)).toEqual(['work']);
  });
  it('refuses a duplicate and a bad name', async () => {
    const { client } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    await expect(client.call(createAccount, { name: 'work' })).rejects.toMatchObject({ code: 'accountExists' });
    await expect(client.call(createAccount, { name: '../evil' })).rejects.toMatchObject({ code: 'invalidAccountName' });
    await expect(client.call(createAccount, { name: 'personal' })).rejects.toMatchObject({
      code: 'invalidAccountName',
    });
  });
  it('marks a provider that is not on this machine', async () => {
    const { client } = createTestServer({ installed: ['claude'] });
    const [personal] = await client.call(listAccounts, {});
    expect(personal!.seats.map((seat) => seat.isInstalled)).toEqual([true, false, false, false]);
  });
  it('knows Antigravity has no sign-out command', async () => {
    const { client } = createTestServer();
    const [personal] = await client.call(listAccounts, {});
    expect(personal!.seats.find((seat) => seat.provider === 'antigravity')?.canLogout).toBe(false);
    expect(personal!.seats.find((seat) => seat.provider === 'claude')?.canLogout).toBe(true);
  });
  it('keeps every login in its own cell, Antigravity included', async () => {
    const { client } = createTestServer();
    const [personal] = await client.call(listAccounts, {});
    expect(personal!.seats.every((seat) => seat.loginScope === 'perAccount')).toBe(true);
  });
  it('moves a removed account to the trash instead of deleting it', async () => {
    const { client, fileSystem } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    const { trashedTo } = await client.call(removeAccount, { name: 'work' });
    expect(trashedTo).toStartWith(`${Home}/.favo/trash/work-`);
    expect((await fileSystem.entry(trashedTo)).kind).toBe(EntryKind.directory);
    expect((await client.call(listAccounts, {})).map((account) => account.name)).toEqual(['personal']);
  });
  it('handles an account named like something every object inherits', async () => {
    const { client } = createTestServer();
    await client.call(createAccount, { name: 'constructor' });
    expect((await client.call(listAccounts, {})).map((account) => account.displayName)).toEqual([
      'personal',
      'constructor',
    ]);
    const renamed = await client.call(renameAccount, { name: 'constructor', newName: 'side' });
    expect(renamed.displayName).toBe('side');
    expect((await client.call(renameAccount, { name: 'constructor', newName: 'constructor' })).displayName).toBe(
      'constructor'
    );
    await client.call(removeAccount, { name: 'constructor' });
    expect((await client.call(listAccounts, {})).map((account) => account.name)).toEqual(['personal']);
  });
  it('refuses __proto__ as a name, and lists a folder of that name someone made by hand', async () => {
    const { client, fileSystem, paths } = createTestServer();
    await expect(client.call(createAccount, { name: '__proto__' })).rejects.toMatchObject({
      code: 'invalidAccountName',
    });
    await fileSystem.ensureDirectory(`${paths.accounts}/__proto__`);
    expect((await client.call(listAccounts, {})).map((account) => account.displayName)).toEqual([
      'personal',
      '__proto__',
    ]);
  });
  it('reads a config that names accounts like inherited properties', async () => {
    const { client, fileSystem, paths } = createTestServer();
    await fileSystem.writePrivateText(
      paths.configFile,
      '{"accountNames":{"__proto__":"polluted","constructor":"builder","toString":"text"}}'
    );
    await fileSystem.ensureDirectory(`${paths.accounts}/constructor`);
    expect((await client.call(listAccounts, {})).map((account) => account.displayName)).toEqual([
      'personal',
      'builder',
    ]);
  });
  it('never removes personal', async () => {
    const { client } = createTestServer();
    await expect(client.call(removeAccount, { name: 'personal' })).rejects.toMatchObject({ code: 'accountIsPersonal' });
  });
  it('never reaches outside the accounts folder', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.ensureDirectory(`${Home}/.favo/precious`);
    await expect(client.call(removeAccount, { name: '../precious' })).rejects.toMatchObject({
      code: 'invalidAccountName',
    });
    expect((await fileSystem.entry(`${Home}/.favo/precious`)).kind).toBe(EntryKind.directory);
  });
  it('renames a cell without moving its folder, so logins and copied paths survive', async () => {
    const { client, fileSystem } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    const seat = `${Home}/.favo/accounts/work/claude`;
    await fileSystem.writePrivateText(`${seat}/.claude.json`, 'login');
    const renamed = await client.call(renameAccount, { name: 'work', newName: 'side' });
    expect(renamed.name).toBe('work');
    expect(renamed.displayName).toBe('side');
    expect(renamed.seats.find((item) => item.provider === 'claude')?.path).toBe(seat);
    expect(await fileSystem.readText(`${seat}/.claude.json`)).toBe('login');
    expect(await fileSystem.list(`${Home}/.favo/accounts`)).toEqual(['work']);
  });
  it('renames the base, which stays the base and stays where it is', async () => {
    const { client } = createTestServer();
    const renamed = await client.call(renameAccount, { name: 'personal', newName: 'bee' });
    expect(renamed.displayName).toBe('bee');
    expect(renamed.isPersonal).toBe(true);
    expect(renamed.seats.find((seat) => seat.provider === 'claude')?.path).toBe(`${Home}/.claude`);
    const back = await client.call(renameAccount, { name: 'personal', newName: 'personal' });
    expect(back.displayName).toBe('personal');
  });
  it('forgets the new name when you go back to the original', async () => {
    const { client, fileSystem, paths } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    await client.call(renameAccount, { name: 'work', newName: 'side' });
    const back = await client.call(renameAccount, { name: 'work', newName: 'work' });
    expect(back.displayName).toBe('work');
    expect(JSON.parse((await fileSystem.readText(paths.configFile))!).accountNames).toEqual({});
  });
  it('refuses a name another cell shows or holds on disk', async () => {
    const { client } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    await client.call(createAccount, { name: 'side' });
    const taken = { code: 'accountExists' };
    await expect(client.call(renameAccount, { name: 'work', newName: 'side' })).rejects.toMatchObject(taken);
    await client.call(renameAccount, { name: 'side', newName: 'hive' });
    await expect(client.call(renameAccount, { name: 'work', newName: 'hive' })).rejects.toMatchObject(taken);
    await expect(client.call(renameAccount, { name: 'work', newName: 'side' })).rejects.toMatchObject(taken);
    await expect(client.call(createAccount, { name: 'hive' })).rejects.toMatchObject(taken);
  });
  it('refuses a bad name, a reserved one and a cell that is not there', async () => {
    const { client, fileSystem } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    const invalid = { code: 'invalidAccountName' };
    await expect(client.call(renameAccount, { name: 'work', newName: 'Not Valid' })).rejects.toMatchObject(invalid);
    await expect(client.call(renameAccount, { name: 'work', newName: 'personal' })).rejects.toMatchObject(invalid);
    await expect(client.call(renameAccount, { name: '../precious', newName: 'a' })).rejects.toMatchObject(invalid);
    await expect(client.call(renameAccount, { name: 'gone', newName: 'a' })).rejects.toMatchObject({
      code: 'accountNotFound',
    });
    expect(await fileSystem.list(`${Home}/.favo/accounts`)).toEqual(['work']);
  });
  it('forgets a deleted cell, so a new one with its folder name starts clean', async () => {
    const { client } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    await client.call(renameAccount, { name: 'work', newName: 'side' });
    await client.call(removeAccount, { name: 'work' });
    const again = await client.call(createAccount, { name: 'side' });
    expect(again.displayName).toBe('side');
    expect((await client.call(createAccount, { name: 'work' })).displayName).toBe('work');
  });
  it('keeps the rest of config.json when it saves a name', async () => {
    const { client, fileSystem, paths } = createTestServer();
    await client.call(createAccount, { name: 'work' });
    await client.call(selectTheme, { id: 'honey' });
    await client.call(renameAccount, { name: 'work', newName: 'side' });
    const config = JSON.parse((await fileSystem.readText(paths.configFile))!);
    expect(config).toEqual({ theme: 'honey', accountNames: { work: 'side' } });
  });
  it('adopts an existing folder into an account and links what it lacks', async () => {
    const { client, fileSystem } = createTestServer();
    await seedClaudeBase(fileSystem);
    await fileSystem.writePrivateText(`${Home}/.claude-work/projects/a/1.jsonl`, 'thread');
    await fileSystem.link(`${Home}/.claude/skills`, `${Home}/.claude-work/skills`);
    await client.call(adoptAccount, { name: 'work', provider: 'claude', from: '~/.claude-work' });
    const seat = `${Home}/.favo/accounts/work/claude`;
    expect(await fileSystem.readText(`${seat}/projects/a/1.jsonl`)).toBe('thread');
    expect((await fileSystem.entry(`${Home}/.claude-work`)).kind).toBe(EntryKind.missing);
    expect((await fileSystem.entry(`${seat}/skills`)).target).toBe(`${Home}/.claude/skills`);
    expect((await fileSystem.entry(`${seat}/CLAUDE.md`)).target).toBe(`${Home}/.claude/CLAUDE.md`);
  });
  it.each([
    ['a provider base', '~/.claude'],
    ['another provider base', '~/.codex'],
    ['a base with its last separator', '~/.claude/'],
    ['the folder around a base', Home],
    ['the parent of the Antigravity base', '~/.gemini'],
    ['the grandparent of the OpenCode base', '~/.local/share'],
    ['part of a base', '~/.claude/projects'],
    ['the favo home', '~/.favo'],
    ['a seat of another account', '~/.favo/accounts/other/claude'],
    ['the trash', '~/.favo/trash'],
  ])('refuses to adopt %s, and moves nothing', async (_name, from) => {
    const { client, fileSystem } = createTestServer();
    await seedClaudeBase(fileSystem);
    await fileSystem.ensureDirectory(`${Home}/.codex`);
    await fileSystem.ensureDirectory(`${Home}/.gemini/antigravity-cli`);
    await fileSystem.ensureDirectory(`${Home}/.local/share/opencode`);
    await fileSystem.ensureDirectory(`${Home}/.favo/trash`);
    await client.call(createAccount, { name: 'other' });
    await fileSystem.ensureDirectory(`${Home}/.favo/accounts/other/claude`);
    await expect(client.call(adoptAccount, { name: 'work', provider: 'claude', from })).rejects.toMatchObject({
      code: DomainErrorCode.adoptSourceProtected,
    });
    expect(await fileSystem.readText(`${Home}/.claude/CLAUDE.md`)).toBe('be kind');
    expect(await fileSystem.list(`${Home}/.favo/accounts`)).toEqual(['other']);
  });
  it('refuses to adopt a folder a base links to', async () => {
    const { client, fileSystem } = createTestServer();
    await fileSystem.writePrivateText(`${Home}/dotfiles/claude/CLAUDE.md`, 'be kind');
    await fileSystem.link(`${Home}/dotfiles/claude`, `${Home}/.claude`);
    const adopt = client.call(adoptAccount, { name: 'work', provider: 'claude', from: '~/dotfiles/claude' });
    await expect(adopt).rejects.toMatchObject({ code: DomainErrorCode.adoptSourceProtected });
  });
  it('still adopts a folder whose name only starts like a base', async () => {
    const { client, fileSystem } = createTestServer();
    await seedClaudeBase(fileSystem);
    await fileSystem.ensureDirectory(`${Home}/.claude-work`);
    const adopted = await client.call(adoptAccount, { name: 'work', provider: 'claude', from: '~/.claude-work' });
    expect(adopted.seats.find((seat) => seat.provider === 'claude')?.isProvisioned).toBe(true);
  });
  it('refuses to adopt over a folder that exists, or from nowhere', async () => {
    const { client, fileSystem } = createTestServer();
    await expect(client.call(adoptAccount, { name: 'work', provider: 'claude', from: '/nope' })).rejects.toMatchObject({
      code: 'adoptSourceMissing',
    });
    await fileSystem.ensureDirectory('/old');
    await fileSystem.ensureDirectory(`${Home}/.favo/accounts/work/claude`);
    await expect(client.call(adoptAccount, { name: 'work', provider: 'claude', from: '/old' })).rejects.toMatchObject({
      code: 'adoptTargetExists',
    });
  });
});
