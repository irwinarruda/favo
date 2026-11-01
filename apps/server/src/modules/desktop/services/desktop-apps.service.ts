import type { OpenDesktopAppParams } from '@favo/contracts/rpc/desktop/open-desktop-app';
import {
  type DesktopAppSpec,
  DesktopAppSpecs,
  DesktopOpening,
  desktopLaunchOf,
  desktopProfileOf,
} from '@favo/domain/desktop/desktop-app';
import { type ProviderId, ProviderOrder, Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import type { SeatsService } from '@/modules/accounts/services/seats.service';
import type { DesktopApps } from '@/modules/desktop/gateways/desktop-apps';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';

export class DesktopAppsService {
  constructor(
    private readonly desktopApps: DesktopApps,
    private readonly seats: SeatsService,
    private readonly providers: ProvidersService,
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths
  ) {}

  async list() {
    const specs = ProviderOrder.flatMap((provider) => DesktopAppSpecs[provider] ?? []);
    const found = await Promise.all(specs.map((spec) => this.desktopApps.find(spec)));
    return found.flatMap((app) => (app ? [{ provider: app.spec.provider, label: app.spec.label }] : []));
  }

  async open({ account, provider, canClose }: OpenDesktopAppParams) {
    const spec = this.requireSpec(provider);
    const { label } = spec;
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

  private requireSpec(provider: ProviderId): DesktopAppSpec {
    const spec = DesktopAppSpecs[provider];
    if (spec) return spec;
    throw new DomainError(DomainErrorCode.desktopAppMissing, `${Providers[provider].label} has no desktop app.`);
  }
}
