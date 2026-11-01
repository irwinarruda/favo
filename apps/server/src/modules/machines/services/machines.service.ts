import { Protocol, type RpcRequest } from '@favo/contracts/rpc/envelope';
import type { DiscoveredMachine } from '@favo/contracts/rpc/machines/discover-machines';
import type { MachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { PingResult, ping } from '@favo/contracts/rpc/system/ping';
import {
  assertMachineName,
  assertMachineTarget,
  DiscoverySource,
  isOlderVersion,
  LocalMachineId,
  type Machine,
  MachineState,
  machineNameFromTarget,
} from '@favo/domain/machines/machine';
import { detectRemoteSystem, ProbeCommands } from '@favo/domain/machines/remote-commands';
import { stripControlCharacters } from '@favo/domain/shared/control-characters';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import type { RemoteBackends } from '@/modules/machines/gateways/remote-backends';
import type { Ssh } from '@/modules/machines/gateways/ssh';
import type { Tailscale } from '@/modules/machines/gateways/tailscale';
import type { MachineRepository } from '@/modules/machines/repositories/machine.repository';
import { parseSshHosts } from '@/modules/machines/utils/ssh-config';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { FavoPaths } from '@/shared/config/favo-paths';
import type { HostFacts } from '@/shared/config/host-facts';

const DiscoverableSystems = ['linux', 'macos', 'darwin', 'windows'];
const ReachabilityTimeoutMs = 12_000;

export class MachinesService {
  constructor(
    private readonly machines: MachineRepository,
    private readonly remotes: RemoteBackends,
    private readonly ssh: Ssh,
    private readonly tailscale: Tailscale,
    private readonly fileSystem: FileSystem,
    private readonly paths: FavoPaths,
    private readonly host: HostFacts,
    private readonly version: string
  ) {}

  async list() {
    const local: Machine = { id: LocalMachineId, name: this.host.hostname, isLocal: true };
    return [local, ...(await this.machines.list())];
  }

  async add(input: { target: string; name?: string }) {
    assertMachineTarget(input.target);
    const name = input.name ?? machineNameFromTarget(input.target);
    assertMachineName(name);
    const known = await this.machines.list();
    const isKnown = known.some((machine) => machine.id === name || machine.target === input.target);
    assertDomain(
      !isKnown,
      DomainErrorCode.machineExists,
      `${name} is already here. To install or update favo there: favo machine install ${name}`
    );
    const probe = await this.ssh.exec(input.target, ProbeCommands.reachable, ReachabilityTimeoutMs);
    assertDomain(probe.code === 0, DomainErrorCode.machineUnreachable, lastLineOf(probe.stderr, input.target));
    const system = await this.detectSystem(input.target);
    const machine = { id: name, name, target: input.target, isLocal: false, system };
    await this.machines.add(machine);
    return machine;
  }

  async remove(id: string) {
    await this.requireRemote(id);
    this.remotes.close(id);
    await this.machines.remove(id);
    return {};
  }

  async discover() {
    const known = await this.machines.list();
    const isTaken = (name: string) =>
      name.toLowerCase() === this.host.hostname.toLowerCase() ||
      known.some((machine) => machine.name === name.toLowerCase() || machine.target?.endsWith(name));
    const fromSsh = parseSshHosts((await this.fileSystem.readText(`${this.paths.home}/.ssh/config`)) ?? '');
    const peers = await this.tailscale.peers().catch(() => []);
    const candidates = new Map<string, DiscoveredMachine>();
    for (const peer of peers) {
      const name = stripControlCharacters(peer.name);
      if (!DiscoverableSystems.includes(peer.os.toLowerCase()) || isTaken(name)) continue;
      candidates.set(name, {
        name: name.toLowerCase(),
        target: name,
        source: DiscoverySource.tailscale,
        isOnline: peer.isOnline,
      });
    }
    for (const host of fromSsh.map((found) => stripControlCharacters(found))) {
      if (isTaken(host)) continue;
      candidates.set(host, { name: host.toLowerCase(), target: host, source: DiscoverySource.sshConfig });
    }
    return [...candidates.values()];
  }

  async status(id: string): Promise<MachineStatus> {
    if (id === LocalMachineId) {
      return { state: MachineState.online, hostname: this.host.hostname, directory: this.host.directory };
    }
    const machine = await this.requireRemote(id);
    try {
      const response = await this.remotes.request(machine, { id: 0, method: ping.name, params: {} });
      if (!response.ok) return { state: MachineState.outdated, message: response.error.message };
      const result = PingResult.safeParse(response.result);
      if (!result.success || result.data.protocol !== Protocol) {
        return { state: MachineState.outdated, message: `${machine.name} runs an older favo.` };
      }
      const { version, hostname, directory } = result.data;
      const isBehind = isOlderVersion(version, this.version);
      return { state: MachineState.online, version, isBehind, hostname, directory };
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      if (error.code === DomainErrorCode.machineNeedsInstall) {
        return { state: MachineState.needsInstall, message: error.message };
      }
      return { state: MachineState.offline, message: error.message };
    }
  }

  async forward(request: RpcRequest) {
    return this.remotes.request(await this.requireRemote(request.machineId!), request);
  }

  private async detectSystem(target: string) {
    const uname = await this.ssh.exec(target, ProbeCommands.posix);
    if (uname.code === 0) return detectRemoteSystem({ uname: uname.stdout, ver: '' });
    const ver = await this.ssh.exec(target, ProbeCommands.windows);
    return detectRemoteSystem({ uname: '', ver: ver.stdout });
  }

  async requireRemote(id: string) {
    const machine = (await this.machines.list()).find((candidate) => candidate.id === id);
    if (!machine) throw new DomainError(DomainErrorCode.machineNotFound, `No machine named "${id}".`);
    return machine;
  }
}

function lastLineOf(stderr: string, target: string) {
  const line = stripControlCharacters(stderr.trim().split('\n').at(-1) ?? '');
  return line ? `${target}: ${line}` : `Could not reach ${target}.`;
}
