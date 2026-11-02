import { UpdateVariables } from '@favo/domain/providers/provider';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';
import { ShellEnvironment } from '@/modules/system/gateways/shell-environment';

const Marker = '__FAVO_PATH__';
const ProbedVariables = ['PATH', ...UpdateVariables];
const ProbeTimeoutMs = 10_000;

export const ShellProbe = `printf '${Marker}%s' ${ProbedVariables.map((name) => `"$${name}"`).join(' ')}; printf '${Marker}'`;

export class LoginShellEnvironment extends ShellEnvironment {
  private resolved?: Promise<Record<string, string>>;

  constructor(
    private readonly processes: ProcessRunner,
    private readonly shell: string,
    private readonly inheritedPath: string
  ) {
    super();
  }

  async path() {
    return (await this.probed()).PATH ?? this.inheritedPath;
  }

  override async variables() {
    const { PATH: _path, ...variables } = await this.probed();
    return variables;
  }

  private probed() {
    this.resolved ??= this.probe();
    return this.resolved;
  }

  private async probe() {
    const result = await this.processes.run({
      command: this.shell,
      args: ['-ilc', ShellProbe],
      timeoutMs: ProbeTimeoutMs,
    });
    const [, ...values] = result.stdout.split(Marker);
    const pairs = ProbedVariables.map((name, index) => [name, values[index]]);
    return Object.fromEntries(pairs.filter(([, value]) => value)) as Record<string, string>;
  }
}
