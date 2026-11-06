import { refreshHooks } from '@favo/contracts/rpc/hooks/refresh-hooks';
import { getMachineStatus, type MachineStatus } from '@favo/contracts/rpc/machines/get-machine-status';
import { installMachine } from '@favo/contracts/rpc/machines/install-machine';
import { listMachines } from '@favo/contracts/rpc/machines/list-machines';
import { listProviderUpdates } from '@favo/contracts/rpc/updates/list-provider-updates';
import { listProviderVersions } from '@favo/contracts/rpc/updates/list-provider-versions';
import { planFavoUpdate } from '@favo/contracts/rpc/updates/plan-favo-update';
import { planUpdate } from '@favo/contracts/rpc/updates/plan-update';
import { recordProviderUpdate } from '@favo/contracts/rpc/updates/record-provider-update';
import type { ProviderUpdateView } from '@favo/contracts/rpc/views';
import { FavoVersion } from '@favo/contracts/version';
import { LocalMachineId, type Machine, MachineState } from '@favo/domain/machines/machine';
import { DomainError } from '@favo/domain/shared/domain-error';
import { updateArgumentsFor } from '@favo/domain/terminal/terminal-plan';
import { RunningReason, type UpdateOutcome, UpdateState } from '@favo/domain/updates/update-outcome';
import type { Command } from '@/parse-command';
import type { CommandContext } from '@/run-command';

const UnknownVersion = 'an unknown version';
const InterruptedCode = 130;
const UpdatesItselfReason = 'it updates itself, or through whatever installed it';

export async function runUpdate(command: Command, context: CommandContext) {
  try {
    const { machineId } = command;
    const isRemote = machineId !== undefined && machineId !== LocalMachineId;
    return await (isRemote ? updateMachine(command, context, machineId) : updateFromHere(command, context));
  } catch (error) {
    if (!command.isHeld || !(error instanceof DomainError)) throw error;
    context.print(`favo: ${error.message}`);
    return 1;
  } finally {
    if (command.isHeld) await context.hold();
  }
}

async function updateFromHere(command: Command, context: CommandContext) {
  const { client, print, paint } = context;
  const isHereOnly = command.machineId === LocalMachineId;
  const hasProviders = command.hasProviders === true;
  if (!command.isFavoSkipped) {
    const handedOver = await updateFavoHere(context, updateArgumentsFor({ isHereOnly, hasProviders }));
    if (handedOver !== undefined) return handedOver;
  }
  await client.call(refreshHooks, {});
  const fleet = isHereOnly ? { exitCode: 0, reachable: [] } : await updateMachines(context);
  if (!hasProviders) {
    printProvidersHint(context, command.machineId);
    return fleet.exitCode;
  }
  if (fleet.reachable.length > 0) print(paint.bold('\nProvider CLIs here'));
  const providers = await updateProviders(context, command);
  if (providers === InterruptedCode) return stopped(context);
  const elsewhere = await updateProvidersOn(context, fleet.reachable);
  if (elsewhere === InterruptedCode) return stopped(context);
  return Math.max(fleet.exitCode, providers, elsewhere);
}

function printProvidersHint({ print, paint }: CommandContext, machineId?: string) {
  const machine = machineId === undefined ? '' : ` --machine ${machineId}`;
  print(paint.dim(`The provider CLIs were left alone. To update them too: favo update --providers${machine}`));
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
      print(`${skippedReasonOf(machine.name, status)}. Skipped.`);
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

function skippedReasonOf(name: string, { message, state }: MachineStatus) {
  return message?.replace(/\.$/, '') ?? `${name}: ${state}`;
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

async function updateMachine(command: Command, context: CommandContext, id: string) {
  const { client, print } = context;
  const status = await client.call(getMachineStatus, { id });
  const isOlder = status.isBehind || status.state === MachineState.outdated;
  if (isOlder && !(await installFavoOn(context, { id, name: id }))) return 1;
  if (command.hasProviders) return context.runPlan(await client.call(planUpdate, { machineId: id }));
  if (!isOlder && status.state !== MachineState.online) {
    print(`${skippedReasonOf(id, status)}. Skipped.`);
    return 1;
  }
  if (!isOlder) print(`${id} runs favo ${status.version ?? FavoVersion} already.`);
  printProvidersHint(context, id);
  return 0;
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

async function updateProviders(context: CommandContext, command: Command) {
  const { client, print } = context;
  const { providers, isRunningIncluded = false } = command;
  const installed = await client.call(listProviderUpdates, {});
  const updates = installed.filter(({ provider }) => providers === undefined || providers.includes(provider));
  if (installed.length === 0) print('No provider CLI is installed here.');
  let exitCode = 0;
  for (const update of updates) {
    const code = await updateProvider(context, update, isRunningIncluded);
    if (code === InterruptedCode) return code;
    if (code !== 0) exitCode = 1;
  }
  return exitCode;
}

async function updateProvider(context: CommandContext, update: ProviderUpdateView, isRunningIncluded: boolean) {
  const { client, print, paint, ask } = context;
  const { provider, label, installedWith, otherCopies, heldBack, runningAccounts, steps } = update;
  const from = update.version;
  const version = from ?? UnknownVersion;
  async function record(outcome?: UpdateOutcome) {
    await client.call(recordProviderUpdate, { provider, outcome: outcome && { ...outcome, from } });
  }
  print(`${paint.bold(label)} ${version}, ${installedWith}`);
  for (const copy of otherCopies) print(paint.dim(`  another copy, left alone: ${copy}`));
  if (heldBack) {
    print(`  Left at ${version}: ${heldBack}.`);
    await record({ state: UpdateState.leftAlone, reason: heldBack });
    return 0;
  }
  if (steps.length === 0) {
    print(`  Left alone: ${UpdatesItselfReason}.`);
    await record({ state: UpdateState.leftAlone, reason: UpdatesItselfReason });
    return 0;
  }
  if (runningAccounts.length > 0) {
    const question = `${label} is running as ${runningAccounts.join(', ')}. Update it anyway?`;
    const isConfirmed = isRunningIncluded || (await ask(question));
    if (!isConfirmed) {
      print(`  Left at ${version}: ${RunningReason}.`);
      await record({ state: UpdateState.leftAlone, reason: RunningReason });
      return 0;
    }
  }
  await record({ state: UpdateState.updating });
  const code = await runSteps(context, update);
  if (code !== 0) {
    print(`  ${label} did not update (exit ${code}).`);
    const isStopped = code === InterruptedCode;
    await record(isStopped ? { state: UpdateState.stopped } : { state: UpdateState.failed, reason: `exit ${code}` });
    return code;
  }
  const [after] = await client.call(listProviderVersions, { provider });
  const current = after?.version ?? UnknownVersion;
  const change = current === version ? `is still ${current}` : `${version} → ${current}`;
  print(`${paint.accent('⬢')} ${label} ${change}`);
  await record();
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
