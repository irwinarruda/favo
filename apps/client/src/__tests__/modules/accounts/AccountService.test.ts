import { describe, expect, test } from 'bun:test';
import { getApp } from '@/__tests__/utils/getApp';

describe('AccountService', () => {
  test('opens for the selected machine', async () => {
    const app = await getApp();
    app.state.openAddAccount();
    expect(app.state.isAddAccountOpen).toBe(true);
    app.state.closeAddAccount();
    expect(app.state.isAddAccountOpen).toBe(false);
  });
  test('does not open on a machine that is down', async () => {
    const app = await getApp();
    app.state.selectRow('machine:studio');
    app.state.openAddAccount();
    expect(app.state.isAddAccountOpen).toBe(false);
  });
  test('adds a cell to the selected machine and closes', async () => {
    const app = await getApp();
    app.state.moveMachine(1);
    app.state.openAddAccount();
    await app.state.submitAddAccount('side');
    expect(app.state.accounts.map((account) => account.key)).toContain('devbox/side');
    expect(app.state.isAddAccountOpen).toBe(false);
    expect(app.state.toast?.message).toBe('A new cell for side on devbox.');
  });
  test('keeps the dialog open with the error', async () => {
    const app = await getApp();
    app.state.openAddAccount();
    await app.state.submitAddAccount('work');
    expect(app.state.isAddAccountOpen).toBe(true);
    expect(app.state.addAccountError).toBe('"work" already exists.');
    expect(app.state.isAddingAccount).toBe(false);
  });
  test('renames the selected cell and stays on it', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    app.state.openRenameAccount();
    await app.state.submitRenameAccount('side');
    expect(app.state.selectedAccount?.name).toBe('work');
    expect(app.state.selectedAccount?.displayName).toBe('side');
    expect(app.state.selectedSeat?.key).toBe('seat:local/work/claude');
    expect(app.state.isRenameAccountOpen).toBe(false);
    expect(app.state.toast?.message).toBe('work is now side.');
  });
  test('renames the base too', async () => {
    const app = await getApp();
    await app.state.submitRenameAccount('bee');
    expect(app.state.selectedAccount?.displayName).toBe('bee');
    expect(app.state.selectedAccount?.isPersonal).toBe(true);
  });
  test('keeps the rename dialog open with the error', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    app.state.openRenameAccount();
    await app.state.submitRenameAccount('personal');
    expect(app.state.isRenameAccountOpen).toBe(true);
    expect(app.state.renameAccountError).toBe('"personal" already exists.');
    expect(app.state.isRenamingAccount).toBe(false);
  });
  test('has nothing to rename on a machine row', async () => {
    const app = await getApp();
    app.state.selectRow('machine:studio');
    app.state.openRenameAccount();
    expect(app.state.isRenameAccountOpen).toBe(false);
  });
  test('removes the selected account', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    await app.state.removeSelectedAccount();
    expect(app.state.accounts.map((account) => account.name)).not.toContain('work');
    expect(app.state.toast?.message).toBe('work moved to /trash/work. Its logins stay there until you delete it.');
  });
  test('never removes personal', async () => {
    const app = await getApp();
    await app.state.removeSelectedAccount();
    expect(app.state.accounts.map((account) => account.name)).toContain('personal');
    expect(app.state.toast?.kind).toBe('error');
  });
});
