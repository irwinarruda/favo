import { LoginState } from '@favo/contracts/rpc/views';
import { ProviderId } from '@favo/domain/providers/provider';
import { parseJson } from '@favo/domain/shared/parse-json';
import { z } from 'zod';
import {
  ProviderCli,
  type ProviderSession,
  type ThreadSearch,
  type UpdateSwitchSearch,
} from '@/modules/providers/gateways/provider-cli';
import { stripAnsi } from '@/modules/providers/utils/strip-ansi';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const StatusTimeoutMs = 15_000;
const StandaloneFlag = '--standalone';
const UpdateVariable = 'OPENCODE_DISABLE_AUTOUPDATE';
const ConfigFiles = ['config.json', 'opencode.json', 'opencode.jsonc'];
const OpencodeConfig = z.object({ update: z.unknown().optional(), autoupdate: z.unknown().optional() });
const OpencodeSession = z.object({ id: z.string(), directory: z.string(), updated: z.number() });

export class OpencodeProviderCli extends ProviderCli {
  readonly id = ProviderId.opencode;
  private readonly standaloneSupport = new Map<string, Promise<boolean>>();

  constructor(private readonly processes: ProcessRunner) {
    super();
  }

  async status(session: ProviderSession) {
    const result = await this.processes.run({
      command: session.binary,
      args: ['auth', 'list', ...(await this.isolationArguments(session))],
      env: session.env,
      timeoutMs: StatusTimeoutMs,
    });
    if (result.code !== 0) return { login: LoginState.unknown };
    const count = loginCountOf(stripAnsi(`${result.stdout}${result.stderr}`));
    if (count === 0) return { login: LoginState.signedOut };
    return { login: LoginState.signedIn, identity: count === 1 ? '1 login' : `${count} logins` };
  }

  loginArguments() {
    return ['auth', 'login'];
  }

  logoutArguments() {
    return ['auth', 'logout'];
  }

  override async isolationArguments(session: ProviderSession) {
    return (await this.supportsStandalone(session)) ? [StandaloneFlag] : [];
  }

  override async recentThreads({ session, directory }: ThreadSearch) {
    const result = await this.processes.run({
      command: session.binary,
      args: ['session', 'list', '--format', 'json', ...(await this.isolationArguments(session))],
      env: session.env,
      cwd: directory,
      timeoutMs: StatusTimeoutMs,
    });
    const sessions = z.array(OpencodeSession).safeParse(parseJson(result.stdout));
    if (!sessions.success) return [];
    return sessions.data.map(({ id, directory, updated }) => ({
      id,
      directory,
      updatedAt: new Date(updated).toISOString(),
    }));
  }

  override async updateSwitch({ env, configHome }: UpdateSwitchSearch, fileSystem: FileSystem) {
    if (['1', 'true'].includes(env[UpdateVariable]?.toLowerCase() ?? '')) return UpdateVariable;
    for (const file of ConfigFiles.toReversed()) {
      const path = `${configHome}/opencode/${file}`;
      const isOff = isUpdateOff(await fileSystem.readText(path));
      if (isOff !== undefined) return isOff ? path : undefined;
    }
    return undefined;
  }

  private supportsStandalone(session: ProviderSession) {
    const known = this.standaloneSupport.get(session.binary);
    if (known) return known;
    const support = this.processes
      .run({ command: session.binary, args: ['--help'], env: session.env, timeoutMs: StatusTimeoutMs })
      .then((result) => `${result.stdout}${result.stderr}`.includes(StandaloneFlag));
    this.standaloneSupport.set(session.binary, support);
    return support;
  }
}

function isUpdateOff(text?: string) {
  try {
    const config = OpencodeConfig.safeParse(Bun.JSONC.parse(text ?? '')).data;
    if (config?.update !== undefined) return config.update === 'disable';
    return config?.autoupdate === undefined ? undefined : config.autoupdate === false;
  } catch {
    return undefined;
  }
}

function loginCountOf(output: string) {
  const counted = /(\d+) credentials?/.exec(output);
  if (counted) return Number(counted[1]);
  return output.split('\n').filter((line) => /\bstored\b/.test(line)).length;
}
