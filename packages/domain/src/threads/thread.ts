import { z } from 'zod';
import { isSameDirectory } from '#domain/directories/directory-input';
import type { ProviderSpec } from '#domain/providers/provider';
import { assertDomain, DomainErrorCode } from '#domain/shared/domain-error';

export const ThreadsPerFolder = 5;

const ThreadIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ThreadPosition = /^\d{1,3}$/;
const ShortIdLength = 8;
const FreshSource = 'startup';
const Minute = 60_000;
const Hour = 60 * Minute;
const Day = 24 * Hour;
const QuietSessionMs = Day;

export const Thread = z.object({
  id: z.string().regex(ThreadIdPattern),
  directory: z.string(),
  updatedAt: z.string(),
  transcript: z.string().optional(),
  launchId: z.string().optional(),
  ownerProcess: z.string().optional(),
});
export type Thread = z.infer<typeof Thread>;

const HookPayload = z.object({
  session_id: z.string().nullish(),
  conversationId: z.string().nullish(),
  transcript_path: z.string().nullish(),
  transcriptPath: z.string().nullish(),
  cwd: z.string().nullish(),
  source: z.string().nullish(),
  agent_id: z.string().nullish(),
});

export type ThreadEvent = { id: string; directory: string; transcript?: string; isFresh: boolean };

export function threadEventOf(payload: unknown, directory: string): ThreadEvent | undefined {
  const parsed = HookPayload.safeParse(payload);
  if (!parsed.success) return undefined;
  const { session_id, conversationId, transcript_path, transcriptPath, cwd, source, agent_id } = parsed.data;
  const id = session_id ?? conversationId;
  if (!id || agent_id || !ThreadIdPattern.test(id)) return undefined;
  return {
    id,
    directory: cwd ?? directory,
    transcript: transcript_path ?? transcriptPath ?? undefined,
    isFresh: !source || source === FreshSource,
  };
}

export function isNestedRun(
  threads: Thread[],
  isFresh: boolean,
  launchId: string | undefined,
  ownerProcess: string | undefined,
  isAlive: (ownerProcess: string) => boolean
) {
  if (!isFresh || launchId === undefined || ownerProcess === undefined) return false;
  return threads.some((thread) => {
    const other = thread.ownerProcess;
    return thread.launchId === launchId && other !== undefined && other !== ownerProcess && isAlive(other);
  });
}

export function threadEnvironment(input: { account: string; launchId: string; binary?: string }) {
  const { account, launchId, binary } = input;
  return { FAVO_ACCOUNT: account, FAVO_LAUNCH: launchId, ...(binary ? { FAVO_BIN: binary } : {}) };
}

export function resumeArgumentsOf(spec: ProviderSpec, id: string) {
  return [...spec.resumeArguments, id];
}

export function threadsToDrop(threads: Thread[], isResumable: (thread: Thread) => boolean, now: number) {
  const seen = new Map<string, number>();
  return newestFirst(threads).filter((thread) => {
    const hasMessages = isResumable(thread);
    if (!hasMessages && now - Date.parse(thread.updatedAt) < QuietSessionMs) return false;
    const key = `${hasMessages}:${thread.directory}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count > ThreadsPerFolder;
  });
}

export function orderedThreads<T extends { directory: string; updatedAt: string }>(threads: T[], directory: string) {
  const newest = newestFirst(threads);
  function isHere(thread: T) {
    return isSameDirectory(thread.directory, directory);
  }
  return [...newest.filter(isHere), ...newest.filter((thread) => !isHere(thread))];
}

export function chooseThread<T extends { id: string }>(ordered: T[], selector?: string) {
  if (selector === undefined) return ordered[0];
  const exact = ordered.find(({ id }) => id === selector);
  if (exact) return exact;
  if (ThreadPosition.test(selector)) return ordered[Number(selector) - 1];
  const matches = ordered.filter(({ id }) => id.includes(selector));
  assertDomain(matches.length < 2, DomainErrorCode.threadNotFound, `More than one thread matches "${selector}".`);
  return matches[0];
}

export function isRawThreadId(text: string) {
  return ThreadIdPattern.test(text) && !ThreadPosition.test(text);
}

export function shortThreadId(id: string) {
  return id.slice(-ShortIdLength);
}

export function threadAgeOf(updatedAt: string, now: number) {
  const age = now - Date.parse(updatedAt);
  if (age < Minute) return 'just now';
  if (age < Hour) return `${Math.floor(age / Minute)}m ago`;
  if (age < Day) return `${Math.floor(age / Hour)}h ago`;
  return `${Math.floor(age / Day)}d ago`;
}

function newestFirst<T extends { updatedAt: string }>(threads: T[]) {
  return threads.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
