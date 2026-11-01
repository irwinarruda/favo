import { Tailscale, type TailscalePeer } from '@/modules/machines/gateways/tailscale';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const TailscaleCommands = [
  'tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  'C:/Program Files/Tailscale/tailscale.exe',
];
const StatusTimeoutMs = 5_000;

type TailscaleStatus = { Peer?: Record<string, { HostName?: string; Online?: boolean; OS?: string }> };

export class CliTailscale extends Tailscale {
  constructor(private readonly processes: ProcessRunner) {
    super();
  }

  async peers(): Promise<TailscalePeer[]> {
    for (const command of TailscaleCommands) {
      const result = await this.processes.run({ command, args: ['status', '--json'], timeoutMs: StatusTimeoutMs });
      if (result.code !== 0) continue;
      const status = JSON.parse(result.stdout) as TailscaleStatus;
      return Object.values(status.Peer ?? {}).map((peer) => ({
        name: peer.HostName ?? '',
        isOnline: peer.Online ?? false,
        os: peer.OS ?? '',
      }));
    }
    return [];
  }
}
