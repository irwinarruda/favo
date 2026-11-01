import { isPersonalAccount } from '#domain/accounts/account';
import { isolationEnvironment, ProviderId, Providers } from '#domain/providers/provider';
import type { ValueOf } from '#domain/shared/value-of';

export const DesktopOpening = {
  opened: 'opened',
  stillOpen: 'stillOpen',
} as const;
export type DesktopOpening = ValueOf<typeof DesktopOpening>;

export type DesktopAppSpec = {
  provider: ProviderId;
  label: string;
  profileFolder: string;
  userDataVariable?: string;
  mac: { bundleId: string; appNames: string[] };
  linux: { executable: string; processNames: string[] };
  windows: { packageName: string; alias: string; executable: string };
};

export type DesktopLaunch = {
  args: string[];
  env: Record<string, string | undefined>;
};

export const DesktopAppSpecs: Partial<Record<ProviderId, DesktopAppSpec>> = {
  claude: {
    provider: ProviderId.claude,
    label: 'Claude',
    profileFolder: 'claude-app',
    mac: { bundleId: 'com.anthropic.claudefordesktop', appNames: ['Claude'] },
    linux: {
      executable: '/usr/lib/claude-desktop/claude-desktop',
      processNames: ['/usr/lib/claude-desktop/claude-desktop', '/usr/bin/claude-desktop', 'claude-desktop'],
    },
    windows: { packageName: 'Claude', alias: 'claude-desktop.exe', executable: 'app\\claude.exe' },
  },
  codex: {
    provider: ProviderId.codex,
    label: 'ChatGPT',
    profileFolder: 'chatgpt-app',
    userDataVariable: 'CODEX_ELECTRON_USER_DATA_PATH',
    mac: { bundleId: 'com.openai.codex', appNames: ['ChatGPT', 'Codex'] },
    linux: { executable: '/usr/lib/chatgpt/ChatGPT', processNames: ['/usr/lib/chatgpt/ChatGPT'] },
    windows: { packageName: 'OpenAI.Codex', alias: 'chatgpt-desktop.exe', executable: 'app\\ChatGPT.exe' },
  },
};

export function desktopProfileOf(paths: { accounts: string }, account: string, spec: DesktopAppSpec) {
  if (isPersonalAccount(account)) return undefined;
  return `${paths.accounts}/${account}/${spec.profileFolder}`;
}

export function desktopLaunchOf(spec: DesktopAppSpec, seatHome: string, profile?: string): DesktopLaunch {
  const provider = Providers[spec.provider];
  const variables = [provider.homeVariable, spec.userDataVariable].filter((name) => name !== undefined);
  if (!profile) return { args: [], env: Object.fromEntries(variables.map((name) => [name, undefined])) };
  const userData = spec.userDataVariable ? { [spec.userDataVariable]: profile } : {};
  return {
    args: [`--user-data-dir=${profile}`],
    env: { ...isolationEnvironment(provider, seatHome), ...userData },
  };
}

export function mainProcessIds(listing: string, executables: string[]) {
  return listing.split('\n').flatMap((line) => {
    const [, id, command] = /^\s*(\d+)\s+(.+)$/.exec(line) ?? [];
    if (!id || !command || command.includes(' --type=')) return [];
    const isMatch = executables.some((name) => command === name || command.startsWith(`${name} `));
    return isMatch ? [Number(id)] : [];
  });
}
