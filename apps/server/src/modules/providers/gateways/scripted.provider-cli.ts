import { LoginState } from '@favo/contracts/rpc/views';
import type { ProviderId } from '@favo/domain/providers/provider';
import type { SeatUsage } from '@favo/domain/usage/seat-usage';
import {
  type FoundThread,
  ProviderCli,
  type ProviderLogin,
  type ProviderSession,
  type ThreadSearch,
} from '@/modules/providers/gateways/provider-cli';

export class ScriptedProviderCli extends ProviderCli {
  readonly sessions: ProviderSession[] = [];
  login: ProviderLogin = { login: LoginState.signedOut };
  isolation: string[] = [];
  foundThreads: FoundThread[] = [];
  readonly threadSearches: ThreadSearch[] = [];
  usageReading?: Omit<SeatUsage, 'checkedAt'> | Error;
  readonly usageSessions: ProviderSession[] = [];
  currentReads = 0;
  mostReadsAtOnce = 0;

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

  override async usage(session: ProviderSession, checkedAt: string) {
    this.usageSessions.push(session);
    this.currentReads++;
    this.mostReadsAtOnce = Math.max(this.mostReadsAtOnce, this.currentReads);
    await Bun.sleep(0);
    this.currentReads--;
    if (this.usageReading instanceof Error) throw this.usageReading;
    return this.usageReading ? { checkedAt, ...this.usageReading } : super.usage(session, checkedAt);
  }

  override async recentThreads(search: ThreadSearch) {
    this.threadSearches.push(search);
    return this.foundThreads;
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
