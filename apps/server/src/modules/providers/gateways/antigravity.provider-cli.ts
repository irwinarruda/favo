import { LoginState } from '@favo/contracts/rpc/views';
import { ProviderId } from '@favo/domain/providers/provider';
import { ProviderCli, type ProviderSession, type UpdateSwitchSearch } from '@/modules/providers/gateways/provider-cli';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const StatusTimeoutMs = 15_000;
const UpdateVariable = 'AGY_CLI_DISABLE_AUTO_UPDATE';

export class AntigravityProviderCli extends ProviderCli {
  readonly id = ProviderId.antigravity;

  constructor(private readonly processes: ProcessRunner) {
    super();
  }

  async status(session: ProviderSession) {
    const result = await this.processes.run({
      command: session.binary,
      args: ['models'],
      env: session.env,
      timeoutMs: StatusTimeoutMs,
    });
    if (/sign in/i.test(`${result.stdout}${result.stderr}`)) return { login: LoginState.signedOut };
    return { login: result.code === 0 ? LoginState.signedIn : LoginState.unknown };
  }

  override async updateSwitch({ env }: UpdateSwitchSearch) {
    return env[UpdateVariable] ? UpdateVariable : undefined;
  }

  loginArguments() {
    return [];
  }

  logoutArguments() {
    return undefined;
  }
}
