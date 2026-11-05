import type { OpenDesktopAppParams } from '@favo/contracts/rpc/desktop/open-desktop-app';
import type { SeatParams } from '@favo/contracts/rpc/seats/seat-params';
import { LoginState } from '@favo/contracts/rpc/views';
import { isPersonalAccount } from '@favo/domain/accounts/account';
import {
  AppLoginState,
  appLoginFilesOf,
  appLoginOf,
  type DesktopAppSpec,
  DesktopAppSpecs,
  DesktopLogin,
  DesktopOpening,
  desktopLaunchOf,
  desktopProfileOf,
  fileAppLoginOf,
} from '@favo/domain/desktop/desktop-app';
import { type ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import type { SeatsService } from '@/modules/accounts/services/seats.service';
import type { DesktopApps } from '@/modules/desktop/gateways/desktop-apps';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';
import type { HostFacts } from '@/shared/config/host-facts';

export class DesktopAppsService {
  constructor(
    private readonly desktopApps: DesktopApps,
    private readonly seats: SeatsService,
    private readonly providers: ProvidersService,
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths,
    private readonly host: HostFacts
  ) {}

  async list() {
    const specs = ProviderOrder.flatMap((provider) => DesktopAppSpecs[provider] ?? []);
    const found = await Promise.all(specs.map((spec) => this.desktopApps.find(spec)));
    const { canOpen } = this.desktopApps;
    return found.flatMap((app) =>
      app ? [{ provider: app.spec.provider, label: app.spec.label, login: app.spec.login, canOpen }] : []
    );
  }

  async login({ account, provider }: SeatParams) {
    const spec = this.requireSpec(provider);
    assertDomain(
      spec.login === DesktopLogin.separate,
      DomainErrorCode.desktopAppMissing,
      `${spec.label} has no login of its own: it signs in through ${Providers[provider].label}.`
    );
    await this.seats.assertAccount(account);
    if (spec.loginFile) return this.fileLoginOf(account, provider, spec.loginFile);
    const profile = desktopProfileOf(this.paths, account, spec) ?? this.desktopApps.defaultProfile(spec);
    if (!profile) return { login: AppLoginState.unknown, isOtherAccount: false };
    const files = appLoginFilesOf(this.paths, account, spec, profile);
    const [hasProfile, settings, cliConfig] = await Promise.all([
      this.fileSystem.isDirectory(profile),
      this.fileSystem.readText(files.settings),
      this.fileSystem.readText(files.cliConfig),
    ]);
    return appLoginOf({ account, hasProfile, settings, cliConfig });
  }

  async open({ account, provider, canClose }: OpenDesktopAppParams) {
    const spec = this.requireSpec(provider);
    const { label } = spec;
    assertDomain(
      this.desktopApps.canOpen,
      DomainErrorCode.desktopAppFailed,
      `favo cannot open ${label} here, because there is no screen to show it on, as over SSH.`
    );
    assertDomain(
      spec.linux !== undefined || this.host.platform !== 'linux',
      DomainErrorCode.desktopAppMissing,
      `favo opens the ${label} app on macOS and Windows only.`
    );
    const app = await this.desktopApps.find(spec);
    assertDomain(app, DomainErrorCode.desktopAppMissing, `The ${label} app is not installed here.`);
    const isRunning = await this.desktopApps.isRunning(app);
    if (isRunning && !canClose) return { opening: DesktopOpening.stillOpen, label };
    await this.seats.reconcile(account, provider);
    const profile = desktopProfileOf(this.paths, account, spec);
    if (profile) await this.fileSystem.ensurePrivateDirectory(profile);
    if (isRunning) {
      const isClosed = await this.desktopApps.quit(app);
      assertDomain(
        isClosed,
        DomainErrorCode.desktopAppStuck,
        `${label} did not close. Quit it yourself, then try again.`
      );
    }
    await this.desktopApps.open(app, desktopLaunchOf(spec, this.providers.seatHome(account, provider), profile));
    return { opening: DesktopOpening.opened, label };
  }

  private async fileLoginOf(account: string, provider: ProviderId, loginFile: string) {
    if (isPersonalAccount(account)) {
      const { login } = await this.providers.loginOf(account, provider);
      if (login === LoginState.signedIn) return { login: AppLoginState.signedIn, isOtherAccount: false };
      if (login === LoginState.signedOut) return { login: AppLoginState.signedOut, isOtherAccount: false };
      return { login: AppLoginState.unknown, isOtherAccount: false };
    }
    const seatHome = this.providers.seatHome(account, provider);
    return fileAppLoginOf(await this.fileSystem.entry(`${seatHome}/${loginFile}`));
  }

  private requireSpec(provider: ProviderId): DesktopAppSpec {
    const spec = DesktopAppSpecs[provider];
    if (spec) return spec;
    throw new DomainError(DomainErrorCode.desktopAppMissing, `${Providers[provider].label} has no desktop app.`);
  }
}
