import { LoginState } from '@favo/contracts/rpc/views';
import { ProviderId } from '@favo/domain/providers/provider';
import { parseJson } from '@favo/domain/shared/parse-json';
import { UsageUnavailableReason, unavailableUsage } from '@favo/domain/usage/seat-usage';
import { z } from 'zod';
import {
  type LaunchEnvironment,
  ProviderCli,
  type ProviderSession,
  type UpdateSwitchSearch,
} from '@/modules/providers/gateways/provider-cli';
import { type ClaudeUsageResponse, claudeUsageOf } from '@/modules/providers/utils/claude-usage';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const StatusTimeoutMs = 15_000;
const UsageTimeoutMs = 10_000;
const PersonalOrganizationSuffix = "'s Organization";
const AmbientVariable = /^(?:CLAUDE|ANTHROPIC|HERDR)/i;
const UpdateSwitches = ['DISABLE_UPDATES', 'DISABLE_AUTOUPDATER'];
const ClaudeSettings = z.object({ env: z.record(z.string(), z.unknown()).optional() });
const UsageRequestId = 'usage';
const UsageArguments = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--no-session-persistence',
  '--setting-sources',
  'local',
];
const UsageRequests = [
  { type: 'control_request', request_id: 'init', request: { subtype: 'initialize' } },
  {
    type: 'control_request',
    request_id: UsageRequestId,
    request: { subtype: 'get_usage', skip_behaviors: true },
  },
];

export class ClaudeProviderCli extends ProviderCli {
  readonly id = ProviderId.claude;

  constructor(
    private readonly processes: ProcessRunner,
    private readonly usageTimeoutMs = UsageTimeoutMs
  ) {
    super();
  }

  async status(session: ProviderSession) {
    const result = await this.processes.run({
      command: session.binary,
      args: ['auth', 'status'],
      env: session.env,
      timeoutMs: StatusTimeoutMs,
    });
    const status = parseStatus(result.stdout);
    if (!status) return { login: LoginState.unknown };
    if (!status.loggedIn) return { login: LoginState.signedOut };
    return { login: LoginState.signedIn, identity: status.email ?? undefined, plan: planOf(status) };
  }

  loginArguments() {
    return ['auth', 'login'];
  }

  logoutArguments() {
    return ['auth', 'logout'];
  }

  override launchEnvironment(current: Record<string, string | undefined>): LaunchEnvironment {
    if (!current.TMUX) return { env: {}, unsetEnv: [] };
    return { env: { TERM: 'xterm-256color' }, unsetEnv: ['TMUX'] };
  }

  override usageEnvironment(current: Record<string, string | undefined>) {
    const { env, unsetEnv } = this.launchEnvironment(current);
    return { env, unsetEnv: [...unsetEnv, ...Object.keys(current).filter((name) => AmbientVariable.test(name))] };
  }

  override async updateSwitch({ env, home }: UpdateSwitchSearch, fileSystem: FileSystem) {
    const text = await fileSystem.readText(`${env.CLAUDE_CONFIG_DIR ?? `${home}/.claude`}/settings.json`);
    const settings = ClaudeSettings.safeParse(parseJson(text ?? '{}')).data;
    return UpdateSwitches.find((name) => env[name] || settings?.env?.[name]);
  }

  override async usage({ binary, env, cwd }: ProviderSession, checkedAt: string) {
    const server = this.processes.open({ command: binary, args: UsageArguments, env, cwd });
    const answer = await this.ask(server, UsageRequests, usageAnswerOf, this.usageTimeoutMs);
    if (!answer) return unavailableUsage(checkedAt, UsageUnavailableReason.probeFailed, 'Claude Code did not answer.');
    return claudeUsageOf(answer.response, checkedAt);
  }
}

type ControlMessage = {
  type?: string;
  response?: { request_id?: string; response?: ClaudeUsageResponse };
} | null;

function usageAnswerOf(message: ControlMessage) {
  const isAnswer = message?.type === 'control_response' && message.response?.request_id === UsageRequestId;
  return isAnswer ? message.response : undefined;
}

type ClaudeStatus = { loggedIn?: boolean; email?: string | null; orgName?: string; subscriptionType?: string };

function parseStatus(stdout: string) {
  try {
    return JSON.parse(stdout) as ClaudeStatus;
  } catch {
    return undefined;
  }
}

function planOf(status: ClaudeStatus) {
  const organization = status.orgName?.endsWith(PersonalOrganizationSuffix) ? undefined : status.orgName;
  const parts = [status.subscriptionType, organization].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
