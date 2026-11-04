import { afterEach, describe, expect, test } from 'bun:test';
import { mockDb } from '@/__tests__/db';
import { renderApp } from '@/__tests__/utils/renderApp';

let dispose: (() => Promise<void>) | undefined;

async function open(screen?: Parameters<typeof renderApp>[0]) {
  const view = await renderApp(screen);
  dispose = view.dispose;
  return view;
}

async function openClis(screen?: Parameters<typeof renderApp>[0]) {
  const view = await open(screen);
  await view.press('v');
  await view.waitForFrame((frame) => frame.includes('Provider CLIs') && frame.includes('2.1.290'));
  return view;
}

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

describe('the provider CLIs screen', () => {
  test('opens with v and goes back with escape or v', async () => {
    const { app, captureCharFrame, press, pressEscape } = await openClis();
    expect(captureCharFrame()).toContain('what each machine has installed');
    await pressEscape();
    expect(app.state.isProviderClisOpen).toBe(false);
    expect(captureCharFrame()).toContain('macbook · this machine');
    await press('v');
    expect(app.state.isProviderClisOpen).toBe(true);
    await press('v');
    expect(app.state.isProviderClisOpen).toBe(false);
  });
  test('opens from the key bar', async () => {
    const { app, clickOn, waitFor } = await open();
    await clickOn('versions');
    await waitFor(() => app.state.isProviderClisOpen);
  });
  test('shows each version and how it got there, machine by machine', async () => {
    const { captureCharFrame } = await openClis();
    const frame = captureCharFrame();
    expect(frame).toMatch(/macbook\s+2\.1\.316\s+Homebrew cask claude-code/);
    expect(frame).toMatch(/devbox\s+2\.1\.290 older\s+npm in \/home\/bee/);
  });
  test('colors a version that is older than elsewhere like a failure', async () => {
    const { captureSpans } = await openClis();
    const spans = captureSpans().lines.flatMap((line) => line.spans);
    const colorOf = (text: string) => spans.find((span) => span.text.includes(text))?.fg.toString();
    expect(colorOf('2.1.290 older')).toBe(colorOf('the last update failed'));
    expect(colorOf('2.1.316')).not.toBe(colorOf('2.1.290 older'));
  });
  test('says what the last update did to each provider', async () => {
    const { captureCharFrame } = await openClis();
    const frame = captureCharFrame();
    expect(frame).toContain('the last update failed, exit 1 · 1d 2h ago');
    expect(frame).toContain('left alone: it is pinned in Homebrew');
  });
  test('names what happened to the machines it could not read', async () => {
    const { captureCharFrame } = await openClis();
    const frame = captureCharFrame();
    expect(frame).toContain('macbook 3 CLIs');
    expect(frame).toContain('studio offline');
  });
  test('refreshes with r', async () => {
    const { press, waitFor } = await openClis();
    mockDb.providerVersionReads = [];
    await press('r');
    await waitFor(() => mockDb.providerVersionReads.length === 2);
  });
  test('fits 80 columns', async () => {
    const { captureCharFrame } = await openClis({ width: 80, height: 40 });
    const frame = captureCharFrame();
    expect(frame).toMatch(/devbox\s+2\.1\.290 older/);
    expect(frame).toContain('esc back');
  });
  test('opens with what happened after the provider CLIs of a machine are updated', async () => {
    const { app, select, press, waitFor, waitForFrame } = await open();
    await select('seat:devbox/personal/antigravity');
    await press('P');
    await press('y');
    await waitFor(() => app.state.isProviderClisOpen);
    await waitForFrame((frame) => frame.includes('Provider CLIs'));
  });
  test('keeps the warning in sight when the update there did not finish', async () => {
    const { app, select, press, waitFor, waitForFrame } = await open();
    mockDb.terminalExitCode = 255;
    await select('seat:devbox/personal/antigravity');
    await press('P');
    await press('y');
    await waitFor(() => app.state.isProviderClisOpen);
    await waitForFrame((frame) => frame.includes('The update on devbox did not finish.'));
  });
  test('lists the key in the help', async () => {
    const { press, captureCharFrame } = await open();
    await press('?');
    expect(captureCharFrame()).toContain('every provider CLI version');
  });
});
