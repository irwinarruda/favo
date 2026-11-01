import type { ProcessRunner } from '@/modules/system/gateways/process-runner';
import { ShellEnvironment } from '@/modules/system/gateways/shell-environment';

const Marker = '__FAVO_PATH__';
const PathProbe = `printf '${Marker}%s${Marker}' "$PATH"`;
const ProbeTimeoutMs = 10_000;

export class LoginShellEnvironment extends ShellEnvironment {
  private resolved?: Promise<string>;

  constructor(
    private readonly processes: ProcessRunner,
    private readonly shell: string,
    private readonly inheritedPath: string
  ) {
    super();
  }

  path() {
    this.resolved ??= this.probe();
    return this.resolved;
  }

  private async probe() {
    const result = await this.processes.run({
      command: this.shell,
      args: ['-ilc', PathProbe],
      timeoutMs: ProbeTimeoutMs,
    });
    const [, path] = result.stdout.split(Marker);
    return path || this.inheritedPath;
  }
}
