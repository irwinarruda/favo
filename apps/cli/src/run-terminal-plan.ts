import { mergeEnvironment } from '@favo/domain/shared/environment';
import { spawnCommandOf, type TerminalPlan } from '@favo/domain/terminal/terminal-plan';

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
  const code = await child.exited;
  process.off('SIGINT', ignoreSignal);
  return code;
}
