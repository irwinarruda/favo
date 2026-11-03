import { z } from 'zod';
import { LocalMachineId, type RemoteSystem, remoteBinaryOf } from '#domain/machines/machine';
import { assertDomain, DomainError, DomainErrorCode } from '#domain/shared/domain-error';
import type { ValueOf } from '#domain/shared/value-of';

export const EncodedArgumentsFlag = '--argv-b64';
export const SkipFavoFlag = '--skip-favo';
export const HoldFlag = '--hold';

const EncodedArguments = z.array(z.string());
const Base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const CmdShim = /\.(?:cmd|bat)$/i;
const CmdUnsafeCharacter = /["&|<>^%!\r\n]/;

export const TerminalAction = {
  launch: 'launch',
  login: 'login',
  logout: 'logout',
  resume: 'resume',
} as const;
export type TerminalAction = ValueOf<typeof TerminalAction>;

export const TerminalStep = z.strictObject({
  command: z.string(),
  args: z.array(z.string()),
  stampFlag: z.string().optional(),
});
export type TerminalStep = z.infer<typeof TerminalStep>;

export const TerminalPlan = z.strictObject({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()),
  unsetEnv: z.array(z.string()),
  cwd: z.string().optional(),
  afterExit: TerminalStep.optional(),
  pidFile: z.string().optional(),
});
export type TerminalPlan = z.infer<typeof TerminalPlan>;

export function encodeArguments(args: string[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeArguments(encoded: string) {
  const parsed = EncodedArguments.safeParse(Base64UrlPattern.test(encoded) ? parseBase64Json(encoded) : undefined);
  assertDomain(
    parsed.success,
    DomainErrorCode.invalidParams,
    `${EncodedArgumentsFlag} takes the base64url of a JSON array of strings.`
  );
  return parsed.data;
}

function parseBase64Json(encoded: string) {
  try {
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

export function remoteTerminalPlan(target: string, system: RemoteSystem | undefined, favoArgs: string[]): TerminalPlan {
  const remoteCommand = `${remoteBinaryOf(system)} ${EncodedArgumentsFlag} ${encodeArguments(favoArgs)}`;
  return { command: 'ssh', args: ['-t', '--', target, remoteCommand], env: {}, unsetEnv: [] };
}

export function spawnCommandOf(command: string, args: string[]) {
  if (!CmdShim.test(command)) return [command, ...args];
  for (const argument of args) assertSafeForCmd(argument, command);
  return ['cmd.exe', '/d', '/c', command, ...args];
}

function assertSafeForCmd(argument: string, command: string) {
  const character = CmdUnsafeCharacter.exec(argument)?.[0];
  if (character === undefined) return;
  const named = character === '\r' || character === '\n' ? 'a line break' : character;
  const shim = command.split(/[\\/]/).at(-1);
  throw new DomainError(
    DomainErrorCode.unsafeArgument,
    `An argument contains ${named}. ${shim} runs through cmd.exe, which reads that as a command, not as text, so favo refused to start it.`
  );
}

export function updateArgumentsFor(input: { isHereOnly: boolean; isHeld?: boolean }) {
  const here = input.isHereOnly ? ['--machine', LocalMachineId] : [];
  return ['update', SkipFavoFlag, ...here, ...(input.isHeld ? [HoldFlag] : [])];
}

export function favoArgumentsFor(input: {
  action: TerminalAction;
  account: string;
  provider: string;
  args: string[];
  directory?: string;
  thread?: string;
}) {
  const { action, account, provider, args, directory, thread } = input;
  if (action === TerminalAction.login) return ['login', provider, account];
  if (action === TerminalAction.logout) return ['logout', provider, account];
  const directoryFlag = directory ? ['--dir', directory] : [];
  const providerArguments = args.length > 0 ? ['--', ...args] : [];
  if (action === TerminalAction.resume) {
    return [...directoryFlag, 'resume', provider, account, ...(thread ? [thread] : []), ...providerArguments];
  }
  return [...directoryFlag, provider, account, ...providerArguments];
}
