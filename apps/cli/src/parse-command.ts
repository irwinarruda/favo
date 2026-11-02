import { PersonalAccount } from '@favo/domain/accounts/account';
import { LocalMachineId } from '@favo/domain/machines/machine';
import { findProvider, type ProviderId } from '@favo/domain/providers/provider';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import type { ValueOf } from '@favo/domain/shared/value-of';
import { decodeArguments, EncodedArgumentsFlag, HoldFlag, SkipFavoFlag } from '@favo/domain/terminal/terminal-plan';

export const CommandKind = {
  tui: 'tui',
  help: 'help',
  version: 'version',
  serve: 'serve',
  launch: 'launch',
  login: 'login',
  logout: 'logout',
  resume: 'resume',
  threads: 'threads',
  list: 'list',
  usage: 'usage',
  add: 'add',
  rename: 'rename',
  remove: 'remove',
  adopt: 'adopt',
  path: 'path',
  app: 'app',
  sync: 'sync',
  inspect: 'inspect',
  theme: 'theme',
  update: 'update',
  hooksStatus: 'hooksStatus',
  hooksInstall: 'hooksInstall',
  hooksUninstall: 'hooksUninstall',
  machineList: 'machineList',
  machineAdd: 'machineAdd',
  machineRemove: 'machineRemove',
  machineInstall: 'machineInstall',
  machineUpdate: 'machineUpdate',
  machineDiscover: 'machineDiscover',
} as const;
export type CommandKind = ValueOf<typeof CommandKind>;

export type Command = {
  kind: CommandKind;
  machineId?: string;
  isJson: boolean;
  account?: string;
  provider?: ProviderId;
  args: string[];
  from?: string;
  target?: string;
  name?: string;
  directory?: string;
  canClose?: boolean;
  isFavoSkipped?: boolean;
  isHeld?: boolean;
};

export function parseCommand(rawArgv: string[]): Command {
  const argv = decodedArgv(rawArgv);
  const separator = argv.indexOf('--');
  const passthrough = separator >= 0 ? argv.slice(separator + 1) : [];
  const { words, flags } = readFlags(separator >= 0 ? argv.slice(0, separator) : argv);
  const base = { isJson: flags.isJson, machineId: flags.machine, directory: flags.directory, args: passthrough };
  const [first, second, third, fourth] = words;
  if (flags.isVersion) return { ...base, kind: CommandKind.version };
  if (flags.isHelp || first === 'help') return { ...base, kind: CommandKind.help };
  if (first === undefined) return { ...base, kind: CommandKind.tui };
  const provider = findProvider(first);
  if (provider) return { ...base, kind: CommandKind.launch, provider: provider.id, account: second ?? PersonalAccount };
  switch (first) {
    case 'serve':
      return { ...base, kind: CommandKind.serve };
    case 'list':
    case 'ls':
      return { ...base, kind: CommandKind.list };
    case 'usage':
      return { ...base, kind: CommandKind.usage };
    case 'add':
      return { ...base, kind: CommandKind.add, account: required(second, 'favo add <account>') };
    case 'rename':
      return {
        ...base,
        kind: CommandKind.rename,
        account: required(second, 'favo rename <account> <new name>'),
        name: required(third, 'favo rename <account> <new name>'),
      };
    case 'rm':
    case 'remove':
      return { ...base, kind: CommandKind.remove, account: required(second, 'favo rm <account>') };
    case 'login':
      return { ...base, kind: CommandKind.login, ...seatOf(second, third, 'favo login <account> <provider>') };
    case 'logout':
      return { ...base, kind: CommandKind.logout, ...seatOf(second, third, 'favo logout <account> <provider>') };
    case 'resume':
      return {
        ...base,
        kind: CommandKind.resume,
        target: fourth,
        ...seatOf(second, third, 'favo resume <account> <provider> [thread]'),
      };
    case 'threads':
      return { ...base, kind: CommandKind.threads, ...seatOf(second, third, 'favo threads <account> <provider>') };
    case 'hooks':
      return parseHooks(base, second);
    case 'path':
      return { ...base, kind: CommandKind.path, ...seatOf(second, third, 'favo path <account> <provider>') };
    case 'app':
      assertDomain(
        flags.machine === undefined || flags.machine === LocalMachineId,
        DomainErrorCode.invalidParams,
        'favo app opens a window on this computer, so it takes no --machine.'
      );
      return {
        ...base,
        kind: CommandKind.app,
        canClose: flags.canClose,
        ...seatOf(second, third, 'favo app <account> <provider> [--close]'),
      };
    case 'inspect':
      return { ...base, kind: CommandKind.inspect, ...seatOf(second, third, 'favo inspect <account> <provider>') };
    case 'adopt':
      return {
        ...base,
        kind: CommandKind.adopt,
        ...seatOf(second, third, 'favo adopt <account> <provider> <folder>'),
        from: required(fourth, 'favo adopt <account> <provider> <folder>'),
      };
    case 'sync':
      return { ...base, kind: CommandKind.sync, account: second };
    case 'theme':
      return { ...base, kind: CommandKind.theme, target: second };
    case 'update':
      assertDomain(
        second === undefined,
        DomainErrorCode.invalidParams,
        'favo update takes no name. For one machine: favo update --machine <machine>'
      );
      return { ...base, kind: CommandKind.update, isFavoSkipped: flags.isFavoSkipped, isHeld: flags.isHeld };
    case 'machine':
      return parseMachine(base, flags.name, second, third);
    default:
      throw new DomainError(DomainErrorCode.invalidParams, `Unknown command "${first}". Try: favo --help`);
  }
}

function decodedArgv(argv: string[]) {
  if (argv[0] !== EncodedArgumentsFlag) return argv;
  assertDomain(argv.length === 2, DomainErrorCode.invalidParams, `Usage: favo ${EncodedArgumentsFlag} <base64url>`);
  return decodeArguments(argv[1]!);
}

function parseHooks(base: Omit<Command, 'kind'>, action?: string): Command {
  switch (action) {
    case undefined:
    case 'status':
      return { ...base, kind: CommandKind.hooksStatus };
    case 'install':
      return { ...base, kind: CommandKind.hooksInstall };
    case 'uninstall':
      return { ...base, kind: CommandKind.hooksUninstall };
    default:
      throw new DomainError(DomainErrorCode.invalidParams, `Unknown hooks command "${action}".`);
  }
}

function parseMachine(base: Omit<Command, 'kind'>, name: string | undefined, action?: string, value?: string): Command {
  switch (action) {
    case undefined:
    case 'list':
      return { ...base, kind: CommandKind.machineList };
    case 'add':
      return { ...base, kind: CommandKind.machineAdd, name, target: required(value, 'favo machine add <user@host>') };
    case 'rm':
    case 'remove':
      return { ...base, kind: CommandKind.machineRemove, target: required(value, 'favo machine rm <machine>') };
    case 'install':
      return { ...base, kind: CommandKind.machineInstall, target: required(value, 'favo machine install <machine>') };
    case 'update':
      return { ...base, kind: CommandKind.machineUpdate };
    case 'discover':
      return { ...base, kind: CommandKind.machineDiscover };
    default:
      throw new DomainError(DomainErrorCode.invalidParams, `Unknown machine command "${action}".`);
  }
}

function readFlags(argv: string[]) {
  const words: string[] = [];
  const flags = {
    isJson: false,
    isHelp: false,
    isVersion: false,
    canClose: false,
    isFavoSkipped: false,
    isHeld: false,
    machine: undefined as string | undefined,
    name: undefined as string | undefined,
    directory: undefined as string | undefined,
  };
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index]!;
    if (word === '--json') flags.isJson = true;
    else if (word === '--help' || word === '-h') flags.isHelp = true;
    else if (word === '--version' || word === '-v') flags.isVersion = true;
    else if (word === '--close') flags.canClose = true;
    else if (word === SkipFavoFlag) flags.isFavoSkipped = true;
    else if (word === HoldFlag) flags.isHeld = true;
    else if (word === '--stdio') continue;
    else if (word === '--machine' || word === '-m') flags.machine = required(argv[++index], '--machine <machine>');
    else if (word === '--name') flags.name = required(argv[++index], '--name <name>');
    else if (word === '--dir') flags.directory = required(argv[++index], '--dir <folder>');
    else if (word.startsWith('-')) throw new DomainError(DomainErrorCode.invalidParams, `Unknown flag "${word}".`);
    else words.push(word);
  }
  return { words, flags };
}

function seatOf(account: string | undefined, provider: string | undefined, usage: string) {
  const spec = findProvider(required(provider, usage));
  if (!spec) throw new DomainError(DomainErrorCode.unknownProvider, `Unknown provider "${provider}".`);
  return { account: required(account, usage), provider: spec.id };
}

function required(value: string | undefined, usage: string) {
  if (value === undefined) throw new DomainError(DomainErrorCode.invalidParams, `Usage: ${usage}`);
  return value;
}
