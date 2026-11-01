import { describe, expect, it } from 'bun:test';
import { Providers } from '#domain/providers/provider';
import {
  chooseThread,
  isNestedRun,
  isRawThreadId,
  orderedThreads,
  resumeArgumentsOf,
  shortThreadId,
  type Thread,
  threadAgeOf,
  threadEnvironment,
  threadEventOf,
  threadsToDrop,
} from '#domain/threads/thread';

function threadOf(id: string, overrides: Partial<Thread> = {}): Thread {
  return { id, directory: '/code/hive', updatedAt: '2026-11-01T12:00:00.000Z', ...overrides };
}

describe('what a provider tells favo', () => {
  it('reads a Claude Code or Codex session', () => {
    const payload = { session_id: 'abc-1', cwd: '/code', transcript_path: '/t/abc-1.jsonl', source: 'startup' };
    expect(threadEventOf(payload, '/elsewhere')).toEqual({
      id: 'abc-1',
      directory: '/code',
      transcript: '/t/abc-1.jsonl',
      isFresh: true,
    });
  });
  it('reads an Antigravity conversation, which names its fields differently', () => {
    const payload = { conversationId: 'conv-1', transcriptPath: '/t/conv-1' };
    expect(threadEventOf(payload, '/here')).toEqual({
      id: 'conv-1',
      directory: '/here',
      transcript: '/t/conv-1',
      isFresh: true,
    });
  });
  it('knows a thread changed inside a running provider', () => {
    expect(threadEventOf({ session_id: 'a', source: 'clear' }, '/here')?.isFresh).toBe(false);
    expect(threadEventOf({ session_id: 'a', source: 'resume' }, '/here')?.isFresh).toBe(false);
  });
  it('ignores a subagent, so it never replaces the real thread', () => {
    expect(threadEventOf({ session_id: 'a', agent_id: 'sub-1' }, '/here')).toBeUndefined();
  });
  it('refuses an id that could leave the threads folder', () => {
    expect(threadEventOf({ session_id: '../../evil' }, '/here')).toBeUndefined();
    expect(threadEventOf({ session_id: 'a/b' }, '/here')).toBeUndefined();
  });
  it('ignores anything that is not a session', () => {
    expect(threadEventOf(undefined, '/here')).toBeUndefined();
    expect(threadEventOf([], '/here')).toBeUndefined();
    expect(threadEventOf({ cwd: '/x' }, '/here')).toBeUndefined();
    expect(threadEventOf({ session_id: 7 }, '/here')).toBeUndefined();
  });
  it('accepts the nulls a provider may send, as nothing', () => {
    expect(threadEventOf({ session_id: 'a', agent_id: null, transcript_path: null }, '/here')).toEqual({
      id: 'a',
      directory: '/here',
      isFresh: true,
    });
  });
});

describe('a provider run inside a provider', () => {
  const started = threadOf('real', { launchId: 'l1', ownerProcess: '100' });
  const everyoneAlive = () => true;

  it('is another process claiming a launch that already has one', () => {
    expect(isNestedRun([started], true, 'l1', '200', everyoneAlive)).toBe(true);
  });
  it('is not the provider that started, opening a second thread', () => {
    expect(isNestedRun([started], true, 'l1', '100', everyoneAlive)).toBe(false);
  });
  it('is not a thread that changed in place, which only the real provider can do', () => {
    expect(isNestedRun([started], false, 'l1', '200', everyoneAlive)).toBe(false);
  });
  it('is not the first report of a launch', () => {
    expect(isNestedRun([started], true, 'l2', '200', everyoneAlive)).toBe(false);
  });
  it('cannot be told on a system that has no parent process to report', () => {
    expect(isNestedRun([started], true, 'l1', undefined, everyoneAlive)).toBe(false);
  });
  it('is not a process that is already gone, as a shell that forked for one hook is', () => {
    expect(isNestedRun([started], true, 'l1', '200', () => false)).toBe(false);
  });
});

describe('the launch environment', () => {
  it('names the seat by folder, so a rename changes nothing', () => {
    const env = threadEnvironment({ account: 'work', launchId: 'l1', binary: '/bin/favo' });
    expect(env).toEqual({ FAVO_ACCOUNT: 'work', FAVO_LAUNCH: 'l1', FAVO_BIN: '/bin/favo' });
  });
  it('leaves the binary out when favo runs from source', () => {
    expect(threadEnvironment({ account: 'work', launchId: 'l1' })).not.toHaveProperty('FAVO_BIN');
  });
});

describe('resuming', () => {
  it('uses the provider own words', () => {
    expect(resumeArgumentsOf(Providers.claude, 'a')).toEqual(['--resume', 'a']);
    expect(resumeArgumentsOf(Providers.codex, 'a')).toEqual(['resume', 'a']);
    expect(resumeArgumentsOf(Providers.opencode, 'a')).toEqual(['--session', 'a']);
    expect(resumeArgumentsOf(Providers.antigravity, 'a')).toEqual(['--conversation', 'a']);
  });
});

describe('the list of threads', () => {
  const Later = Date.parse('2026-11-03T12:00:00.000Z');
  const at = (minute: number) => `2026-11-01T12:${String(minute).padStart(2, '0')}:00.000Z`;

  it('puts this folder first, newest first, then everywhere else', () => {
    const threads = [
      threadOf('there-new', { directory: '/other', updatedAt: at(9) }),
      threadOf('here-old', { updatedAt: at(1) }),
      threadOf('here-new', { updatedAt: at(5) }),
    ];
    expect(orderedThreads(threads, '/code/hive').map(({ id }) => id)).toEqual(['here-new', 'here-old', 'there-new']);
  });
  it('treats a folder with a trailing slash as the same folder', () => {
    expect(orderedThreads([threadOf('a')], '/code/hive/').map(({ id }) => id)).toEqual(['a']);
  });
  it('keeps a short list per folder and drops the oldest', () => {
    const threads = Array.from({ length: 7 }, (_, index) => threadOf(`t${index}`, { updatedAt: at(index) }));
    expect(threadsToDrop(threads, () => true, Later).map(({ id }) => id)).toEqual(['t1', 't0']);
  });
  it('counts each folder on its own', () => {
    const threads = Array.from({ length: 6 }, (_, index) =>
      threadOf(`t${index}`, { directory: `/folder-${index}`, updatedAt: at(index) })
    );
    expect(threadsToDrop(threads, () => true, Later)).toEqual([]);
  });
  it('never lets empty sessions push out real threads', () => {
    const real = Array.from({ length: 5 }, (_, index) => threadOf(`real${index}`, { updatedAt: at(index) }));
    const empty = Array.from({ length: 6 }, (_, index) => threadOf(`empty${index}`, { updatedAt: at(index + 10) }));
    const dropped = threadsToDrop([...real, ...empty], ({ id }) => id.startsWith('real'), Later);
    expect(dropped.map(({ id }) => id)).toEqual(['empty0']);
  });
  it('keeps a session that has said nothing yet, which the provider will not report again', () => {
    const quiet = Array.from({ length: 8 }, (_, index) => threadOf(`quiet${index}`, { updatedAt: at(index) }));
    const justOpened = Date.parse(at(30));
    expect(threadsToDrop(quiet, () => false, justOpened)).toEqual([]);
  });
});

describe('choosing a thread', () => {
  const ordered = [threadOf('aaaa-1111'), threadOf('bbbb-2222'), threadOf('bbbb-3333')];

  it('takes the first one when nothing is asked for', () => {
    expect(chooseThread(ordered)?.id).toBe('aaaa-1111');
  });
  it('takes a position from the list', () => {
    expect(chooseThread(ordered, '2')?.id).toBe('bbbb-2222');
  });
  it('takes a whole id or any unique part of one', () => {
    expect(chooseThread(ordered, 'bbbb-3333')?.id).toBe('bbbb-3333');
    expect(chooseThread(ordered, '3333')?.id).toBe('bbbb-3333');
  });
  it('refuses a part that matches two threads', () => {
    expect(() => chooseThread(ordered, 'bbbb')).toThrow('More than one thread matches "bbbb".');
  });
  it('finds nothing for a position past the end', () => {
    expect(chooseThread(ordered, '9')).toBeUndefined();
  });
  it('tells an id from a position', () => {
    expect(isRawThreadId('aaaa-1111')).toBe(true);
    expect(isRawThreadId('3')).toBe(false);
  });
});

describe('showing a thread', () => {
  it('shows the end of an id, which is the part that differs between Codex threads', () => {
    expect(shortThreadId('01a198ba-1a6a-7000-8000-00000000abcd')).toBe('0000abcd');
    expect(shortThreadId('01a198ba-4057-7000-8000-00000000ef01')).toBe('0000ef01');
  });
  it('says how long ago', () => {
    const now = Date.parse('2026-11-02T12:00:00.000Z');
    expect(threadAgeOf('2026-11-02T11:59:30.000Z', now)).toBe('just now');
    expect(threadAgeOf('2026-11-02T11:45:00.000Z', now)).toBe('15m ago');
    expect(threadAgeOf('2026-11-02T09:00:00.000Z', now)).toBe('3h ago');
    expect(threadAgeOf('2026-10-31T12:00:00.000Z', now)).toBe('2d ago');
  });
});
