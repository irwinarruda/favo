import { z } from 'zod';
import { isPersonalAccount, seatHomeOf } from '#domain/accounts/account';
import { isolationEnvironment, ProviderId, Providers } from '#domain/providers/provider';
import { parseJson } from '#domain/shared/parse-json';
import type { ValueOf } from '#domain/shared/value-of';

export const DesktopOpening = {
  opened: 'opened',
  stillOpen: 'stillOpen',
} as const;
export type DesktopOpening = ValueOf<typeof DesktopOpening>;

export const DesktopLogin = {
  sharedWithCli: 'sharedWithCli',
  separate: 'separate',
} as const;
export type DesktopLogin = ValueOf<typeof DesktopLogin>;

export const AppLoginState = {
  signedIn: 'signedIn',
  signedOut: 'signedOut',
  unknown: 'unknown',
} as const;
export type AppLoginState = ValueOf<typeof AppLoginState>;

export type DesktopAppSpec = {
  provider: ProviderId;
  label: string;
  profileFolder: string;
  userDataVariable?: string;
  login: DesktopLogin;
  mac: { bundleId: string; appNames: string[]; defaultProfile?: string };
  linux: { executable: string; processNames: string[]; defaultProfile?: string };
  windows: { packageName: string; alias: string; executable: string; defaultProfile?: string };
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
    login: DesktopLogin.separate,
    mac: { bundleId: 'com.anthropic.claudefordesktop', appNames: ['Claude'], defaultProfile: 'Claude' },
    linux: {
      executable: '/usr/lib/claude-desktop/claude-desktop',
      processNames: ['/usr/lib/claude-desktop/claude-desktop', '/usr/bin/claude-desktop', 'claude-desktop'],
      defaultProfile: 'Claude',
    },
    windows: {
      packageName: 'Claude',
      alias: 'claude-desktop.exe',
      executable: 'app\\claude.exe',
      defaultProfile: 'Claude-Data/claude_pzs8sxrjxfjjc',
    },
  },
  codex: {
    provider: ProviderId.codex,
    label: 'ChatGPT',
    profileFolder: 'chatgpt-app',
    userDataVariable: 'CODEX_ELECTRON_USER_DATA_PATH',
    login: DesktopLogin.sharedWithCli,
    mac: { bundleId: 'com.openai.codex', appNames: ['ChatGPT', 'Codex'] },
    linux: { executable: '/usr/lib/chatgpt/ChatGPT', processNames: ['/usr/lib/chatgpt/ChatGPT'] },
    windows: { packageName: 'OpenAI.Codex', alias: 'chatgpt-desktop.exe', executable: 'app\\ChatGPT.exe' },
  },
};

export function desktopProfileOf(paths: { accounts: string }, account: string, spec: DesktopAppSpec) {
  if (isPersonalAccount(account)) return undefined;
  return `${paths.accounts}/${account}/${spec.profileFolder}`;
}

export function appLoginFilesOf(
  paths: { home: string; accounts: string },
  account: string,
  spec: DesktopAppSpec,
  profile: string
) {
  const cliHome = isPersonalAccount(account) ? paths.home : seatHomeOf(paths, account, spec.provider);
  return { settings: `${profile}/config.json`, cliConfig: `${cliHome}/.claude.json` };
}

const AppSettings = z.object({
  windowSizeWasSignedIn: z.boolean().optional(),
  lastKnownAccountUuid: z.string().optional().catch(undefined),
});

const CliConfig = z.object({ oauthAccount: z.object({ accountUuid: z.string() }).optional() });

export function appLoginOf(observed: { account: string; hasProfile: boolean; settings?: string; cliConfig?: string }) {
  const isUnopenedSeat = !observed.hasProfile && !isPersonalAccount(observed.account);
  if (isUnopenedSeat) return { login: AppLoginState.signedOut, isOtherAccount: false };
  const app = AppSettings.safeParse(parseJson(observed.settings ?? '')).data;
  if (app?.windowSizeWasSignedIn === undefined) return { login: AppLoginState.unknown, isOtherAccount: false };
  if (!app.windowSizeWasSignedIn) return { login: AppLoginState.signedOut, isOtherAccount: false };
  const cliAccount = CliConfig.safeParse(parseJson(observed.cliConfig ?? '')).data?.oauthAccount?.accountUuid;
  const appAccount = app.lastKnownAccountUuid;
  const isOtherAccount = appAccount !== undefined && cliAccount !== undefined && appAccount !== cliAccount;
  return { login: AppLoginState.signedIn, isOtherAccount };
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
