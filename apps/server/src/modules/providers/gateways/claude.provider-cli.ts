import { LoginState } from '@favo/contracts/rpc/views';
import { ProviderId } from '@favo/domain/providers/provider';
import { type LaunchEnvironment, ProviderCli, type ProviderSession } from '@/modules/providers/gateways/provider-cli';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const StatusTimeoutMs = 15_000;
const PersonalOrganizationSuffix = "'s Organization";

export class ClaudeProviderCli extends ProviderCli {
  readonly id = ProviderId.claude;

  constructor(private readonly processes: ProcessRunner) {
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
    return { login: LoginState.signedIn, identity: status.email, plan: planOf(status) };
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
}

type ClaudeStatus = { loggedIn?: boolean; email?: string; orgName?: string; subscriptionType?: string };

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
