import { refreshHooks } from '@favo/contracts/rpc/hooks/refresh-hooks';
import { getMachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { installMachine } from '@favo/contracts/rpc/machines/install-machine';
import { listMachines } from '@favo/contracts/rpc/machines/list-machines';
import { listProviderUpdates } from '@favo/contracts/rpc/updates/list-provider-updates';
import { planFavoUpdate } from '@favo/contracts/rpc/updates/plan-favo-update';
import { planUpdate } from '@favo/contracts/rpc/updates/plan-update';
import type { ProviderUpdateView } from '@favo/contracts/rpc/views';
import { FavoVersion } from '@favo/contracts/version';
import { LocalMachineId, type Machine, MachineState } from '@favo/domain/machines/machine';
import { DomainError } from '@favo/domain/shared/domain-error';
import { updateArgumentsFor } from '@favo/domain/terminal/terminal-plan';
import type { Command } from '@/parse-command';
import type { CommandContext } from '@/run-command';

const UnknownVersion = 'an unknown version';
const InterruptedCode = 130;

export async function runUpdate(command: Command, context: CommandContext) {
  try {
    const { machineId } = command;
    const isRemote = machineId !== undefined && machineId !== LocalMachineId;
    return await (isRemote ? updateMachine(context, machineId) : updateFromHere(command, context));
  } catch (error) {
    if (!command.isHeld || !(error instanceof DomainError)) throw error;
    context.print(`favo: ${error.message}`);
    return 1;
  } finally {
    if (command.isHeld) await context.hold();
  }
}

async function updateFromHere(command: Command, context: CommandContext) {
  const { client } = context;
  const isHereOnly = command.machineId === LocalMachineId;
  if (!command.isFavoSkipped) {
    const handedOver = await updateFavoHere(context, updateArgumentsFor({ isHereOnly }));
    if (handedOver !== undefined) return handedOver;
  }
  await client.call(refreshHooks, {});
  const fleet = isHereOnly ? { exitCode: 0, reachable: [] } : await updateMachines(context);
  if (fleet.reachable.length > 0) context.print(context.paint.bold('\nProvider CLIs here'));
  const providers = await updateProviders(context);
  if (providers === InterruptedCode) return stopped(context);
  const elsewhere = await updateProvidersOn(context, fleet.reachable);
  if (elsewhere === InterruptedCode) return stopped(context);
  return Math.max(fleet.exitCode, providers, elsewhere);
}

function stopped({ print }: CommandContext) {
  print('Stopped. Everything after this was left as it is.');
  return InterruptedCode;
}

async function updateFavoHere(context: CommandContext, restartArguments: string[]) {
  const { client, print, runPlan } = context;
  const { version, installedWith, heldBack, upgrade, restart } = await client.call(planFavoUpdate, {});
  if (!installedWith) {
    print(`favo ${version} did not come from Homebrew or npm, so it stays as it is here.`);
    return undefined;
  }
  print(`favo ${version}, ${installedWith}`);
  if (heldBack) {
    print(`favo stays on ${version}: ${heldBack}.`);
    return undefined;
  }
  const code = upgrade ? await runPlan(upgrade) : 1;
  if (code !== 0 || !restart) {
    print('favo did not update here, so nothing else was touched.');
    return 1;
  }
  return runPlan({ ...restart, args: [...restart.args, ...restartArguments] });
}

export async function updateMachines(context: CommandContext) {
  const { client, print } = context;
  const machines = await client.call(listMachines, {});
  const remotes = machines.filter(({ isLocal }) => !isLocal);
  const statuses = await Promise.all(remotes.map(({ id }) => client.call(getMachineStatus, { id })));
  const reachable: Machine[] = [];
  let exitCode = 0;
  for (const [index, machine] of remotes.entries()) {
    const status = statuses[index]!;
    const isBehind = status.isBehind || status.state === MachineState.outdated;
    if (!isBehind && status.state !== MachineState.online) {
      print(`${status.message?.replace(/\.$/, '') ?? `${machine.name}: ${status.state}`}. Skipped.`);
      continue;
    }
    if (!isBehind) {
      reachable.push(machine);
      continue;
    }
    if (await installFavoOn(context, machine)) reachable.push(machine);
    else exitCode = 1;
  }
  const isEveryMachineCurrent = statuses.every((status) => status.state === MachineState.online && !status.isBehind);
  if (isEveryMachineCurrent) print(`Every machine runs favo ${FavoVersion}.`);
  return { exitCode, reachable };
}

async function installFavoOn({ client, print, paint }: CommandContext, machine: { id: string; name: string }) {
  try {
    print(`Updating favo on ${machine.name}...`);
    const { version } = await client.call(installMachine, { id: machine.id });
    print(`${paint.accent('⬢')} favo ${version} is running on ${machine.name}.`);
    return true;
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    print(`${machine.name}: ${error.message}`);
    return false;
  }
}

async function updateMachine(context: CommandContext, id: string) {
  const { client } = context;
  const { state, isBehind } = await client.call(getMachineStatus, { id });
  const isCurrent = !isBehind && state !== MachineState.outdated;
  if (!isCurrent && !(await installFavoOn(context, { id, name: id }))) return 1;
  return context.runPlan(await client.call(planUpdate, { machineId: id }));
}

async function updateProvidersOn(context: CommandContext, machines: Machine[]) {
  const { client, print, paint, runPlan } = context;
  let exitCode = 0;
  for (const machine of machines) {
    try {
      print(paint.bold(`\nProvider CLIs on ${machine.name}`));
      const code = await runPlan(await client.call(planUpdate, { machineId: machine.id }));
      if (code === InterruptedCode) return code;
      if (code !== 0) exitCode = 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      print(`${machine.name}: ${error.message}`);
      exitCode = 1;
    }
  }
  return exitCode;
}

async function updateProviders(context: CommandContext) {
  const { client, print } = context;
  const updates = await client.call(listProviderUpdates, {});
  if (updates.length === 0) print('No provider CLI is installed here.');
  let exitCode = 0;
  for (const update of updates) {
    const code = await updateProvider(context, update);
    if (code === InterruptedCode) return code;
    if (code !== 0) exitCode = 1;
  }
  return exitCode;
}

async function updateProvider(context: CommandContext, update: ProviderUpdateView) {
  const { client, print, paint, ask } = context;
  const { provider, label, installedWith, otherCopies, heldBack, runningAccounts, steps } = update;
  const version = update.version ?? UnknownVersion;
  print(`${paint.bold(label)} ${version}, ${installedWith}`);
  for (const copy of otherCopies) print(paint.dim(`  another copy, left alone: ${copy}`));
  if (heldBack) {
    print(`  Left at ${version}: ${heldBack}.`);
    return 0;
  }
  if (steps.length === 0) {
    print('  Left alone: it updates itself, or through whatever installed it.');
    return 0;
  }
  if (runningAccounts.length > 0) {
    const isConfirmed = await ask(`${label} is running as ${runningAccounts.join(', ')}. Update it anyway?`);
    if (!isConfirmed) {
      print(`  Left at ${version}: it is running.`);
      return 0;
    }
  }
  const code = await runSteps(context, update);
  if (code !== 0) {
    print(`  ${label} did not update (exit ${code}).`);
    return code;
  }
  const [after] = await client.call(listProviderUpdates, { provider });
  const current = after?.version ?? UnknownVersion;
  const change = current === version ? `is still ${current}` : `${version} → ${current}`;
  print(`${paint.accent('⬢')} ${label} ${change}`);
  return 0;
}

async function runSteps({ print, runPlan }: CommandContext, { steps }: ProviderUpdateView) {
  let code = 1;
  for (const [index, step] of steps.entries()) {
    if (index > 0) print(`  That did not work, so favo is trying ${step.command}.`);
    code = await runPlan(step);
    if (code === 0 || code === InterruptedCode) break;
  }
  return code;
}
