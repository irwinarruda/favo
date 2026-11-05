import { LoginState } from '@favo/contracts/rpc/views';
import { isPersonalAccount, seatHomeOf } from '@favo/domain/accounts/account';
import { isKeychainSkipped, KeychainFactFiles, sessionBusOf } from '@favo/domain/providers/keychain';
import { isolationEnvironment, loginScopeOf, type ProviderId, Providers } from '@favo/domain/providers/provider';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { EntryKind } from '@favo/domain/sharing/shared-item';
import type { ProviderCli } from '@/modules/providers/gateways/provider-cli';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';
import type { ShellEnvironment } from '@/modules/system/gateways/shell-environment';
import type { FavoPaths } from '@/shared/config/favo-paths';
import type { HostFacts } from '@/shared/config/host-facts';

export type ProviderClis = Record<ProviderId, ProviderCli>;

export class ProvidersService {
  private keychainProbe?: Promise<boolean>;

  constructor(
    private readonly clis: ProviderClis,
    private readonly processes: ProcessRunner,
    private readonly shell: ShellEnvironment,
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths,
    private readonly host: HostFacts,
    private readonly callerEnv: Record<string, string | undefined>,
    private readonly uid?: number
  ) {}

  seatHome(account: string, provider: ProviderId) {
    return seatHomeOf(this.paths, account, provider);
  }

  cliOf(provider: ProviderId) {
    return this.clis[provider];
  }

  async binaryOf(provider: ProviderId) {
    return this.processes.which(Providers[provider].executable, await this.shell.path());
  }

  async isOnPath(command: string) {
    return this.processes.which(command, await this.shell.path()) !== undefined;
  }

  async requireBinary(provider: ProviderId) {
    const binary = await this.binaryOf(provider);
    if (binary) return binary;
    const { label, executable } = Providers[provider];
    throw new DomainError(DomainErrorCode.providerNotInstalled, `${label} (${executable}) is not installed here.`);
  }

  async environmentOf(account: string, provider: ProviderId) {
    const isolation = isPersonalAccount(account)
      ? {}
      : isolationEnvironment(Providers[provider], this.seatHome(account, provider));
    return { PATH: await this.shell.path(), ...isolation } as Record<string, string>;
  }

  async isolationArgumentsOf(account: string, provider: ProviderId) {
    if (isPersonalAccount(account)) return [];
    const binary = await this.requireBinary(provider);
    return this.cliOf(provider).isolationArguments({ binary, env: await this.environmentOf(account, provider) });
  }

  async loginScopeOf(provider: ProviderId) {
    this.keychainProbe ??= this.probeKeychain();
    return loginScopeOf(Providers[provider], await this.keychainProbe);
  }

  async loginOf(account: string, provider: ProviderId) {
    const binary = await this.binaryOf(provider);
    if (!binary) return { login: LoginState.notInstalled };
    return this.cliOf(provider).status({ binary, env: await this.environmentOf(account, provider) });
  }

  private async probeKeychain() {
    const sessionBus = sessionBusOf(this.callerEnv, this.uid);
    const [osRelease, cgroup, dockerEnv, bus] = await Promise.all([
      this.fileSystem.readText(KeychainFactFiles.osRelease),
      this.fileSystem.readText(KeychainFactFiles.cgroup),
      this.fileSystem.entry(KeychainFactFiles.dockerEnv),
      sessionBus ? this.fileSystem.entry(sessionBus) : undefined,
    ]);
    return isKeychainSkipped({
      env: this.callerEnv,
      isLinux: this.host.platform === 'linux',
      osRelease,
      cgroup,
      hasDockerEnv: dockerEnv.kind !== EntryKind.missing,
      hasBusSocket: bus !== undefined && bus.kind !== EntryKind.missing,
    });
  }
}
