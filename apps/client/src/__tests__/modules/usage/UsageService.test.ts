import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';

const Start = new Date('2026-11-01T12:00:00.000Z');
const Minute = 60_000;
const wait = (minutes: number) => setSystemTime(new Date(Start.getTime() + minutes * Minute));

async function openApp() {
  setSystemTime(Start);
  return getApp();
}

function poolOf(app: Awaited<ReturnType<typeof getApp>>, label: string) {
  return app.state.usagePools.find((pool) => pool.label === label);
}

function lineOf(app: Awaited<ReturnType<typeof getApp>>, id: string) {
  return app.state.usageMachineLines.find((line) => line.id === id);
}

afterEach(() => {
  setSystemTime();
});

describe('reading', () => {
  test('reads nothing until the screen opens', async () => {
    await openApp();
    expect(mockDb.usageReads).toEqual([]);
  });
  test('reads every machine that can answer when the screen opens', async () => {
    const app = await openApp();
    await app.state.openUsage();
    expect(app.state.isUsageOpen).toBe(true);
    expect(mockDb.usageReads.toSorted()).toEqual(['devbox', 'local']);
  });
  test('pools what it read', async () => {
    const app = await openApp();
    await app.state.openUsage();
    expect(app.state.usagePools.map(({ label }) => label)).toEqual(['Claude Code', 'Codex', 'OpenCode']);
    const session = poolOf(app, 'Claude Code')?.windows[0];
    expect(session).toMatchObject({ label: 'Session', remainingPercent: 81, restoresPercent: 16 });
  });
  test('counts the same account on two machines once', async () => {
    const app = await openApp();
    await app.state.openUsage();
    const seat = poolOf(app, 'Claude Code')?.seats.find(({ name }) => name === 'personal');
    expect(seat?.machineNames).toEqual(['macbook', 'devbox']);
  });
  test('sums up a provider with no limits', async () => {
    const app = await openApp();
    await app.state.openUsage();
    expect(poolOf(app, 'OpenCode')?.summary).toBe('no limits available');
  });
  test('copes with a machine named like an inherited property', async () => {
    const id: string = 'constructor';
    const app = await openApp();
    mockDb.machines.push({ id, name: id, target: `bee@${id}`, isLocal: false });
    mockDb.machineStatuses[id] = { state: 'online' };
    mockDb.accounts[id] = mockDb.accounts.devbox!;
    await app.state.loadFleet();
    await app.state.openUsage();
    expect(mockDb.usageReads).toContain(id);
    expect(lineOf(app, id)?.label).toBe('no seats signed in');
  });
  test('reads a machine that is still connecting', async () => {
    const app = await openApp();
    const devbox = app.state.machines.find(({ id }) => id === 'devbox')!;
    app.state.setMachinePresence(devbox.id, 'connecting');
    await app.state.openUsage();
    expect(mockDb.usageReads).toContain('devbox');
  });
});

describe('the five minute wait', () => {
  test('does not read again when the screen reopens right away', async () => {
    const app = await openApp();
    await app.state.openUsage();
    app.state.closeUsage();
    mockDb.usageReads = [];
    wait(4);
    await app.state.openUsage();
    expect(mockDb.usageReads).toEqual([]);
  });
  test('reads again once the wait is over', async () => {
    const app = await openApp();
    await app.state.openUsage();
    app.state.closeUsage();
    mockDb.usageReads = [];
    wait(5);
    await app.state.openUsage();
    expect(mockDb.usageReads.toSorted()).toEqual(['devbox', 'local']);
  });
  test('waits after a failed read too', async () => {
    const app = await openApp();
    mockDb.usageFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    await app.state.openUsage();
    app.state.closeUsage();
    mockDb.usageReads = [];
    wait(1);
    await app.state.openUsage();
    expect(mockDb.usageReads).toEqual([]);
  });
  test('waits for each machine on its own', async () => {
    const app = await openApp();
    const devbox = app.state.machines.find(({ id }) => id === 'devbox')!;
    await app.state.readMachineUsage(devbox);
    wait(3);
    mockDb.usageReads = [];
    await app.state.openUsage();
    expect(mockDb.usageReads).toEqual(['local']);
  });
  test('refresh skips the wait', async () => {
    const app = await openApp();
    await app.state.openUsage();
    mockDb.usageReads = [];
    await app.state.refreshUsage();
    expect(mockDb.usageReads.toSorted()).toEqual(['devbox', 'local']);
  });
  test('refresh does not start a second read of a machine still reading', async () => {
    const app = await openApp();
    const reading = app.state.openUsage();
    expect(app.state.isUsageReading).toBe(true);
    await app.state.refreshUsage();
    await reading;
    expect(mockDb.usageReads.toSorted()).toEqual(['devbox', 'local']);
    expect(app.state.isUsageReading).toBe(false);
  });
});

describe('failures', () => {
  const failed = { reason: 'probeFailed' as const, message: 'Claude Code did not answer.' };

  test('keeps the last good bars after a failed seat and marks them as old', async () => {
    const app = await openApp();
    await app.state.openUsage();
    wait(6);
    const [personal, ...others] = mockDb.seatUsage.local!;
    const unread = { checkedAt: new Date().toISOString(), windows: [], unavailable: failed };
    mockDb.seatUsage.local = [{ ...personal!, usage: unread }, ...others];
    mockDb.seatUsage.devbox = [];
    await app.state.refreshUsage();
    const session = poolOf(app, 'Claude Code')?.windows[0];
    const column = session?.columns.find(({ seat }) => seat.name === 'personal');
    expect(column?.member?.window.usedPercent).toBe(32);
    expect(column?.member?.isStale).toBe(true);
    expect(column?.seat.usage.checkedAt).toBe(Start.toISOString());
  });
  test('shows a failed seat as a notice the first time, with nothing to keep', async () => {
    const app = await openApp();
    const [personal, ...others] = mockDb.seatUsage.local!;
    const unread = { checkedAt: Start.toISOString(), windows: [], unavailable: failed };
    mockDb.seatUsage.local = [{ ...personal!, usage: unread }, ...others];
    mockDb.seatUsage.devbox = [];
    await app.state.openUsage();
    expect(poolOf(app, 'Claude Code')?.notices).toEqual([{ name: 'personal', message: failed.message }]);
  });
  test('clears the bars when a seat turns out to have no limits', async () => {
    const app = await openApp();
    await app.state.openUsage();
    const message = 'This account has no subscription limits.';
    const unsupported = {
      checkedAt: Start.toISOString(),
      windows: [],
      unavailable: { reason: 'unsupported', message },
    };
    mockDb.seatUsage.local = mockDb.seatUsage.local!.map((seat) =>
      seat.account === 'work' ? { ...seat, usage: unsupported as typeof seat.usage } : seat
    );
    await app.state.refreshUsage();
    expect(poolOf(app, 'Claude Code')?.notices).toEqual([{ name: 'work', message }]);
    expect(poolOf(app, 'Claude Code')?.seats.map(({ name }) => name)).toEqual(['personal']);
  });
  test('keeps the rest of the screen when a machine cannot be read', async () => {
    const app = await openApp();
    mockDb.usageFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    await app.state.openUsage();
    expect(lineOf(app, 'devbox')).toMatchObject({ label: 'could not read', isOld: true });
    expect(poolOf(app, 'Claude Code')?.seats).toHaveLength(2);
  });
  test('keeps the bars of a machine that dropped out, marked as old', async () => {
    const app = await openApp();
    await app.state.openUsage();
    mockDb.seatUsage.local = [];
    mockDb.usageFailures.devbox = new DomainError(DomainErrorCode.machineUnreachable, 'devbox: gone');
    await app.state.refreshUsage();
    const session = poolOf(app, 'Claude Code')?.windows[0];
    expect(session?.columns[0]?.member?.isStale).toBe(true);
  });
  test('turns any other failure into the same line, not a crash', async () => {
    const app = await openApp();
    mockDb.usageFailures.devbox = new Error('the wire melted');
    await app.state.openUsage();
    expect(lineOf(app, 'devbox')?.label).toBe('could not read');
    expect(app.state.machineUsage.devbox?.problem).toBe('the wire melted');
  });
  test.each([
    ['an unknown method', DomainErrorCode.unknownMethod],
    ['a reply it cannot read', DomainErrorCode.machineOutdated],
  ])('calls a machine that gives %s an older favo', async (_name, code) => {
    const app = await openApp();
    mockDb.usageFailures.devbox = new DomainError(code, 'nope');
    await app.state.openUsage();
    expect(lineOf(app, 'devbox')?.label).toBe('older favo');
    expect(poolOf(app, 'Claude Code')?.seats).toHaveLength(2);
  });
  test('recovers on the next good read', async () => {
    const app = await openApp();
    mockDb.usageFailures.devbox = new DomainError(DomainErrorCode.unknownMethod, 'nope');
    await app.state.openUsage();
    mockDb.usageFailures = {};
    await app.state.refreshUsage();
    expect(lineOf(app, 'devbox')?.label).toBe('read just now');
  });
});

describe('what each machine says', () => {
  test('says when a reading was taken and dims an old one', async () => {
    const app = await openApp();
    await app.state.openUsage();
    expect(lineOf(app, 'local')).toMatchObject({ label: 'read just now', isOld: false });
    wait(12);
    app.state.tickUsage();
    expect(lineOf(app, 'local')).toMatchObject({ label: 'read 12m ago', isOld: true });
  });
  test('names a machine it did not try to read', async () => {
    const app = await openApp();
    await app.state.openUsage();
    expect(lineOf(app, 'studio')).toMatchObject({ label: 'offline', isOld: true });
  });
  test('shows a machine on an older protocol as older favo', async () => {
    const app = await openApp();
    app.state.setMachinePresence('devbox', 'outdated');
    await app.state.openUsage();
    expect(lineOf(app, 'devbox')?.label).toBe('older favo');
    expect(mockDb.usageReads).toEqual(['local']);
  });
  test('says so when a machine has nothing to read', async () => {
    const app = await openApp();
    mockDb.seatUsage.devbox = [];
    await app.state.openUsage();
    expect(lineOf(app, 'devbox')?.label).toBe('no seats signed in');
  });
  test('recounts the countdown as time passes', async () => {
    const app = await openApp();
    await app.state.openUsage();
    const before = app.state.usagePools;
    wait(1);
    app.state.tickUsage();
    expect(app.state.usagePools).not.toBe(before);
  });
});
