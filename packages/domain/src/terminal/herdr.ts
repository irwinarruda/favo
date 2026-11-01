import { isPersonalAccount } from '#domain/accounts/account';
import { type ProviderId, Providers } from '#domain/providers/provider';
import type { TerminalStep } from '#domain/terminal/terminal-plan';

export const HerdrSource = 'favo';

export type HerdrPane = { binary: string; paneId: string };
export type HerdrReport = { agent: string; threadId: string; resume: string[]; seq: number };

export function herdrSequenceOf(now: number) {
  return now * 1000;
}

export function herdrPaneOf(env: Record<string, string | undefined>): HerdrPane | undefined {
  const { HERDR_ENV, HERDR_BIN_PATH, HERDR_PANE_ID } = env;
  if (HERDR_ENV !== '1' || !HERDR_BIN_PATH || !HERDR_PANE_ID) return undefined;
  return { binary: HERDR_BIN_PATH, paneId: HERDR_PANE_ID };
}

export function herdrAgentOf(account: string, provider: ProviderId) {
  return isPersonalAccount(account) ? undefined : Providers[provider].herdrAgent;
}

export function herdrResumeCommand(account: string, provider: ProviderId, threadId: string) {
  return ['favo', 'resume', account, Providers[provider].executable, threadId];
}

export function hookReportArguments(provider: ProviderId, threadId: string) {
  return ['hook', Providers[provider].executable, '--report', threadId];
}

export function herdrReportArguments(pane: HerdrPane, report: HerdrReport) {
  const { agent, threadId, resume, seq } = report;
  return [
    'pane',
    'report-agent-session',
    pane.paneId,
    '--source',
    HerdrSource,
    '--agent',
    agent,
    '--agent-session-id',
    threadId,
    '--seq',
    String(seq),
    '--',
    ...resume,
  ];
}

export function herdrReleaseStep(
  env: Record<string, string | undefined>,
  account: string,
  provider: ProviderId
): TerminalStep | undefined {
  const pane = herdrPaneOf(env);
  const agent = herdrAgentOf(account, provider);
  if (!pane || !agent) return undefined;
  const args = ['pane', 'release-agent', pane.paneId, '--source', HerdrSource, '--agent', agent];
  return { command: pane.binary, args, stampFlag: '--seq' };
}
