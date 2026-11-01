import { PersonalAccount } from '@favo/domain/accounts/account';
import { findProvider, type ProviderId } from '@favo/domain/providers/provider';
import { assertDomain, DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import type { ValueOf } from '@favo/domain/shared/value-of';
import { decodeArguments, EncodedArgumentsFlag } from '@favo/domain/terminal/terminal-plan';

export const CommandKind = {
  tui: 'tui',
  help: 'help',
  version: 'version',
  serve: 'serve',
  launch: 'launch',
  login: 'login',
  logout: 'logout',
  list: 'list',
  add: 'add',
  rename: 'rename',
  remove: 'remove',
  adopt: 'adopt',
  path: 'path',
  sync: 'sync',
  inspect: 'inspect',
  theme: 'theme',
  machineList: 'machineList',
  machineAdd: 'machineAdd',
  machineRemove: 'machineRemove',
  machineInstall: 'machineInstall',
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
    case 'path':
      return { ...base, kind: CommandKind.path, ...seatOf(second, third, 'favo path <account> <provider>') };
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
    machine: undefined as string | undefined,
    name: undefined as string | undefined,
    directory: undefined as string | undefined,
  };
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index]!;
    if (word === '--json') flags.isJson = true;
    else if (word === '--help' || word === '-h') flags.isHelp = true;
    else if (word === '--version' || word === '-v') flags.isVersion = true;
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
