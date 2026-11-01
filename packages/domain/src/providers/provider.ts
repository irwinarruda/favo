import { DomainError, DomainErrorCode } from '#domain/shared/domain-error';
import type { ValueOf } from '#domain/shared/value-of';

export const ProviderId = {
  claude: 'claude',
  codex: 'codex',
  antigravity: 'antigravity',
  opencode: 'opencode',
} as const;
export type ProviderId = ValueOf<typeof ProviderId>;

export const ProviderHomeKind = {
  variable: 'variable',
  privateHome: 'privateHome',
  xdg: 'xdg',
} as const;
export type ProviderHomeKind = ValueOf<typeof ProviderHomeKind>;

export const LoginScope = {
  perAccount: 'perAccount',
  unverified: 'unverified',
} as const;
export type LoginScope = ValueOf<typeof LoginScope>;

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  executable: string;
  aliases: string[];
  homeKind: ProviderHomeKind;
  homeVariable?: string;
  personalHome: string;
  shared: string[];
  private: string[];
  mirrorsHome: boolean;
  loginScope: LoginScope;
  pathHint: string;
};

export const Providers: Record<ProviderId, ProviderSpec> = {
  claude: {
    id: ProviderId.claude,
    label: 'Claude Code',
    executable: 'claude',
    aliases: ['claude'],
    homeKind: ProviderHomeKind.variable,
    homeVariable: 'CLAUDE_CONFIG_DIR',
    personalHome: '.claude',
    shared: [
      'CLAUDE.md',
      'settings.json',
      'keybindings.json',
      'statusline-command.sh',
      'skills',
      'agents',
      'agent-memory',
      'commands',
      'hooks',
      'plugins',
      'output-styles',
    ],
    private: ['.claude.json', 'projects', 'sessions', 'history.jsonl', 'file-history', 'session-env', 'todos'],
    mirrorsHome: false,
    loginScope: LoginScope.perAccount,
    pathHint: 'CLAUDE_CONFIG_DIR path',
  },
  codex: {
    id: ProviderId.codex,
    label: 'Codex',
    executable: 'codex',
    aliases: ['codex'],
    homeKind: ProviderHomeKind.variable,
    homeVariable: 'CODEX_HOME',
    personalHome: '.codex',
    shared: ['AGENTS.md', 'config.toml', 'hooks.json', 'instructions.md', 'skills', 'agents', 'rules', 'prompts'],
    private: ['auth.json', 'sessions', 'archived_sessions', 'history.jsonl', 'memories', 'plugins'],
    mirrorsHome: false,
    loginScope: LoginScope.perAccount,
    pathHint: 'CODEX_HOME path',
  },
  antigravity: {
    id: ProviderId.antigravity,
    label: 'Antigravity',
    executable: 'agy',
    aliases: ['antigravity', 'agy'],
    homeKind: ProviderHomeKind.privateHome,
    personalHome: '.gemini/antigravity-cli',
    shared: [
      '.gemini/GEMINI.md',
      '.gemini/config',
      '.gemini/antigravity-cli/settings.json',
      '.gemini/antigravity-cli/keybindings.json',
      '.gemini/antigravity-cli/skills',
      '.gemini/antigravity-cli/plugins',
    ],
    private: ['.gemini/antigravity-cli/conversations', '.gemini/antigravity-cli/brain'],
    mirrorsHome: true,
    loginScope: LoginScope.unverified,
    pathHint: 'HOME for agy',
  },
  opencode: {
    id: ProviderId.opencode,
    label: 'OpenCode',
    executable: 'opencode',
    aliases: ['opencode'],
    homeKind: ProviderHomeKind.xdg,
    personalHome: '.local/share/opencode',
    shared: [],
    private: ['auth.json', 'opencode.db', 'storage', 'snapshot'],
    mirrorsHome: false,
    loginScope: LoginScope.perAccount,
    pathHint: 'XDG_DATA_HOME for opencode',
  },
};

export const ProviderOrder: ProviderId[] = [
  ProviderId.claude,
  ProviderId.codex,
  ProviderId.antigravity,
  ProviderId.opencode,
];

export function findProvider(name: string) {
  return ProviderOrder.map((id) => Providers[id]).find((spec) => spec.aliases.includes(name));
}

export function requireProvider(name: string) {
  const spec = findProvider(name);
  if (!spec) {
    throw new DomainError(
      DomainErrorCode.unknownProvider,
      `Unknown provider "${name}". Use claude, codex, antigravity or opencode.`
    );
  }
  return spec;
}

export function isolationEnvironment(spec: ProviderSpec, seatHome: string): Record<string, string> {
  if (spec.homeKind === ProviderHomeKind.variable) return { [spec.homeVariable!]: seatHome };
  if (spec.homeKind === ProviderHomeKind.privateHome) return { HOME: seatHome, USERPROFILE: seatHome };
  return { XDG_DATA_HOME: seatHome, XDG_STATE_HOME: `${seatHome}/state` };
}
