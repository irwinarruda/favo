import { LoginState } from '@favo/contracts/rpc/views';
import { isSameDirectory } from '@favo/domain/directories/directory-input';
import { ProviderId } from '@favo/domain/providers/provider';
import { NoSubscriptionLimitsMessage, UsageUnavailableReason, unavailableUsage } from '@favo/domain/usage/seat-usage';
import {
  type LoginContext,
  ProviderCli,
  type ProviderLogin,
  type ProviderSession,
  type ThreadSearch,
} from '@/modules/providers/gateways/provider-cli';
import { RolloutHeadBytes, rolloutThreadOf } from '@/modules/providers/utils/codex-rollout';
import { type CodexRateLimits, codexUsageOf } from '@/modules/providers/utils/codex-usage';
import type { FileSystem } from '@/modules/system/gateways/file-system';
import type { ProcessRunner } from '@/modules/system/gateways/process-runner';

const ApiKeyAccount = 'apiKey';
const QuestionId = 2;
const ConversationTimeoutMs = 8_000;
const StatusTimeoutMs = 10_000;
const DateFolderLevels = 3;
const UsageTimeoutMs = 10_000;
const NewestRollouts = 40;
const Greeting = [
  { id: 1, method: 'initialize', params: { clientInfo: { name: 'favo', version: '0' } } },
  { method: 'initialized' },
];

export class CodexProviderCli extends ProviderCli {
  readonly id = ProviderId.codex;

  constructor(
    private readonly processes: ProcessRunner,
    private readonly usageTimeoutMs = UsageTimeoutMs
  ) {
    super();
  }

  async status(session: ProviderSession) {
    return (await this.readAccount(session)) ?? this.readLoginStatus(session);
  }

  loginArguments({ isOverSsh }: LoginContext) {
    return isOverSsh ? ['login', '--device-auth'] : ['login'];
  }

  logoutArguments() {
    return ['logout'];
  }

  override usageEnvironment() {
    return { env: {}, unsetEnv: ['CODEX_HOME'] };
  }

  override async recentThreads({ seatHome, directory }: ThreadSearch, fileSystem: FileSystem) {
    const rollouts = await newestFiles(`${seatHome}/sessions`, fileSystem);
    const heads = await Promise.all(rollouts.map((path) => fileSystem.readHead(path, RolloutHeadBytes)));
    return heads.flatMap((head, index) => {
      const thread = rolloutThreadOf(rollouts[index]!, head);
      return thread && isSameDirectory(thread.directory, directory) ? [thread] : [];
    });
  }

  override async usage(session: ProviderSession, checkedAt: string) {
    const { binary, env, cwd } = session;
    const server = this.processes.open({ command: binary, args: ['app-server'], env, cwd });
    const question = { id: QuestionId, method: 'account/rateLimits/read' };
    const answer = await this.ask(server, [...Greeting, question], usageAnswerOf, this.usageTimeoutMs);
    if (!answer) return unavailableUsage(checkedAt, UsageUnavailableReason.probeFailed, 'Codex did not answer.');
    if (answer.error) return this.refusedUsage(session, checkedAt);
    return codexUsageOf(answer.result, checkedAt);
  }

  private async refusedUsage(session: ProviderSession, checkedAt: string) {
    const login = await this.readAccount(session);
    if (login?.identity === ApiKeyAccount) {
      return unavailableUsage(checkedAt, UsageUnavailableReason.unsupported, NoSubscriptionLimitsMessage);
    }
    return unavailableUsage(checkedAt, UsageUnavailableReason.probeFailed, 'Codex could not read usage.');
  }

  private async readAccount(session: ProviderSession) {
    const server = this.processes.open({ command: session.binary, args: ['app-server'], env: session.env });
    const question = { id: QuestionId, method: 'account/read', params: { refreshToken: false } };
    return this.ask(server, [...Greeting, question], accountAnswerOf, ConversationTimeoutMs);
  }

  private async readLoginStatus(session: ProviderSession): Promise<ProviderLogin> {
    const result = await this.processes.run({
      command: session.binary,
      args: ['login', 'status'],
      env: session.env,
      timeoutMs: StatusTimeoutMs,
    });
    const output = `${result.stdout}${result.stderr}`;
    if (/not logged in/i.test(output)) return { login: LoginState.signedOut };
    if (/logged in/i.test(output)) return { login: LoginState.signedIn };
    return { login: LoginState.unknown };
  }
}

type AccountRead = { account?: { type?: string; email?: string; planType?: string } | null };
type AppServerMessage<Result> = { id?: number; result?: Result; error?: { message?: string } } | null;

function usageAnswerOf(message: AppServerMessage<CodexRateLimits>) {
  return message?.id === QuestionId ? message : undefined;
}

function accountAnswerOf(message: AppServerMessage<AccountRead>): ProviderLogin | undefined {
  if (message?.id !== QuestionId) return undefined;
  const account = message.result?.account;
  if (message.error) return { login: LoginState.signedOut, plan: 'login expired' };
  if (!account) return { login: LoginState.signedOut };
  return { login: LoginState.signedIn, identity: account.email ?? account.type, plan: account.planType };
}

async function newestFiles(root: string, fileSystem: FileSystem, depth = DateFolderLevels): Promise<string[]> {
  const names = (await fileSystem.list(root)).toSorted().toReversed();
  if (depth === 0) return names.map((name) => `${root}/${name}`);
  const found: string[] = [];
  for (const name of names) {
    if (found.length >= NewestRollouts) break;
    found.push(...(await newestFiles(`${root}/${name}`, fileSystem, depth - 1)));
  }
  return found.slice(0, NewestRollouts);
}
