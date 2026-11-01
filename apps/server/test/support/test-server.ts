import { createRpcClient } from '@favo/contracts/rpc/client';
import { ProviderId } from '@favo/domain/providers/provider';
import { ScriptedDesktopApps } from '@/modules/desktop/gateways/scripted.desktop-apps';
import { ScriptedHerdr } from '@/modules/herdr/gateways/scripted.herdr';
import { LoopbackRemoteBackends } from '@/modules/machines/gateways/loopback.remote-backends';
import { ScriptedReleaseAssets } from '@/modules/machines/gateways/scripted.release-assets';
import { ScriptedSsh } from '@/modules/machines/gateways/scripted.ssh';
import { StaticTailscale } from '@/modules/machines/gateways/static.tailscale';
import type { TailscalePeer } from '@/modules/machines/gateways/tailscale';
import { ScriptedProviderCli } from '@/modules/providers/gateways/scripted.provider-cli';
import { FixedClock } from '@/modules/system/gateways/fixed.clock';
import { InheritedShellEnvironment } from '@/modules/system/gateways/inherited.shell-environment';
import { MemoryFileSystem } from '@/modules/system/gateways/memory.file-system';
import { ScriptedProcessRunner } from '@/modules/system/gateways/scripted.process-runner';
import { createServer } from '@/server';
import { favoPathsOf } from '@/shared/config/favo-paths';

export const Home = '/home/bee';

type TestServerOptions = {
  hostname?: string;
  directory?: string;
  isWindows?: boolean;
  peers?: TailscalePeer[];
  callerEnv?: Record<string, string | undefined>;
  installed?: string[];
  binary?: string;
};

export function createTestServer(options: TestServerOptions = {}) {
  const fileSystem = new MemoryFileSystem();
  const processes = new ScriptedProcessRunner();
  for (const command of options.installed ?? ['claude', 'codex', 'agy', 'opencode']) processes.install(command);
  const clis = {
    [ProviderId.claude]: new ScriptedProviderCli(ProviderId.claude),
    [ProviderId.codex]: new ScriptedProviderCli(ProviderId.codex),
    [ProviderId.antigravity]: new ScriptedProviderCli(ProviderId.antigravity, false),
    [ProviderId.opencode]: new ScriptedProviderCli(ProviderId.opencode),
  };
  const ssh = new ScriptedSsh();
  const remotes = new LoopbackRemoteBackends();
  const releaseAssets = new ScriptedReleaseAssets(fileSystem);
  const desktopApps = new ScriptedDesktopApps();
  const herdr = new ScriptedHerdr();
  const paths = favoPathsOf({ home: Home, isWindows: options.isWindows ?? false });
  const server = createServer(
    {
      fileSystem,
      processes,
      shell: new InheritedShellEnvironment('/usr/bin:/bin'),
      clock: new FixedClock(),
      clis,
      ssh,
      tailscale: new StaticTailscale(options.peers),
      remotes,
      releaseAssets,
      desktopApps,
      herdr,
    },
    {
      paths,
      host: {
        hostname: options.hostname ?? 'macbook',
        platform: 'darwin',
        arch: 'arm64',
        home: Home,
        directory: options.directory ?? `${Home}/projects/hive`,
      },
      callerEnv: options.callerEnv ?? {},
      binary: options.binary,
    }
  );
  return {
    ...server,
    client: createRpcClient(server.router),
    fileSystem,
    processes,
    clis,
    ssh,
    remotes,
    releaseAssets,
    desktopApps,
    herdr,
    paths,
  };
}

export async function seedClaudeBase(fileSystem: MemoryFileSystem) {
  await fileSystem.writePrivateText(`${Home}/.claude/CLAUDE.md`, 'be kind');
  await fileSystem.writePrivateText(`${Home}/.claude/settings.json`, '{}');
  await fileSystem.writePrivateText(`${Home}/.claude/.claude.json`, '{"oauth":"secret"}');
  await fileSystem.ensureDirectory(`${Home}/.claude/skills`);
  await fileSystem.ensureDirectory(`${Home}/.claude/projects`);
}
