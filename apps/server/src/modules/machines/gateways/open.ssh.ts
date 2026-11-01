import { Ssh } from '@/modules/machines/gateways/ssh';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const ExecTimeoutMs = 20_000;
const ConnectionArguments = [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=8',
  '-o',
  'ServerAliveInterval=15',
  '-o',
  'ServerAliveCountMax=3',
  '-o',
  'StrictHostKeyChecking=accept-new',
];
const SessionArguments = ['-T', ...ConnectionArguments];

export class OpenSsh extends Ssh {
  constructor(private readonly processes: ProcessRunner) {
    super();
  }

  exec(target: string, command: string, timeoutMs = ExecTimeoutMs) {
    return this.processes.run({ command: 'ssh', args: [...SessionArguments, '--', target, command], timeoutMs });
  }

  open(target: string, command: string) {
    return this.processes.open({ command: 'ssh', args: [...SessionArguments, '--', target, command] });
  }

  upload(target: string, localPath: string, remotePath: string) {
    return this.processes.run({
      command: 'scp',
      args: ['-q', ...ConnectionArguments, '--', localPath, `${target}:${remotePath}`],
    });
  }
}
