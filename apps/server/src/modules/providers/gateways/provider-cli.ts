import type { LoginState } from '@favo/contracts/rpc/views';
import type { ProviderId } from '@favo/domain/providers/provider';

export type ProviderSession = { binary: string; env: Record<string, string> };
export type ProviderLogin = { login: LoginState; identity?: string; plan?: string };
export type LaunchEnvironment = { env: Record<string, string>; unsetEnv: string[] };

export type LoginContext = { isOverSsh: boolean };

export abstract class ProviderCli {
  abstract readonly id: ProviderId;
  abstract status(session: ProviderSession): Promise<ProviderLogin>;
  abstract loginArguments(context: LoginContext): string[];
  abstract logoutArguments(): string[] | undefined;

  async isolationArguments(_session: ProviderSession): Promise<string[]> {
    return [];
  }

  launchEnvironment(_current: Record<string, string | undefined>): LaunchEnvironment {
    return { env: {}, unsetEnv: [] };
  }
}
