import { describe, expect, test } from 'bun:test';
import { getApp } from '@/__tests__/utils/getApp';

describe('SelectionService', () => {
  test('starts on the first seat', async () => {
    const app = await getApp();
    expect(app.state.selectedSeat?.key).toBe('seat:local/personal/claude');
    expect(app.state.selectedMachine?.id).toBe('local');
    expect(app.state.selectedAccount?.name).toBe('personal');
  });
  test('moves through seats, across accounts and machines', async () => {
    const app = await getApp();
    app.state.moveRow(1);
    expect(app.state.selectedSeat?.key).toBe('seat:local/personal/codex');
    app.state.moveRow(3);
    expect(app.state.selectedSeat?.key).toBe('seat:local/work/codex');
    app.state.moveRow(2);
    expect(app.state.selectedSeat?.key).toBe('seat:devbox/personal/claude');
  });
  test('stops at both ends', async () => {
    const app = await getApp();
    app.state.moveRow(-5);
    expect(app.state.selectedSeat?.key).toBe('seat:local/personal/claude');
    app.state.moveRow(99);
    expect(app.state.selectedRow?.key).toBe('machine:studio');
    expect(app.state.selectedSeat).toBeUndefined();
    expect(app.state.selectedMachine?.id).toBe('studio');
  });
  test('moves sideways to the same provider of the next account', async () => {
    const app = await getApp();
    app.state.moveRow(1);
    app.state.moveAccount(1);
    expect(app.state.selectedSeat?.key).toBe('seat:local/work/codex');
    app.state.moveAccount(1);
    expect(app.state.selectedSeat?.key).toBe('seat:local/work/codex');
    app.state.moveAccount(-1);
    expect(app.state.selectedSeat?.key).toBe('seat:local/personal/codex');
  });
  test('jumps between machines and wraps around', async () => {
    const app = await getApp();
    app.state.moveMachine(1);
    expect(app.state.selectedMachine?.id).toBe('devbox');
    app.state.moveMachine(1);
    expect(app.state.selectedMachine?.id).toBe('studio');
    app.state.moveMachine(1);
    expect(app.state.selectedMachine?.id).toBe('local');
  });
  test('survives the selected account going away', async () => {
    const app = await getApp();
    app.state.selectRow('seat:local/work/claude');
    await app.state.removeSelectedAccount();
    expect(app.state.selectedSeat?.key).toBe('seat:local/personal/claude');
  });
  test('inspects the selected seat and forgets it on move', async () => {
    const app = await getApp();
    await app.state.inspectSelectedSeat();
    expect(app.state.inspection?.items).toHaveLength(5);
    app.state.moveRow(1);
    expect(app.state.inspection).toBeUndefined();
  });
});
