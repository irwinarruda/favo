import { rm } from 'node:fs/promises';
import { mergeEnvironment } from '@favo/domain/shared/environment';
import { herdrSequenceOf } from '@favo/domain/terminal/herdr';
import { spawnCommandOf, type TerminalPlan, type TerminalStep } from '@favo/domain/terminal/terminal-plan';

const AfterExitTimeoutMs = 1_000;

export async function runTerminalPlan(plan: TerminalPlan, baseEnv: Record<string, string | undefined>) {
  const isCaseInsensitive = process.platform === 'win32';
  const child = Bun.spawn(spawnCommandOf(plan.command, plan.args), {
    cwd: plan.cwd,
    env: mergeEnvironment({ base: baseEnv, overrides: plan.env, unset: plan.unsetEnv, isCaseInsensitive }),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const ignoreSignal = () => {};
  process.on('SIGINT', ignoreSignal);
  if (plan.pidFile) await Bun.write(plan.pidFile, String(child.pid)).catch(() => {});
  const code = await child.exited;
  process.off('SIGINT', ignoreSignal);
  if (plan.pidFile) await rm(plan.pidFile, { force: true }).catch(() => {});
  if (plan.afterExit) await runAfterExit(plan.afterExit);
  return code;
}

async function runAfterExit({ command, args, stampFlag }: TerminalStep) {
  try {
    const stamp = stampFlag ? [stampFlag, String(herdrSequenceOf(Date.now()))] : [];
    const step = Bun.spawn([command, ...args, ...stamp], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    const timer = setTimeout(() => step.kill(), AfterExitTimeoutMs);
    await step.exited;
    clearTimeout(timer);
  } catch {}
}
