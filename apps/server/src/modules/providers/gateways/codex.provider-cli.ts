import { LoginState } from '@favo/contracts/rpc/views';
import { ProviderId } from '@favo/domain/providers/provider';
import {
  type LoginContext,
  ProviderCli,
  type ProviderLogin,
  type ProviderSession,
} from '@/modules/providers/gateways/provider-cli';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const AccountRequestId = 2;
const ConversationTimeoutMs = 8_000;
const StatusTimeoutMs = 10_000;

export class CodexProviderCli extends ProviderCli {
  readonly id = ProviderId.codex;

  constructor(private readonly processes: ProcessRunner) {
    super();
  }

  async status(session: ProviderSession) {
    return (await this.readAccount(session)) ?? this.readLoginStatus(session);
  }

  loginArguments({ isOverSsh }: LoginContext) {
    return isOverSsh ? ['login', '--device-auth'] : ['login'];
  }

  logoutArguments() {
    return ['logout'];
  }

  private async readAccount(session: ProviderSession) {
    const server = this.processes.open({ command: session.binary, args: ['app-server'], env: session.env });
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ConversationTimeoutMs));
    const answer = new Promise<ProviderLogin | undefined>((resolve) => {
      server.onLine((line) => {
        const message = parseLine(line);
        if (message?.id === AccountRequestId) resolve(loginOf(message));
      });
      void server.exited.then(() => resolve(undefined));
    });
    server.write(
      JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'favo', version: '0' } } })
    );
    server.write(JSON.stringify({ method: 'initialized' }));
    server.write(JSON.stringify({ id: AccountRequestId, method: 'account/read', params: { refreshToken: false } }));
    const login = await Promise.race([answer, timeout]);
    server.kill();
    return login;
  }

  private async readLoginStatus(session: ProviderSession): Promise<ProviderLogin> {
    const result = await this.processes.run({
      command: session.binary,
      args: ['login', 'status'],
      env: session.env,
      timeoutMs: StatusTimeoutMs,
    });
    const output = `${result.stdout}${result.stderr}`;
    if (/not logged in/i.test(output)) return { login: LoginState.signedOut };
    if (/logged in/i.test(output)) return { login: LoginState.signedIn };
    return { login: LoginState.unknown };
  }
}

type AccountRead = { account?: { type?: string; email?: string; planType?: string } | null };
type AccountMessage = { id?: number; result?: AccountRead; error?: { message?: string } };

function parseLine(line: string) {
  try {
    return JSON.parse(line) as AccountMessage;
  } catch {
    return undefined;
  }
}

function loginOf(message: AccountMessage): ProviderLogin {
  const account = message.result?.account;
  if (message.error) return { login: LoginState.signedOut, plan: 'login expired' };
  if (!account) return { login: LoginState.signedOut };
  return { login: LoginState.signedIn, identity: account.email ?? account.type, plan: account.planType };
}
