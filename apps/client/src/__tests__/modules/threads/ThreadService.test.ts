import { describe, expect, test } from 'bun:test';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { mockDb } from '@/__tests__/db';
import { getApp } from '@/__tests__/utils/getApp';
import { container } from '@/shared/container';
import { useApp } from '@/shared/stores/app';

const Claude = 'seat:local/personal/claude';
const WorkClaude = 'seat:local/work/claude';
const WorkCodex = 'seat:local/work/codex';

async function appOn(rowKey: string, seed?: () => void) {
  const app = await getApp();
  seed?.();
  app.state.selectRow(rowKey);
  await app.state.loadSelectedThreads();
  return app;
}

describe('ThreadService', () => {
  test('loads the threads and hooks of the selected seat', async () => {
    const app = await appOn(Claude);
    expect(app.state.selectedThreads).toHaveLength(3);
    expect(app.state.machineHooks.local).toHaveLength(4);
  });
  test('keeps each seat apart', async () => {
    const app = await appOn(Claude);
    app.state.selectRow(WorkClaude);
    await app.state.loadSelectedThreads();
    expect(app.state.selectedThreads).toHaveLength(1);
    app.state.selectRow(Claude);
    expect(app.state.selectedThreads).toHaveLength(3);
  });
  test('asks for the hook on a seat with nothing and no hook', async () => {
    const app = await appOn(WorkCodex);
    expect(app.state.selectedThreads).toEqual([]);
    expect(app.state.needsThreadHook).toBe(true);
  });
  test('never asks while a seat has threads to go back to', async () => {
    const app = await appOn(WorkCodex, () => {
      mockDb.threads[WorkCodex] = mockDb.threads[WorkClaude]!;
    });
    expect(app.state.needsThreadHook).toBe(false);
  });
  test('needs no hook where one is installed', async () => {
    const app = await appOn(WorkClaude, () => {
      mockDb.threads[WorkClaude] = [];
    });
    expect(app.state.needsThreadHook).toBe(false);
  });
  test('leaves threads out on a machine with an older favo, and keeps everything else', async () => {
    const app = await getApp();
    mockDb.threadFailures.local = new DomainError(DomainErrorCode.unknownMethod, 'Unknown method "threads.list".');
    await app.state.loadSelectedThreads();
    expect(app.state.canKeepThreads).toBe(false);
    expect(app.state.needsThreadHook).toBe(false);
  });
  test('brings threads back once that machine is updated', async () => {
    const app = await getApp();
    mockDb.threadFailures.local = new DomainError(DomainErrorCode.unknownMethod, 'Unknown method "threads.list".');
    await app.state.loadSelectedThreads();
    mockDb.threadFailures = {};
    await app.state.loadSelectedThreads();
    expect(app.state.canKeepThreads).toBe(true);
  });
  test('lets any other failure reach the screen', async () => {
    const app = await getApp();
    mockDb.threadFailures.local = new Error('disk full');
    await expect(app.state.loadSelectedThreads()).rejects.toThrow('disk full');
  });
  test('ignores a slow answer for a folder the user already left', async () => {
    const app = await appOn(WorkClaude);
    let answer: () => void = () => {};
    const repository = container.get('IThreadRepository');
    const reading = repository.getThreads.bind(repository);
    repository.getThreads = async (seat, directory) => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return reading(seat, directory);
    };
    mockDb.threads[WorkClaude] = [];
    const loading = app.state.loadSelectedThreads();
    useApp.setState({ launchDirectories: { local: '/somewhere/else' } });
    answer();
    await loading;
    repository.getThreads = reading;
    expect(app.state.selectedThreads).toHaveLength(1);
  });
  test('goes straight back when a seat has one thread', async () => {
    const app = await appOn(WorkClaude);
    await app.state.goBackToThread();
    const [run] = mockDb.terminalRuns;
    expect(run?.args).toEqual(['resume', 'work', '22222222-2222-4333-8444-5555bbbb0001']);
    expect(run?.cwd).toBe('/Users/bee/code/hive');
    expect(app.state.isThreadPickerOpen).toBe(false);
  });
  test('asks which one when a seat has more', async () => {
    const app = await appOn(Claude);
    await app.state.goBackToThread();
    expect(app.state.isThreadPickerOpen).toBe(true);
    expect(mockDb.terminalRuns).toEqual([]);
  });
  test('says so when there is nothing to go back to', async () => {
    const app = await appOn(WorkCodex);
    await app.state.goBackToThread();
    expect(app.state.toast?.message).toBe('No thread to go back to yet.');
    expect(mockDb.terminalRuns).toEqual([]);
  });
  test('moves through the list and stops at its ends', async () => {
    const app = await appOn(Claude);
    await app.state.goBackToThread();
    app.state.moveThreadHighlight(-1);
    expect(app.state.highlightedThreadIndex).toBe(0);
    app.state.moveThreadHighlight(5);
    expect(app.state.highlightedThreadIndex).toBe(2);
  });
  test('resumes the highlighted thread and closes the list', async () => {
    const app = await appOn(Claude);
    await app.state.goBackToThread();
    app.state.moveThreadHighlight(1);
    await app.state.resumeHighlightedThread();
    expect(app.state.isThreadPickerOpen).toBe(false);
    expect(mockDb.terminalRuns[0]?.args).toEqual(['resume', 'personal', '11111111-2222-4333-8444-5555aaaa0002']);
  });
  test('starts each list at the top', async () => {
    const app = await appOn(Claude);
    await app.state.goBackToThread();
    app.state.moveThreadHighlight(2);
    app.state.closeThreadPicker();
    await app.state.goBackToThread();
    expect(app.state.highlightedThreadIndex).toBe(0);
  });
  test('reads the threads again after a provider closes', async () => {
    const app = await appOn(WorkClaude);
    const newer = { ...mockDb.threads[WorkClaude]![0]!, id: 'newer' };
    mockDb.threads[WorkClaude] = [newer];
    await app.state.launchSelectedSeat();
    expect(app.state.selectedThreads[0]?.id).toBe('newer');
  });
  test('installs the hooks on the selected machine and says so', async () => {
    const app = await appOn(WorkCodex);
    await app.state.installThreadHooks();
    expect(app.state.needsThreadHook).toBe(false);
    expect(mockDb.hooks.local?.find(({ provider }) => provider === 'codex')?.state).toBe('current');
    expect(mockDb.hooks.devbox?.every(({ state }) => state === 'absent')).toBe(true);
    expect(app.state.toast?.message).toBe('favo remembers threads on macbook from now on.');
  });
  test('leaves a provider that is not installed as it was', async () => {
    const app = await appOn(WorkCodex);
    await app.state.installThreadHooks();
    expect(mockDb.hooks.local?.find(({ provider }) => provider === 'antigravity')?.state).toBe('absent');
  });
});
