import { LoginState, type SeatStatus } from '@favo/contracts/rpc/views';
import { assertAccountName, isPersonalAccount } from '@favo/domain/accounts/account';
import { type ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import {
  EntryKind,
  ItemAction,
  isItemHealthy,
  mirrorEntries,
  planSharedItem,
  SharedItemState,
  unclassifiedEntries,
} from '@favo/domain/sharing/shared-item';
import type { AccountRepository } from '@/modules/accounts/repositories/account.repository';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class SeatsService {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly accounts: AccountRepository,
    private readonly providers: ProvidersService,
    private readonly paths: FavoPaths
  ) {}

  async status(account: string, provider: ProviderId): Promise<SeatStatus> {
    await this.assertAccount(account);
    if (!(await this.isProvisioned(account, provider))) {
      const binary = await this.providers.binaryOf(provider);
      return { login: binary ? LoginState.signedOut : LoginState.notInstalled, problems: 0 };
    }
    const [login, { items }] = await Promise.all([
      this.providers.loginOf(account, provider),
      this.inspect(account, provider),
    ]);
    return { ...login, problems: items.filter((item) => !isItemHealthy(item.state)).length };
  }

  async isProvisioned(account: string, provider: ProviderId) {
    const entry = await this.fileSystem.entry(this.providers.seatHome(account, provider));
    return entry.kind !== EntryKind.missing;
  }

  async inspect(account: string, provider: ProviderId) {
    await this.assertAccount(account);
    const spec = Providers[provider];
    const seatHome = this.providers.seatHome(account, provider);
    const items = await Promise.all(
      spec.shared.map(async (name) => ({ name, state: await this.stateOf(account, provider, name) }))
    );
    const baseEntries = await this.fileSystem.list(`${this.paths.home}/${spec.personalHome}`);
    const prefix = spec.mirrorsHome ? `${spec.personalHome}/` : '';
    const unclassified = unclassifiedEntries(
      baseEntries.map((entry) => `${prefix}${entry}`),
      spec
    );
    const mirrored =
      spec.mirrorsHome && !isPersonalAccount(account) ? (await this.fileSystem.list(seatHome)).length : 0;
    return { items, privateItems: spec.private, unclassified, mirrored };
  }

  async reconcile(account: string, provider: ProviderId) {
    await this.assertAccount(account);
    const linked: string[] = [];
    const problems: { name: string; state: SharedItemState }[] = [];
    if (isPersonalAccount(account)) return { account, provider, linked, problems };
    const spec = Providers[provider];
    const seatHome = this.providers.seatHome(account, provider);
    await this.fileSystem.ensureDirectory(seatHome);
    for (const name of spec.shared) {
      if (await this.hasLinkedParent(seatHome, name)) {
        problems.push({ name, state: SharedItemState.conflict });
        continue;
      }
      const basePath = this.basePathOf(provider, name);
      const seatPath = `${seatHome}/${name}`;
      const plan = planSharedItem({
        base: await this.fileSystem.entry(basePath),
        seat: await this.fileSystem.entry(seatPath),
        basePath,
      });
      if (plan.action === ItemAction.report) problems.push({ name, state: plan.state });
      if (plan.action === ItemAction.relink) await this.fileSystem.unlink(seatPath);
      if (plan.action === ItemAction.link || plan.action === ItemAction.relink) {
        await this.fileSystem.link(basePath, seatPath);
        linked.push(name);
      }
    }
    if (spec.mirrorsHome) await this.mirrorHome(seatHome, spec.shared);
    return { account, provider, linked, problems };
  }

  async repairAll(account?: string) {
    const names = account ? [account] : await this.accounts.names();
    const repairs = [];
    for (const name of names) {
      for (const provider of ProviderOrder) {
        if (await this.isProvisioned(name, provider)) repairs.push(await this.reconcile(name, provider));
      }
    }
    return repairs;
  }

  private async mirrorHome(seatHome: string, shared: string[]) {
    const entries = mirrorEntries(await this.fileSystem.list(this.paths.home), shared);
    for (const entry of entries) {
      const target = `${this.paths.home}/${entry}`;
      const path = `${seatHome}/${entry}`;
      const seat = await this.fileSystem.entry(path);
      if (seat.kind === EntryKind.brokenLink) await this.fileSystem.unlink(path);
      if (seat.kind === EntryKind.missing || seat.kind === EntryKind.brokenLink)
        await this.fileSystem.link(target, path);
    }
  }

  private async stateOf(account: string, provider: ProviderId, name: string) {
    const basePath = this.basePathOf(provider, name);
    const base = await this.fileSystem.entry(basePath);
    if (isPersonalAccount(account)) {
      return base.kind === EntryKind.missing ? SharedItemState.notInBase : SharedItemState.linked;
    }
    const seatHome = this.providers.seatHome(account, provider);
    if (await this.hasLinkedParent(seatHome, name)) return SharedItemState.conflict;
    const seat = await this.fileSystem.entry(`${seatHome}/${name}`);
    return planSharedItem({ base, seat, basePath }).state;
  }

  private async hasLinkedParent(seatHome: string, name: string) {
    const folders = name.split('/').slice(0, -1);
    for (let depth = 1; depth <= folders.length; depth++) {
      const parent = await this.fileSystem.entry(`${seatHome}/${folders.slice(0, depth).join('/')}`);
      if (parent.kind === EntryKind.link || parent.kind === EntryKind.brokenLink) return true;
    }
    return false;
  }

  private basePathOf(provider: ProviderId, name: string) {
    const spec = Providers[provider];
    return spec.mirrorsHome ? `${this.paths.home}/${name}` : `${this.paths.home}/${spec.personalHome}/${name}`;
  }

  private async assertAccount(account: string) {
    if (isPersonalAccount(account)) return;
    assertAccountName(account);
    assertDomain(
      await this.accounts.exists(account),
      DomainErrorCode.accountNotFound,
      `No account named "${account}".`
    );
  }
}
