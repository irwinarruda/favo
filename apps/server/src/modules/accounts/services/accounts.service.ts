import type { AccountView } from '@favo/contracts/rpc/views';
import { assertAccountName, isPersonalAccount, PersonalAccount } from '@favo/domain/accounts/account';
import { nativePath, pathsOverlap } from '@favo/domain/directories/directory-input';
import { type ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ownValue } from '@favo/domain/shared/own-value';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import type { AccountRepository } from '@/modules/accounts/repositories/account.repository';
import type { ThreadRepository } from '@/modules/accounts/repositories/thread.repository';
import type { SeatsService } from '@/modules/accounts/services/seats.service';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { Clock } from '@/modules/system/gateways/clock';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ConfigRepository } from '@/modules/system/repositories/config.repository';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class AccountsService {
  constructor(
    private readonly fileSystem: FileSystem,
    private readonly accounts: AccountRepository,
    private readonly threads: ThreadRepository,
    private readonly seats: SeatsService,
    private readonly providers: ProvidersService,
    private readonly config: ConfigRepository,
    private readonly clock: Clock,
    private readonly paths: FavoPaths
  ) {}

  async list() {
    const names = [PersonalAccount, ...(await this.accounts.names())];
    return Promise.all(names.map((name) => this.viewOf(name)));
  }

  async create(name: string) {
    assertAccountName(name);
    assertDomain(!(await this.isNameTaken(name)), DomainErrorCode.accountExists, `"${name}" already exists.`);
    await this.accounts.create(name);
    return this.viewOf(name);
  }

  async rename(name: string, newName: string) {
    await this.assertExists(name);
    if (newName !== name) {
      assertAccountName(newName);
      assertDomain(
        !(await this.isNameTaken(newName, name)),
        DomainErrorCode.accountExists,
        `"${newName}" already exists.`
      );
    }
    await this.config.saveAccountName(name, newName === name ? undefined : newName);
    return this.viewOf(name);
  }

  async remove(name: string) {
    assertDomain(
      !isPersonalAccount(name),
      DomainErrorCode.accountIsPersonal,
      'The base cell is your own setup; favo never removes it.'
    );
    await this.assertExists(name);
    const stamp = this.clock.now().toISOString().replaceAll(/[:.]/g, '-');
    const trashedTo = await this.accounts.trash(name, stamp);
    await this.threads.trash(name, trashedTo);
    await this.config.saveAccountName(name, undefined);
    return { trashedTo: nativePath(trashedTo, this.paths.isWindows) };
  }

  async adopt(name: string, provider: ProviderId, from: string) {
    assertAccountName(name);
    const source = /^~[\\/]/.test(from) ? `${this.paths.home}/${from.slice(2)}` : from;
    const entry = await this.fileSystem.entry(source);
    assertDomain(entry.kind === EntryKind.directory, DomainErrorCode.adoptSourceMissing, `${from} is not a folder.`);
    await this.assertMovable(source, from);
    const target = this.providers.seatHome(name, provider);
    const existing = await this.fileSystem.entry(target);
    assertDomain(existing.kind === EntryKind.missing, DomainErrorCode.adoptTargetExists, `${target} already exists.`);
    await this.accounts.create(name);
    await this.fileSystem.move(source, target);
    await this.seats.reconcile(name, provider);
    return this.viewOf(name);
  }

  private async assertMovable(source: string, from: string) {
    const bases = ProviderOrder.map((provider) => `${this.paths.home}/${Providers[provider].personalHome}`);
    const realSource = await this.fileSystem.realPath(source);
    for (const folder of [this.paths.root, ...bases]) {
      assertDomain(
        !pathsOverlap(realSource, await this.fileSystem.realPath(folder)),
        DomainErrorCode.adoptSourceProtected,
        `favo never moves ${folder}, and ${from} overlaps it.`
      );
    }
  }

  private async assertExists(name: string) {
    if (isPersonalAccount(name)) return;
    assertAccountName(name);
    assertDomain(await this.accounts.exists(name), DomainErrorCode.accountNotFound, `No account named "${name}".`);
  }

  private async isNameTaken(name: string, renaming?: string) {
    const folders = (await this.accounts.names()).filter((folder) => folder !== renaming);
    const shown = Object.entries(await this.config.accountNames());
    return folders.includes(name) || shown.some(([account, shownName]) => account !== renaming && shownName === name);
  }

  private async viewOf(name: string): Promise<AccountView> {
    const seats = await Promise.all(ProviderOrder.map((provider) => this.seatViewOf(name, provider)));
    const displayName = ownValue(await this.config.accountNames(), name) ?? name;
    return { name, displayName, isPersonal: isPersonalAccount(name), seats };
  }

  private async seatViewOf(account: string, provider: ProviderId) {
    const spec = Providers[provider];
    return {
      account,
      provider,
      label: spec.label,
      path: nativePath(this.providers.seatHome(account, provider), this.paths.isWindows),
      pathHint: spec.pathHint,
      loginScope: spec.loginScope,
      isInstalled: (await this.providers.binaryOf(provider)) !== undefined,
      isProvisioned: await this.seats.isProvisioned(account, provider),
      canLogout: this.providers.cliOf(provider).logoutArguments() !== undefined,
    };
  }
}
