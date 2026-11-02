import { listHooks } from '@favo/contracts/rpc/hooks/list-hooks';
import type { PlanTerminalParams } from '@favo/contracts/rpc/terminal/plan-terminal';
import { assertAccountName, isPersonalAccount } from '@favo/domain/accounts/account';
import { LocalMachineId, type Machine, MachineState } from '@favo/domain/machines/machine';
import { Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { herdrReleaseStep } from '@favo/domain/terminal/herdr';
import {
  favoArgumentsFor,
  remoteTerminalPlan,
  TerminalAction,
  type TerminalPlan,
} from '@favo/domain/terminal/terminal-plan';
import { resumeArgumentsOf, threadEnvironment } from '@favo/domain/threads/thread';
import type { SeatsService } from '@/modules/accounts/services/seats.service';
import type { ThreadsService } from '@/modules/accounts/services/threads.service';
import type { DirectoriesService } from '@/modules/directories/services/directories.service';
import type { MachinesService } from '@/modules/machines/services/machines.service';
import type { ProviderRunRepository } from '@/modules/providers/repositories/provider-run.repository';
import type { ProvidersService } from '@/modules/providers/services/providers.service';
import type { ConfigRepository } from '@/modules/system/repositories/config.repository';

export class TerminalService {
  constructor(
    private readonly providers: ProvidersService,
    private readonly seats: SeatsService,
    private readonly threads: ThreadsService,
    private readonly machines: MachinesService,
    private readonly directories: DirectoriesService,
    private readonly config: ConfigRepository,
    private readonly runs: ProviderRunRepository,
    private readonly callerEnv: Record<string, string | undefined>,
    private readonly binary?: string
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
      if (params.action === TerminalAction.resume && state === MachineState.online) {
        await this.assertKeepsThreads(machine);
      }
      const provider = Providers[params.provider].executable;
      return remoteTerminalPlan(machine.target!, machine.system, favoArgumentsFor({ ...params, provider }));
    }
    return this.planLocal(params);
  }

  private async assertKeepsThreads(machine: Machine) {
    const request = { id: 0, method: listHooks.name, params: {}, machineId: machine.id };
    const reply = await this.machines.forward(request);
    assertDomain(
      reply.ok || reply.error.code !== DomainErrorCode.unknownMethod,
      DomainErrorCode.machineOutdated,
      `${machine.name} runs an older favo, which keeps no threads. To update it: favo machine install ${machine.name}`
    );
  }

  private async planLocal({ action, account, provider, args, directory, thread }: PlanTerminalParams) {
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
    const launchId = crypto.randomUUID();
    const folder = directory ? await this.directories.requireExisting(directory) : undefined;
    const target =
      action === TerminalAction.resume
        ? await this.threads.target(account, provider, thread, folder)
        : { id: undefined, directory: folder };
    return {
      cwd: target.directory,
      command: binary,
      args: [
        ...isolation,
        ...(await this.config.launchArgsOf(provider)),
        ...(target.id ? resumeArgumentsOf(Providers[provider], target.id) : []),
        ...args,
      ],
      env: {
        ...env,
        ...launch.env,
        ...threadEnvironment({ account, launchId, binary: this.binary }),
      },
      unsetEnv: launch.unsetEnv,
      afterExit: herdrReleaseStep(this.callerEnv, account, provider),
      pidFile: this.runs.pidFile(account, provider, launchId),
    };
  }
}
