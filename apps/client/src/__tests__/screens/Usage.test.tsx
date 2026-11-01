import { afterEach, describe, expect, test } from 'bun:test';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import { renderApp } from '@/__tests__/utils/renderApp';

let dispose: (() => Promise<void>) | undefined;

async function open(screen?: Parameters<typeof renderApp>[0]) {
  const view = await renderApp(screen);
  dispose = view.dispose;
  return view;
}

async function openUsage(screen?: Parameters<typeof renderApp>[0]) {
  const view = await open(screen);
  await view.press('u');
  await view.waitForFrame((frame) => frame.includes('Claude Code') && frame.includes('read just now'));
  return view;
}

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

describe('the usage screen', () => {
  test('opens with u and goes back with escape', async () => {
    const { app, captureCharFrame, pressEscape } = await openUsage();
    expect(app.state.isUsageOpen).toBe(true);
    expect(captureCharFrame()).toContain('all machines · all providers');
    await pressEscape();
    expect(app.state.isUsageOpen).toBe(false);
    expect(captureCharFrame()).toContain('macbook · this machine');
  });
  test('opens from the key bar', async () => {
    const { app, clickOn, waitFor } = await open();
    await clickOn('usage');
    await waitFor(() => app.state.isUsageOpen);
  });
  test('shows the pooled headline, the pace and the next reset', async () => {
    const { captureCharFrame } = await openUsage();
    expect(captureCharFrame()).toMatch(/Session\s+81% left\s+↘\s+↻ \+16%/);
    expect(captureCharFrame()).toMatch(/Weekly\s+55% left/);
  });
  test('draws one row per seat with what each has left and when it comes back', async () => {
    const { captureCharFrame } = await openUsage();
    const frame = captureCharFrame();
    expect(frame).toMatch(/personal\s+█+│?█*╱+\s+68%\s+↻ 44m/);
    expect(frame).toMatch(/work\s+[█│]+╱*\s+93%\s+↻ 54m/);
  });
  test('keeps a seat in the same place in every window', async () => {
    const { captureCharFrame } = await openUsage();
    const rows = captureCharFrame()
      .split('\n')
      .filter((line) => /^\s+(personal|work)\s+[█░╱│]/.test(line));
    const names = rows.map((line) => line.trim().split(/\s+/)[0]);
    expect(names.slice(0, 6)).toEqual(['personal', 'work', 'personal', 'work', 'personal', 'work']);
  });
  test('does not repeat the percentage for a single seat', async () => {
    const { captureCharFrame } = await openUsage();
    const codex = captureCharFrame().split('Codex')[1]!;
    expect(codex).toMatch(/Session\s+90% left/);
    expect(codex).not.toMatch(/█\s+90%/);
  });
  test('sums up a provider with no limits in one line', async () => {
    const { captureCharFrame } = await openUsage({ width: 130, height: 50 });
    expect(captureCharFrame()).toMatch(/OpenCode\s+no limits available/);
  });
  test('says when each machine was read, and what happened to the rest', async () => {
    const { captureCharFrame } = await openUsage();
    const frame = captureCharFrame();
    expect(frame).toContain('macbook read just now');
    expect(frame).toContain('devbox read just now');
    expect(frame).toContain('studio offline');
  });
  test('stays readable at 80 columns', async () => {
    const { captureCharFrame } = await openUsage({ width: 80, height: 40 });
    const frame = captureCharFrame();
    expect(frame).toMatch(/personal\s+[█│╱░]+\s+68%\s+↻ 44m/);
    expect(frame).toContain('esc back');
  });
  test('scrolls what does not fit', async () => {
    const { captureCharFrame, press } = await openUsage({ width: 80, height: 16 });
    expect(captureCharFrame()).not.toContain('Codex');
    await press('j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j', 'j');
    expect(captureCharFrame()).toContain('Codex');
  });
  test('refreshes with r and with a click, past the wait', async () => {
    const { clickOn, press, waitFor } = await openUsage();
    mockDb.usageReads = [];
    await press('r');
    await waitFor(() => mockDb.usageReads.length === 2);
    await clickOn('refresh');
    await waitFor(() => mockDb.usageReads.length === 4);
  });
  test('leaves the comb keys alone while it is open', async () => {
    const { app, press } = await openUsage();
    await press('a');
    expect(app.state.isAddAccountOpen).toBe(false);
  });
  test('explains the arrows in help, over the screen', async () => {
    const { app, captureCharFrame, press, pressEscape } = await openUsage();
    await press('?');
    expect(captureCharFrame()).toContain('ahead of, on or under pace');
    await pressEscape();
    expect(app.state.isUsageOpen).toBe(true);
    expect(captureCharFrame()).not.toContain('ahead of, on or under pace');
  });
  test('quits with q', async () => {
    const view = await openUsage();
    await view.press('q');
    expect(view.quitCount).toBe(1);
  });
  test('keeps the rest of the screen when a machine runs an older favo', async () => {
    const view = await open();
    mockDb.usageFailures.devbox = new DomainError(DomainErrorCode.unknownMethod, 'nope');
    await view.press('u');
    await view.waitForFrame((frame) => frame.includes('devbox older favo') && frame.includes('Claude Code'));
  });
  test('says so when there is nothing to show', async () => {
    const view = await open();
    mockDb.seatUsage = {};
    await view.press('u');
    await view.waitForFrame((frame) => frame.includes('No signed in seat reports limits.'));
  });
});
