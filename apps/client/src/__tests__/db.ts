import type { DiscoveredMachine } from '@favo/contracts/rpc/machines/discover-machines';
import type { MachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import type { ThemeList } from '@favo/contracts/rpc/themes/list-themes';
import type { AccountView, DesktopAppView, SeatInspection, SeatStatus, SeatView } from '@favo/contracts/rpc/views';
import type { Machine } from '@favo/domain/machines/machine';
import { ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import type { DomainError } from '@favo/domain/shared/domain-error';
import type { TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import { BuiltInThemes } from '@favo/domain/themes/built-in-themes';
import { type Theme, ThemeSource } from '@favo/domain/themes/theme';

function seatOf(home: string, account: string, provider: ProviderId, overrides: Partial<SeatView> = {}): SeatView {
  const spec = Providers[provider];
  const isPersonal = account === 'personal';
  return {
    account,
    provider,
    label: spec.label,
    path: isPersonal ? `${home}/${spec.personalHome}` : `${home}/.favo/accounts/${account}/${provider}`,
    pathHint: spec.pathHint,
    loginScope: spec.loginScope,
    isInstalled: true,
    isProvisioned: isPersonal,
    canLogout: provider !== ProviderId.antigravity,
    ...overrides,
  };
}

export function accountOf(
  home: string,
  name: string,
  overrides: Partial<Record<ProviderId, Partial<SeatView>>> = {}
): AccountView {
  const seats = ProviderOrder.map((provider) => seatOf(home, name, provider, overrides[provider]));
  return { name, displayName: name, isPersonal: name === 'personal', seats };
}

const MacHome = '/Users/bee';
const DevboxHome = '/home/bee';

function seedMachines(): Machine[] {
  return [
    { id: 'local', name: 'macbook', isLocal: true },
    { id: 'devbox', name: 'devbox', target: 'bee@devbox', isLocal: false },
    { id: 'studio', name: 'studio', target: 'bee@studio', isLocal: false },
  ];
}

function seedMachineStatuses(): Record<string, MachineStatus> {
  return {
    local: { state: 'online', hostname: 'macbook', directory: '/Users/bee/code/hive' },
    devbox: { state: 'online', version: '0.1.0', directory: '/home/bee' },
    studio: { state: 'offline', message: 'studio: Connection timed out' },
  };
}

function seedAccounts(): Record<string, AccountView[]> {
  return {
    local: [
      accountOf(MacHome, 'personal', { antigravity: { isInstalled: false } }),
      accountOf(MacHome, 'work', { antigravity: { isInstalled: false } }),
    ],
    devbox: [accountOf(DevboxHome, 'personal')],
  };
}

function seedSeatStatuses(): Record<string, SeatStatus> {
  return {
    'seat:local/personal/claude': { login: 'signedIn', identity: 'bee@hive.dev', plan: 'max', problems: 0 },
    'seat:local/personal/codex': { login: 'signedIn', identity: 'bee@hive.dev', plan: 'plus', problems: 0 },
    'seat:local/personal/opencode': { login: 'signedIn', identity: '4 logins', problems: 0 },
    'seat:local/work/claude': { login: 'signedIn', identity: 'bee@work.dev', plan: 'team', problems: 1 },
    'seat:local/work/codex': { login: 'signedOut', problems: 0 },
    'seat:local/work/opencode': { login: 'signedOut', problems: 0 },
    'seat:devbox/personal/claude': { login: 'signedIn', identity: 'bee@hive.dev', plan: 'max', problems: 0 },
    'seat:devbox/personal/codex': { login: 'signedIn', identity: 'bee@hive.dev', problems: 0 },
    'seat:devbox/personal/antigravity': { login: 'signedOut', problems: 0 },
    'seat:devbox/personal/opencode': { login: 'signedOut', problems: 0 },
  };
}

function seedInspection(): SeatInspection {
  return {
    items: [
      { name: 'CLAUDE.md', state: 'linked' },
      { name: 'settings.json', state: 'linked' },
      { name: 'skills', state: 'linked' },
      { name: 'commands', state: 'notInBase' },
      { name: 'hooks', state: 'conflict' },
    ],
    privateItems: ['.claude.json', 'projects', 'sessions'],
    unclassified: [],
    mirrored: 0,
  };
}

function seedThemeList(): ThemeList {
  const custom: Theme = {
    ...BuiltInThemes[0]!,
    id: 'midnight',
    name: 'Midnight',
    source: ThemeSource.custom,
    colors: { ...BuiltInThemes[0]!.colors, accent: '#7788FF' },
  };
  return { activeId: 'honey', themes: [...BuiltInThemes, custom], problems: [] };
}

function seedDirectoryTrees(): Record<string, Record<string, string[]>> {
  const manyFolders = Array.from({ length: 14 }, (_, index) => `project-${String(index).padStart(2, '0')}`);
  return {
    local: {
      '/Users/bee': ['Desktop', 'Developer', 'Documents', 'Downloads', 'code'],
      '/Users/bee/Desktop': [],
      '/Users/bee/Developer': [],
      '/Users/bee/Documents': ['notes', 'projects'],
      '/Users/bee/Documents/notes': [],
      '/Users/bee/Documents/projects': [],
      '/Users/bee/Downloads': [],
      '/Users/bee/code': ['hive', ...manyFolders],
      '/Users/bee/code/hive': ['apps', 'packages'],
      ...Object.fromEntries(manyFolders.map((name) => [`/Users/bee/code/${name}`, []])),
    },
    devbox: {
      '/home/bee': ['srv', 'projects'],
      '/home/bee/srv': [],
      '/home/bee/projects': [],
    },
  };
}

function seedDesktopApps(): DesktopAppView[] {
  return [{ provider: ProviderId.claude, label: 'Claude' }];
}

function seedDiscovered(): DiscoveredMachine[] {
  return [
    { name: 'pi', target: 'pi', source: 'tailscale', isOnline: true },
    { name: 'buildbox', target: 'buildbox', source: 'sshConfig' },
  ];
}

export const mockDb = {
  machines: seedMachines(),
  machineStatuses: seedMachineStatuses(),
  accounts: seedAccounts(),
  seatStatuses: seedSeatStatuses(),
  inspection: seedInspection(),
  themeList: seedThemeList(),
  directoryTrees: seedDirectoryTrees(),
  discovered: seedDiscovered(),
  desktopApps: seedDesktopApps(),
  runningDesktopApps: [] as ProviderId[],
  desktopOpenings: [] as string[],
  desktopFailure: undefined as DomainError | undefined,
  unreachableTargets: ['down@host'],
  clipboard: [] as string[],
  terminalRuns: [] as TerminalPlan[],
  terminalExitCode: 0,
  provisioned: [] as string[],
  repaired: [] as string[],
  repairedLinks: 0,
  installed: [] as string[],
  reset() {
    this.machines = seedMachines();
    this.machineStatuses = seedMachineStatuses();
    this.accounts = seedAccounts();
    this.seatStatuses = seedSeatStatuses();
    this.inspection = seedInspection();
    this.themeList = seedThemeList();
    this.directoryTrees = seedDirectoryTrees();
    this.discovered = seedDiscovered();
    this.desktopApps = seedDesktopApps();
    this.runningDesktopApps = [];
    this.desktopOpenings = [];
    this.desktopFailure = undefined;
    this.unreachableTargets = ['down@host'];
    this.clipboard = [];
    this.terminalRuns = [];
    this.terminalExitCode = 0;
    this.provisioned = [];
    this.repaired = [];
    this.repairedLinks = 0;
    this.installed = [];
  },
};
