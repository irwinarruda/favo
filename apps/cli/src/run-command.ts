import { adoptAccount } from '@favo/contracts/rpc/accounts/adopt-account';
import { createAccount } from '@favo/contracts/rpc/accounts/create-account';
import { listAccounts } from '@favo/contracts/rpc/accounts/list-accounts';
import { removeAccount } from '@favo/contracts/rpc/accounts/remove-account';
import { renameAccount } from '@favo/contracts/rpc/accounts/rename-account';
import type { RpcClient } from '@favo/contracts/rpc/client';
import { openDesktopApp } from '@favo/contracts/rpc/desktop/open-desktop-app';
import { addMachine } from '@favo/contracts/rpc/machines/add-machine';
import { discoverMachines } from '@favo/contracts/rpc/machines/discover-machines';
import { getMachineStatus, type MachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { installMachine } from '@favo/contracts/rpc/machines/install-machine';
import { listMachines } from '@favo/contracts/rpc/machines/list-machines';
import { removeMachine } from '@favo/contracts/rpc/machines/remove-machine';
import { getSeatStatus } from '@favo/contracts/rpc/seats/get-seat-status';
import { inspectSeat } from '@favo/contracts/rpc/seats/inspect-seat';
import { provisionSeat } from '@favo/contracts/rpc/seats/provision-seat';
import { readUsage } from '@favo/contracts/rpc/seats/read-usage';
import { repairSeats } from '@favo/contracts/rpc/seats/repair-seats';
import { planTerminal } from '@favo/contracts/rpc/terminal/plan-terminal';
import { listThemes } from '@favo/contracts/rpc/themes/list-themes';
import { selectTheme } from '@favo/contracts/rpc/themes/select-theme';
import { LoginState } from '@favo/contracts/rpc/views';
import { FavoVersion } from '@favo/contracts/version';
import { PersonalAccount } from '@favo/domain/accounts/account';
import { DesktopOpening } from '@favo/domain/desktop/desktop-app';
import { isOlderFavoError, type Machine, MachineState } from '@favo/domain/machines/machine';
import { Providers } from '@favo/domain/providers/provider';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { TerminalAction, type TerminalPlan } from '@favo/domain/terminal/terminal-plan';
import { ThemeSource } from '@favo/domain/themes/theme';
import { UsageBarPart, usageHeadlineOf, usageRowOf } from '@favo/domain/usage/usage-bar';
import { collectUsagePools, type UsagePool, type UsagePoolColumn } from '@favo/domain/usage/usage-pool';
import { HelpText } from '@/help-text';
import type { Paint } from '@/paint';
import { type Command, CommandKind } from '@/parse-command';

const UsageBarWidth = 20;
const UsageLabelWidth = 16;

export type CommandContext = {
  client: RpcClient;
  paint: Paint;
  print(line: string): void;
  runPlan(plan: TerminalPlan): Promise<number>;
};

export async function runCommand(parsed: Command, context: CommandContext) {
  const { client, print } = context;
  const command = await withStoredAccount(parsed, client);
  const { machineId, account, provider, args, isJson } = command;
  const options = { machineId };
  switch (command.kind) {
    case CommandKind.help:
      print(HelpText);
      return 0;
    case CommandKind.version:
      print(FavoVersion);
      return 0;
    case CommandKind.launch:
      return runPlanned(context, {
        ...seatOf(command),
        action: TerminalAction.launch,
        args,
        machineId,
        directory: command.directory,
      });
    case CommandKind.login:
      return runPlanned(context, { ...seatOf(command), action: TerminalAction.login, args: [], machineId });
    case CommandKind.logout:
      return runPlanned(context, { ...seatOf(command), action: TerminalAction.logout, args: [], machineId });
    case CommandKind.list:
      await printFleet(context, isJson);
      return 0;
    case CommandKind.usage:
      return printUsage(context, command);
    case CommandKind.add:
      await client.call(createAccount, { name: account! }, options);
      print(`${context.paint.accent('⬢')} ${account} is ready. Sign in with: favo login ${account} claude`);
      return 0;
    case CommandKind.rename: {
      const { displayName } = await client.call(renameAccount, { name: account!, newName: command.name! }, options);
      print(`${context.paint.accent('⬢')} ${parsed.account} is now ${displayName}. Its folder stayed where it was.`);
      return 0;
    }
    case CommandKind.remove: {
      const { trashedTo } = await client.call(removeAccount, { name: account! }, options);
      print(`Moved to ${trashedTo}. Its logins stay there, still signed in, until you delete that folder.`);
      return 0;
    }
    case CommandKind.adopt:
      await client.call(adoptAccount, { name: account!, provider: provider!, from: command.from! }, options);
      print(`${context.paint.accent('⬢')} ${command.from} now lives in ${account}. Sign in again to use it.`);
      return 0;
    case CommandKind.path: {
      await client.call(provisionSeat, seatOf(command), options);
      const accounts = await client.call(listAccounts, {}, options);
      const seat = accounts
        .find(({ name }) => name === account)
        ?.seats.find((candidate) => candidate.provider === provider);
      print(seat?.path ?? '');
      return seat ? 0 : 1;
    }
    case CommandKind.app:
      return openApp(context, parsed, command);
    case CommandKind.sync: {
      const repairs = await client.call(repairSeats, { account }, options);
      if (isJson) print(JSON.stringify(repairs, undefined, 2));
      else for (const repair of repairs) printRepair(context, repair);
      if (!isJson && repairs.length === 0) print('Nothing to repair.');
      return 0;
    }
    case CommandKind.inspect: {
      const inspection = await client.call(inspectSeat, seatOf(command), options);
      if (isJson) print(JSON.stringify(inspection, undefined, 2));
      else {
        for (const item of inspection.items) print(`  ${item.state.padEnd(10)} ${item.name}`);
        print(context.paint.dim(`  private    ${inspection.privateItems.join(', ')}`));
        if (inspection.unclassified.length > 0) {
          print(context.paint.dim(`  unclassified, kept private: ${inspection.unclassified.join(', ')}`));
        }
      }
      return 0;
    }
    case CommandKind.theme:
      await runTheme(context, command);
      return 0;
    case CommandKind.machineList: {
      const machines = await client.call(listMachines, {});
      const statuses = await Promise.all(machines.map(({ id }) => client.call(getMachineStatus, { id })));
      if (isJson)
        print(
          JSON.stringify(
            machines.map((machine, index) => ({ ...machine, ...statuses[index] })),
            undefined,
            2
          )
        );
      else {
        machines.forEach((machine, index) => {
          print(
            `${machine.name.padEnd(20)} ${(machine.target ?? 'this machine').padEnd(28)} ${stateOf(statuses[index]!)}`
          );
        });
      }
      return 0;
    }
    case CommandKind.machineDiscover: {
      const found = await client.call(discoverMachines, {});
      if (isJson) print(JSON.stringify(found, undefined, 2));
      else for (const machine of found) print(`${machine.name.padEnd(24)} ${machine.source}`);
      if (!isJson && found.length === 0) print('Nothing new on ssh or Tailscale.');
      return 0;
    }
    case CommandKind.machineAdd: {
      const machine = await client.call(addMachine, { target: command.target!, name: command.name });
      print(`${context.paint.accent('⬢')} ${machine.name} joined. Installing favo there...`);
      const { version } = await client.call(installMachine, { id: machine.id });
      print(`${context.paint.accent('⬢')} favo ${version} is running on ${machine.name}.`);
      return 0;
    }
    case CommandKind.machineRemove:
      await client.call(removeMachine, { id: command.target! });
      print(`Forgot ${command.target}. favo stays installed there.`);
      return 0;
    case CommandKind.machineInstall: {
      print(`Installing favo on ${command.target}...`);
      const { version } = await client.call(installMachine, { id: command.target! });
      print(`${context.paint.accent('⬢')} favo ${version} is running on ${command.target}.`);
      return 0;
    }
    case CommandKind.machineUpdate:
      return updateMachines(context);
    default:
      return 1;
  }
}

async function openApp(context: CommandContext, parsed: Command, command: Command) {
  const { client, print, paint } = context;
  const seat = seatOf(command);
  const { opening, label } = await client.call(openDesktopApp, { ...seat, canClose: command.canClose ?? false });
  if (opening === DesktopOpening.stillOpen) {
    const { executable } = Providers[seat.provider];
    print(`${label} is open. To close it and reopen: favo app ${parsed.account} ${executable} --close`);
    return 1;
  }
  print(`${paint.accent('⬢')} ${label} is opening as ${parsed.account}.`);
  return 0;
}

function stateOf(status: MachineStatus) {
  return status.isBehind ? `${status.state} · older favo ${status.version}` : status.state;
}

async function updateMachines(context: CommandContext) {
  const { client, print, paint } = context;
  const machines = await client.call(listMachines, {});
  const statuses = await Promise.all(machines.map(({ id }) => client.call(getMachineStatus, { id })));
  const behind = machines.filter(
    (_, index) => statuses[index]!.isBehind || statuses[index]!.state === MachineState.outdated
  );
  if (behind.length === 0) {
    print(`Every machine runs favo ${FavoVersion}.`);
    return 0;
  }
  let exitCode = 0;
  for (const machine of behind) {
    try {
      print(`Updating favo on ${machine.name}...`);
      const { version } = await client.call(installMachine, { id: machine.id });
      print(`${paint.accent('⬢')} favo ${version} is running on ${machine.name}.`);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      print(`${machine.name}: ${error.message}`);
      exitCode = 1;
    }
  }
  return exitCode;
}

function seatOf(command: Command) {
  return { account: command.account!, provider: command.provider! };
}

async function withStoredAccount(command: Command, client: RpcClient) {
  const { account, kind, machineId } = command;
  if (!account || account === PersonalAccount || kind === CommandKind.add) return command;
  const accounts = await client.call(listAccounts, {}, { machineId });
  const found = accounts.find(({ displayName }) => displayName === account);
  return found ? { ...command, account: found.name } : command;
}

async function runPlanned(context: CommandContext, params: Parameters<typeof planFor>[1]) {
  return context.runPlan(await planFor(context.client, params));
}

function planFor(
  client: RpcClient,
  params: {
    account: string;
    provider: Command['provider'] & string;
    action: TerminalAction;
    args: string[];
    machineId?: string;
    directory?: string;
  }
) {
  return client.call(planTerminal, params);
}

function printRepair(
  context: CommandContext,
  repair: { account: string; provider: string; linked: string[]; problems: { name: string; state: string }[] }
) {
  const { paint, print } = context;
  const summary = repair.linked.length > 0 ? `linked ${repair.linked.join(', ')}` : 'ok';
  print(`${paint.accent('⬢')} ${repair.account} ${repair.provider}: ${summary}`);
  for (const problem of repair.problems) print(`  ${problem.state}: ${problem.name} (left untouched)`);
}

async function runTheme(context: CommandContext, command: Command) {
  const { client, print, paint } = context;
  if (command.target) {
    await client.call(selectTheme, { id: command.target });
    print(`${paint.accent('⬢')} ${command.target} it is.`);
    return;
  }
  const { activeId, themes, problems } = await client.call(listThemes, {});
  if (command.isJson) {
    print(JSON.stringify({ activeId, themes, problems }, undefined, 2));
    return;
  }
  for (const theme of themes) {
    const swatches = [theme.colors.accent, theme.colors.accentBright, theme.colors.success, theme.colors.danger];
    const marks = swatches.map((color) => paint.color(color, '■')).join(' ');
    const source = theme.source === ThemeSource.custom ? paint.dim(' custom') : '';
    print(`${theme.id === activeId ? paint.accent('▸') : ' '} ${theme.id.padEnd(30)} ${marks}${source}`);
  }
  for (const problem of problems) print(`${problem.file}: ${problem.message}`);
}

async function printFleet(context: CommandContext, isJson: boolean) {
  const { client, print, paint } = context;
  const machines = await client.call(listMachines, {});
  const report = await Promise.all(
    machines.map(async (machine) => {
      const status = await client.call(getMachineStatus, { id: machine.id });
      if (status.state !== MachineState.online) return { machine, status, accounts: [] };
      return { machine, status, ...(await accountsWithLogins(client, machine)) };
    })
  );
  if (isJson) {
    print(JSON.stringify(report, undefined, 2));
    return;
  }
  for (const { machine, status, accounts, problem } of report) {
    const where = machine.isLocal ? 'this machine' : machine.target;
    const facts = [where, stateOf(status), status.directory].filter(Boolean).join(' · ');
    print(`${paint.bold(machine.name)} ${paint.dim(facts)}`);
    if (problem) print(`  ${problem}`);
    for (const account of accounts) {
      print(`  ${paint.accent(account.displayName)}`);
      for (const seat of account.seats) {
        const isIn = seat.status.login === LoginState.signedIn;
        const mark = isIn ? paint.accent('⬢') : paint.dim('⬡');
        const label = Providers[seat.provider].executable.padEnd(9);
        const detail = [seat.status.identity, seat.status.plan].filter(Boolean).join(' · ');
        print(`    ${mark} ${label} ${detail || paint.dim(loginLabel(seat.status.login))}`);
      }
    }
  }
}

async function printUsage(context: CommandContext, { machineId, isJson }: Command) {
  const { client, print } = context;
  const machines = await client.call(listMachines, {});
  const chosen = machines.filter(({ id }) => machineId === undefined || id === machineId);
  assertDomain(chosen.length > 0, DomainErrorCode.machineNotFound, `No machine named "${machineId}".`);
  const report = await Promise.all(chosen.map((machine) => machineUsageOf(client, machine)));
  const exitCode = report.every(({ problem }) => problem !== undefined) ? 1 : 0;
  if (isJson) {
    print(JSON.stringify(report, undefined, 2));
    return exitCode;
  }
  const now = Date.now();
  const seats = report.flatMap(({ machine, seats }) =>
    seats.map((seat) => ({
      ...seat,
      key: `${machine.id}/${seat.account}/${seat.provider}`,
      machineName: machine.name,
    }))
  );
  const pools = collectUsagePools(seats, now);
  for (const pool of pools) printPool(context, pool, now);
  const problems = report.flatMap(({ machine, problem }) => (problem ? [`${machine.name}: ${problem}`] : []));
  for (const problem of problems) print(problem);
  if (pools.length === 0 && problems.length === 0) print('No signed in seat reports limits.');
  return exitCode;
}

async function machineUsageOf(client: RpcClient, machine: Machine) {
  try {
    return { machine, seats: await client.call(readUsage, {}, { machineId: machine.id }) };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { machine, seats: [], problem: isOlderFavoError(error) ? 'older favo' : error.message };
  }
}

function printPool({ print, paint }: CommandContext, pool: UsagePool, now: number) {
  if (pool.summary) {
    print(`${paint.bold(pool.label.padEnd(UsageLabelWidth))}${paint.dim(pool.summary)}`);
    return;
  }
  const nameWidth = Math.max(0, ...pool.seats.map(({ name }) => name.length));
  const context = { paint, nameWidth, showPercent: pool.seats.length > 1, now };
  print(paint.bold(pool.label));
  for (const window of pool.windows) {
    const { label, remaining, facts } = usageHeadlineOf(window);
    print('');
    const shownRemaining = window.isStale ? paint.dim(remaining) : paint.accent(remaining);
    print(`  ${label}${shownRemaining}${paint.dim(facts)}`);
    for (const column of window.columns) print(`    ${usageRowText(column, context)}`);
  }
  for (const { name, message } of pool.notices) print(paint.dim(`\n  ${name}: ${message}`));
  print('');
}

function usageRowText(
  { seat, member }: UsagePoolColumn,
  context: { paint: Paint; nameWidth: number; showPercent: boolean; now: number }
) {
  const { paint, nameWidth, showPercent, now } = context;
  const name = seat.name.padEnd(nameWidth);
  if (!member) return paint.dim(`${name}  not reported`);
  const { bar, percent, facts } = usageRowOf(member, UsageBarWidth, now);
  const barText = bar.map(({ part, text }) => {
    if (member.isStale || part === UsageBarPart.refill || part === UsageBarPart.track) return paint.dim(text);
    return part === UsageBarPart.left ? paint.accent(text) : text;
  });
  const shownPercent = showPercent ? ` ${percent}` : '';
  const row = `${shownPercent}  ${facts}`.trimEnd();
  return `${name}  ${barText.join('')}${member.isStale ? paint.dim(row) : row}`;
}

async function accountsWithLogins(client: RpcClient, machine: Machine) {
  try {
    const options = { machineId: machine.id };
    const listed = await client.call(listAccounts, {}, options);
    const accounts = await Promise.all(
      listed.map(async (account) => ({
        ...account,
        seats: await Promise.all(
          account.seats.map(async (seat) => {
            const params = { account: seat.account, provider: seat.provider };
            return { ...seat, status: await client.call(getSeatStatus, params, options) };
          })
        ),
      }))
    );
    return { accounts };
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    return { accounts: [], problem: error.message };
  }
}

function loginLabel(login: LoginState) {
  if (login === LoginState.notInstalled) return 'not installed';
  if (login === LoginState.unknown) return 'unknown';
  return login === LoginState.signedIn ? 'signed in' : 'signed out';
}
