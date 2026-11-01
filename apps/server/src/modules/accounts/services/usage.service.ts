import { LoginState, type SeatUsageView, type SeatView } from '@favo/contracts/rpc/views';
import type { ProviderId } from '@favo/domain/providers/provider';
import { UsageUnavailableReason, unavailableUsage } from '@favo/domain/usage/seat-usage';
import type { AccountsService } from '@/modules/accounts/services/accounts.service';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { Clock } from '@/modules/system/gateways/clock';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

const MaximumReadsAtOnce = 4;

type ReadableSeat = SeatView & { displayName: string };

export class UsageService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly providers: ProvidersService,
    private readonly fileSystem: FileSystem,
    private readonly clock: Clock,
    private readonly paths: FavoPaths,
    private readonly callerEnv: Record<string, string | undefined>
  ) {}

  async read() {
    const accounts = await this.accounts.list();
    const seats = accounts.flatMap(({ displayName, seats }) =>
      seats.filter((seat) => seat.isInstalled && seat.isProvisioned).map((seat) => ({ ...seat, displayName }))
    );
    await this.fileSystem.ensurePrivateDirectory(this.paths.emptyFolder);
    const views: (SeatUsageView | undefined)[] = [];
    let next = 0;
    const readNext = async () => {
      while (next < seats.length) {
        const index = next++;
        views[index] = await this.readSeat(seats[index]!);
      }
    };
    await Promise.all(Array.from({ length: MaximumReadsAtOnce }, readNext));
    return views.filter((view) => view !== undefined);
  }

  private async readSeat({ account, provider, displayName }: ReadableSeat) {
    try {
      const { login, identity, plan } = await this.providers.loginOf(account, provider);
      if (login !== LoginState.signedIn) return undefined;
      return { account, displayName, provider, identity, plan, usage: await this.usageOf(account, provider) };
    } catch {
      return undefined;
    }
  }

  private async usageOf(account: string, provider: ProviderId) {
    const checkedAt = this.clock.now().toISOString();
    try {
      const binary = await this.providers.requireBinary(provider);
      const cli = this.providers.cliOf(provider);
      const { env, unsetEnv } = cli.usageEnvironment(this.callerEnv);
      const cleared = Object.fromEntries(unsetEnv.map((name) => [name, undefined]));
      const seatEnv = await this.providers.environmentOf(account, provider);
      const session = { binary, env: { ...cleared, ...seatEnv, ...env }, cwd: this.paths.emptyFolder };
      return await cli.usage(session, checkedAt);
    } catch {
      return unavailableUsage(checkedAt, UsageUnavailableReason.probeFailed);
    }
  }
}
