import { FavoVersion } from '@favo/contracts/version';
import type { ProviderId } from '@favo/domain/providers/provider';
import { registerAccountsController } from '@/modules/accounts/controllers/accounts.controller';
import { AccountRepository } from '@/modules/accounts/repositories/account.repository';
import { ThreadRepository } from '@/modules/accounts/repositories/thread.repository';
import { AccountsService } from '@/modules/accounts/services/accounts.service';
import { HooksService } from '@/modules/accounts/services/hooks.service';
import { SeatsService } from '@/modules/accounts/services/seats.service';
import { ThreadsService } from '@/modules/accounts/services/threads.service';
import { UsageService } from '@/modules/accounts/services/usage.service';
import { registerDesktopController } from '@/modules/desktop/controllers/desktop.controller';
import type { DesktopApps } from '@/modules/desktop/gateways/desktop-apps';
import { DesktopAppsService } from '@/modules/desktop/services/desktop-apps.service';
import { registerDirectoriesController } from '@/modules/directories/controllers/directories.controller';
import { DirectoriesService } from '@/modules/directories/services/directories.service';
import type { Herdr } from '@/modules/herdr/gateways/herdr';
import { registerMachinesController } from '@/modules/machines/controllers/machines.controller';
import type { ReleaseAssets } from '@/modules/machines/gateways/release-assets';
import type { RemoteBackends } from '@/modules/machines/gateways/remote-backends';
import type { Ssh } from '@/modules/machines/gateways/ssh';
import type { Tailscale } from '@/modules/machines/gateways/tailscale';
import { MachineRepository } from '@/modules/machines/repositories/machine.repository';
import { InstallerService } from '@/modules/machines/services/installer.service';
import { MachinesService } from '@/modules/machines/services/machines.service';
import type { ProviderCli } from '@/modules/providers/gateways/provider-cli';
import { ProviderRunRepository } from '@/modules/providers/repositories/provider-run.repository';
import { ProviderUpdateRepository } from '@/modules/providers/repositories/provider-update.repository';
import { ProviderUpdatesService } from '@/modules/providers/services/provider-updates.service';
import { ProvidersService } from '@/modules/providers/services/providers.service';
import { registerSystemController } from '@/modules/system/controllers/system.controller';
import type { Clock } from '@/modules/system/gateways/clock';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';
import type { ShellEnvironment } from '@/modules/system/gateways/shell-environment';
import { ConfigRepository } from '@/modules/system/repositories/config.repository';
import { registerTerminalController } from '@/modules/terminal/controllers/terminal.controller';
import { TerminalService } from '@/modules/terminal/services/terminal.service';
import { UpdateService } from '@/modules/terminal/services/update.service';
import { registerThemesController } from '@/modules/themes/controllers/themes.controller';
import { ThemeRepository } from '@/modules/themes/repositories/theme.repository';
import { ThemesService } from '@/modules/themes/services/themes.service';
import type { FavoPaths } from '@/shared/config/favo-paths';
import type { HostFacts } from '@/shared/config/host-facts';
import { RpcRouter } from '@/shared/rpc/rpc-router';

export type ServerGateways = {
  fileSystem: FileSystem;
  processes: ProcessRunner;
  shell: ShellEnvironment;
  clock: Clock;
  clis: Record<ProviderId, ProviderCli>;
  ssh: Ssh;
  tailscale: Tailscale;
  remotes: RemoteBackends;
  releaseAssets: ReleaseAssets;
  desktopApps: DesktopApps;
  herdr: Herdr;
};

export type ServerOptions = {
  paths: FavoPaths;
  host: HostFacts;
  callerEnv: Record<string, string | undefined>;
  pid: number;
  uid?: number;
  binary?: string;
};

export function createServer(gateways: ServerGateways, options: ServerOptions) {
  const { fileSystem, processes, shell, clock, clis, ssh, tailscale, remotes, releaseAssets, desktopApps, herdr } =
    gateways;
  const { paths, host, callerEnv, pid, uid, binary } = options;
  const router = new RpcRouter();
  const providers = new ProvidersService(clis, processes, shell, fileSystem, paths, host, callerEnv, uid);
  const config = new ConfigRepository(fileSystem, paths);
  const accountRepository = new AccountRepository(fileSystem, paths);
  const seats = new SeatsService(fileSystem, accountRepository, providers, paths);
  const threadRepository = new ThreadRepository(fileSystem, paths);
  const accounts = new AccountsService(
    fileSystem,
    accountRepository,
    threadRepository,
    seats,
    providers,
    config,
    clock,
    paths
  );
  const usage = new UsageService(accounts, providers, fileSystem, clock, paths, callerEnv);
  const threads = new ThreadsService(
    threadRepository,
    seats,
    providers,
    fileSystem,
    herdr,
    processes,
    clock,
    paths,
    host,
    callerEnv,
    binary
  );
  const hooks = new HooksService(fileSystem, accountRepository, seats, providers, paths);
  const machineRepository = new MachineRepository(fileSystem, paths);
  const machines = new MachinesService(
    machineRepository,
    remotes,
    ssh,
    tailscale,
    fileSystem,
    paths,
    host,
    FavoVersion
  );
  const installer = new InstallerService(machines, ssh, remotes, releaseAssets, hooks, fileSystem, paths, FavoVersion);
  const directories = new DirectoriesService(fileSystem, paths, host);
  const providerRuns = new ProviderRunRepository(fileSystem, processes, paths);
  const providerUpdates = new ProviderUpdatesService(
    providers,
    providerRuns,
    new ProviderUpdateRepository(fileSystem, paths),
    processes,
    fileSystem,
    shell,
    config,
    paths,
    clock,
    callerEnv,
    pid
  );
  const terminal = new TerminalService(
    providers,
    seats,
    threads,
    machines,
    directories,
    config,
    providerRuns,
    callerEnv,
    binary
  );
  const updates = new UpdateService(providerUpdates, machines, fileSystem, paths, callerEnv, FavoVersion, binary);
  const themes = new ThemesService(new ThemeRepository(fileSystem, paths), config);
  const desktop = new DesktopAppsService(desktopApps, seats, providers, fileSystem, paths, host);
  registerSystemController(router, host);
  registerAccountsController(router, accounts, seats, usage, threads, hooks);
  registerMachinesController(router, machines, installer);
  registerTerminalController(router, terminal, updates, providerUpdates);
  registerDesktopController(router, desktop);
  registerThemesController(router, themes);
  registerDirectoriesController(router, directories);
  router.forwardWith((request) => machines.forward(request));
  return {
    router,
    prepare: () => fileSystem.ensurePrivateDirectory(paths.root),
    close() {
      usage.stop();
      remotes.closeAll();
      processes.killOpen();
    },
  };
}
