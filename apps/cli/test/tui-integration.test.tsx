import { afterEach, describe, expect, test } from 'bun:test';
import { App } from '@favo/client/App';
import { bootstrapAppContainer } from '@favo/client/shared/container/app';
import { useApp } from '@favo/client/shared/stores/app';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { LoginState } from '@favo/contracts/rpc/views';
import { encodeArguments, type TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import { createTestServer, Home, seedClaudeBase } from '@favo/server/test/support/test-server';
import { testRender } from '@opentui/react/test-utils';

const writeError = console.error;
console.error = (...args: unknown[]) => {
  if (!String(args[0]).includes('not wrapped in act')) writeError(...args);
};

let dispose: (() => Promise<void>) | undefined;

async function openFleet() {
  const mac = createTestServer();
  const devbox = createTestServer({ hostname: 'devbox' });
  await seedClaudeBase(mac.fileSystem);
  await seedClaudeBase(devbox.fileSystem);
  await mac.client.call(createAccount, { name: 'work' });
  await mac.client.call(addMachine, { target: 'bee@devbox' });
  mac.remotes.connect('devbox', devbox.router);
  mac.clis.claude.login = { login: LoginState.signedIn, identity: 'mac@bee.dev', plan: 'max' };
  devbox.clis.claude.login = { login: LoginState.signedIn, identity: 'devbox@bee.dev' };
  const copied: string[] = [];
  const plans: TerminalPlan[] = [];
  bootstrapAppContainer({
    transport: mac.router,
    clipboardGateway: {
      async copy(text) {
        copied.push(text);
        return true;
      },
    },
    terminalGateway: {
      async run(plan) {
        plans.push(plan);
        return 0;
      },
    },
  });
  useApp.setState(useApp.getInitialState(), true);
  const view = await testRender(<App onQuit={() => {}} />, { width: 130, height: 36, useMouse: true });
  dispose = view.dispose;
  await view.waitForFrame((frame) => frame.includes('devbox@bee.dev') && frame.includes('mac@bee.dev'));
  await view.flush();
  return { ...view, mac, devbox, copied, plans };
}

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

describe('usage on a real backend', () => {
  const session = { id: 'five_hour', kind: 'session' as const, label: 'Session', usedPercent: 32 };

  test('reads both machines through the contracts', async () => {
    const { mac, devbox, mockInput, waitForFrame } = await openFleet();
    mac.clis.claude.usageReading = { windows: [session] };
    devbox.clis.claude.usageReading = { windows: [{ ...session, usedPercent: 7 }] };
    mockInput.pressKey('u');
    await waitForFrame((frame) => frame.includes('81% left') && frame.includes('devbox read'));
  });
  test('shows a machine with no such method as older favo, and keeps the rest', async () => {
    const { mac, mockInput, waitForFrame } = await openFleet();
    mac.clis.claude.usageReading = { windows: [session] };
    mac.remotes.connect('devbox', {
      send: async ({ id, method }) => {
        if (method === 'seats.usage') {
          return { id, ok: false, error: { code: 'unknownMethod', message: `Unknown method "${method}".` } };
        }
        return { id, ok: true, result: [] };
      },
    });
    mockInput.pressKey('u');
    await waitForFrame((frame) => frame.includes('devbox older favo') && frame.includes('68% left'));
  });
});

describe('the TUI on a real backend', () => {
  test('shows both machines through the contracts', async () => {
    const { captureCharFrame } = await openFleet();
    const frame = captureCharFrame();
    expect(frame).toContain('macbook · this machine');
    expect(frame).toContain('devbox · bee@devbox');
    expect(frame).toContain('work');
  });
  test('inspects real links for the selected seat', async () => {
    const { waitForFrame } = await openFleet();
    await waitForFrame((frame) => frame.includes('✓ CLAUDE.md'));
  });
  test('copies a provisioned path, creating its links first', async () => {
    const { mac, copied, mockInput, flush, waitFor } = await openFleet();
    useApp.getState().selectRow('seat:local/work/claude');
    await flush();
    mockInput.pressKey('c');
    await waitFor(() => copied.length === 1);
    const path = `${Home}/.favo/accounts/work/claude`;
    expect(copied).toEqual([path]);
    expect((await mac.fileSystem.entry(`${path}/CLAUDE.md`)).kind).toBe('link');
  });
  test('launches this machine with the seat isolated', async () => {
    const { plans, mockInput, flush, waitFor } = await openFleet();
    useApp.getState().selectRow('seat:local/work/claude');
    await flush();
    mockInput.pressKey('RETURN');
    await waitFor(() => plans.length === 1);
    expect(plans[0]?.command).toBe('/usr/bin/claude');
    expect(plans[0]?.env.CLAUDE_CONFIG_DIR).toBe(`${Home}/.favo/accounts/work/claude`);
  });
  test('launches the other machine through ssh', async () => {
    const { plans, mockInput, flush, waitFor } = await openFleet();
    useApp.getState().selectRow('seat:devbox/personal/claude');
    await flush();
    mockInput.pressKey('RETURN');
    await waitFor(() => plans.length === 1);
    expect(plans[0]?.command).toBe('ssh');
    const encoded = encodeArguments(['claude', 'personal']);
    expect(plans[0]?.args).toEqual(['-t', '--', 'bee@devbox', `~/.favo/bin/favo --argv-b64 ${encoded}`]);
  });
  test('creates an account on the machine you selected, not this one', async () => {
    const { devbox, mac, mockInput, flush, waitForFrame } = await openFleet();
    useApp.getState().selectRow('seat:devbox/personal/claude');
    await flush();
    mockInput.pressKey('a');
    await flush();
    await mockInput.typeText('side');
    await flush();
    mockInput.pressKey('RETURN');
    await waitForFrame((frame) => frame.includes('A new cell for side on devbox.'));
    expect((await devbox.fileSystem.list(`${Home}/.favo/accounts`)).includes('side')).toBe(true);
    expect((await mac.fileSystem.list(`${Home}/.favo/accounts`)).includes('side')).toBe(false);
  });
  test('renames a cell on the machine you selected, and leaves its folder alone', async () => {
    const { devbox, mac, mockInput, flush, waitForFrame } = await openFleet();
    await devbox.client.call(createAccount, { name: 'side' });
    await useApp.getState().refreshMachine('devbox');
    useApp.getState().selectRow('seat:devbox/side/claude');
    await flush();
    mockInput.pressKey('n');
    await flush();
    await mockInput.typeText('-two');
    await flush();
    mockInput.pressKey('RETURN');
    await waitForFrame((frame) => frame.includes('side is now side-two.'));
    const [, renamed] = await devbox.client.call(listAccounts, {});
    expect(renamed?.displayName).toBe('side-two');
    expect(await devbox.fileSystem.list(`${Home}/.favo/accounts`)).toEqual(['side']);
    expect((await mac.client.call(listAccounts, {})).map(({ displayName }) => displayName)).not.toContain('side-two');
  });
  test('offers an app only once the backend finds it, and opens it isolated', async () => {
    const { mac, mockInput, flush, renderOnce, captureCharFrame, waitForFrame } = await openFleet();
    useApp.getState().selectRow('seat:local/work/claude');
    await flush();
    await renderOnce();
    expect(captureCharFrame()).not.toContain('p open');
    mac.desktopApps.install('claude');
    await useApp.getState().loadDesktopApps();
    await flush();
    await renderOnce();
    expect(captureCharFrame()).toContain('p open Claude');
    mockInput.pressKey('p');
    await waitForFrame((frame) => frame.includes('Claude is opening as work.'));
    expect(mac.desktopApps.opened[0]?.launch.env.CLAUDE_CONFIG_DIR).toBe(`${Home}/.favo/accounts/work/claude`);
  });
  test('carries a confirmed close all the way to the backend', async () => {
    const { mac, mockInput, flush, waitForFrame, waitFor } = await openFleet();
    mac.desktopApps.install('claude');
    mac.desktopApps.run('claude');
    await useApp.getState().loadDesktopApps();
    useApp.getState().selectRow('seat:local/work/claude');
    await flush();
    mockInput.pressKey('p');
    await waitForFrame((frame) => frame.includes('Close it and reopen as work?'));
    expect(mac.desktopApps.quitCalls).toEqual([]);
    mockInput.pressKey('y');
    await waitFor(() => mac.desktopApps.opened.length === 1);
    expect(mac.desktopApps.quitCalls).toEqual(['claude']);
  });
  test('shows a real backend error as a toast', async () => {
    const { mockInput, flush, waitForFrame } = await openFleet();
    useApp.getState().selectRow('seat:local/personal/antigravity');
    await flush();
    mockInput.pressKey('o');
    await waitForFrame((frame) => frame.includes('Antigravity has no sign-out command.'));
  });
});
