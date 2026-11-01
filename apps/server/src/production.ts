import { arch, homedir, hostname, platform } from 'node:os';
import { delimiter } from 'node:path';
import { ProviderId } from '@favo/domain/providers/provider';
import { CliTailscale } from '@/modules/machines/gateways/cli.tailscale';
import { GithubReleaseAssets } from '@/modules/machines/gateways/github.release-assets';
import { OpenSsh } from '@/modules/machines/gateways/open.ssh';
import { SshRemoteBackends } from '@/modules/machines/gateways/ssh.remote-backends';
import { AntigravityProviderCli } from '@/modules/providers/gateways/antigravity.provider-cli';
import { ClaudeProviderCli } from '@/modules/providers/gateways/claude.provider-cli';
import { CodexProviderCli } from '@/modules/providers/gateways/codex.provider-cli';
import { OpencodeProviderCli } from '@/modules/providers/gateways/opencode.provider-cli';
import { BunProcessRunner } from '@/modules/system/gateways/bun.process-runner';
import { InheritedShellEnvironment } from '@/modules/system/gateways/inherited.shell-environment';
import { LoginShellEnvironment } from '@/modules/system/gateways/login.shell-environment';
import { NodeFileSystem } from '@/modules/system/gateways/node.file-system';
import { SystemClock } from '@/modules/system/gateways/system.clock';
import { createServer } from '@/server';
import { favoPathsOf } from '@/shared/config/favo-paths';

export function createProductionServer(env: Record<string, string | undefined>) {
  const isWindows = platform() === 'win32';
  const home = forwardSlashes(env.HOME ?? homedir());
  const paths = favoPathsOf({ home, favoHome: env.FAVO_HOME ? forwardSlashes(env.FAVO_HOME) : undefined, isWindows });
  const processes = new BunProcessRunner(env, isWindows);
  const inheritedPath = [env.PATH ?? '', `${home}/.local/bin`].join(delimiter);
  const isInSshSession = env.SSH_CONNECTION !== undefined || env.FAVO_LOGIN_SHELL !== undefined;
  const needsLoginShell = isInSshSession && !isWindows;
  const shell = needsLoginShell
    ? new LoginShellEnvironment(processes, env.SHELL ?? '/bin/sh', inheritedPath)
    : new InheritedShellEnvironment(inheritedPath);
  const ssh = new OpenSsh(processes);
  const name = (env.FAVO_HOSTNAME ?? hostname()).split('.')[0]!.toLowerCase();
  return createServer(
    {
      fileSystem: new NodeFileSystem(platform()),
      processes,
      shell,
      clock: new SystemClock(),
      clis: {
        [ProviderId.claude]: new ClaudeProviderCli(processes),
        [ProviderId.codex]: new CodexProviderCli(processes),
        [ProviderId.antigravity]: new AntigravityProviderCli(processes),
        [ProviderId.opencode]: new OpencodeProviderCli(processes),
      },
      ssh,
      tailscale: new CliTailscale(processes),
      remotes: new SshRemoteBackends(ssh),
      releaseAssets: new GithubReleaseAssets(),
    },
    {
      paths,
      host: { hostname: name, platform: platform(), arch: arch(), home, directory: process.cwd() },
      callerEnv: env,
    }
  );
}

function forwardSlashes(path: string) {
  return path.replaceAll('\\', '/');
}
