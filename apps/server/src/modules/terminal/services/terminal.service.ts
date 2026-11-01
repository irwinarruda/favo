import type { PlanTerminalParams } from '@favo/contracts/rpc/terminal/plan-terminal';
import { assertAccountName, isPersonalAccount } from '@favo/domain/accounts/account';
import { LocalMachineId, MachineState } from '@favo/domain/machines/machine';
import { Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import {
  favoArgumentsFor,
  remoteTerminalPlan,
  TerminalAction,
  type TerminalPlan,
} from '@favo/domain/terminal/terminal-plan';
import type { SeatsService } from '@/modules/accounts/services/seats.service';
import type { DirectoriesService } from '@/modules/directories/services/directories.service';
import type { MachinesService } from '@/modules/machines/services/machines.service';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { ConfigRepository } from '@/modules/system/repositories/config.repository';

export class TerminalService {
  constructor(
    private readonly providers: ProvidersService,
    private readonly seats: SeatsService,
    private readonly machines: MachinesService,
    private readonly directories: DirectoriesService,
    private readonly config: ConfigRepository,
    private readonly callerEnv: Record<string, string | undefined>
  ) {}

  async plan(params: PlanTerminalParams): Promise<TerminalPlan> {
    if (params.machineId !== undefined && params.machineId !== LocalMachineId) {
      if (!isPersonalAccount(params.account)) assertAccountName(params.account);
      const machine = await this.machines.requireRemote(params.machineId);
      const { state } = await this.machines.status(machine.id);
      assertDomain(
        state !== MachineState.outdated,
        DomainErrorCode.machineOutdated,
        `${machine.name} runs an older favo. To update it: favo machine install ${machine.name}`
      );
      const provider = Providers[params.provider].executable;
      return remoteTerminalPlan(machine.target!, machine.system, favoArgumentsFor({ ...params, provider }));
    }
    return this.planLocal(params);
  }

  private async planLocal({ action, account, provider, args, directory }: PlanTerminalParams) {
    const binary = await this.providers.requireBinary(provider);
    await this.seats.reconcile(account, provider);
    const cli = this.providers.cliOf(provider);
    const env = await this.providers.environmentOf(account, provider);
    const isolation = await this.providers.isolationArgumentsOf(account, provider);
    if (action === TerminalAction.login) {
      const loginArguments = cli.loginArguments({ isOverSsh: this.callerEnv.SSH_CONNECTION !== undefined });
      return { command: binary, args: [...loginArguments, ...isolation], env, unsetEnv: [] };
    }
    if (action === TerminalAction.logout) {
      const logoutArguments = cli.logoutArguments();
      assertDomain(
        logoutArguments,
        DomainErrorCode.logoutUnsupported,
        `${Providers[provider].label} has no sign-out command.`
      );
      return { command: binary, args: [...logoutArguments, ...isolation], env, unsetEnv: [] };
    }
    const launch = cli.launchEnvironment(this.callerEnv);
    const cwd = directory ? await this.directories.requireExisting(directory) : undefined;
    return {
      cwd,
      command: binary,
      args: [...isolation, ...(await this.config.launchArgsOf(provider)), ...args],
      env: { ...env, ...launch.env },
      unsetEnv: launch.unsetEnv,
    };
  }
}
