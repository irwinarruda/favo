import { LoginState } from '@favo/contracts/rpc/views';
import type { ProviderId } from '@favo/domain/providers/provider';
import { ProviderCli, type ProviderLogin, type ProviderSession } from '@/modules/providers/gateways/provider-cli';

export class ScriptedProviderCli extends ProviderCli {
  readonly sessions: ProviderSession[] = [];
  login: ProviderLogin = { login: LoginState.signedOut };
  isolation: string[] = [];

  constructor(
    readonly id: ProviderId,
    private readonly canLogout = true
  ) {
    super();
  }

  async status(session: ProviderSession) {
    this.sessions.push(session);
    return this.login;
  }

  override async isolationArguments() {
    return this.isolation;
  }

  loginArguments() {
    return ['login'];
  }

  logoutArguments() {
    return this.canLogout ? ['logout'] : undefined;
  }
}
