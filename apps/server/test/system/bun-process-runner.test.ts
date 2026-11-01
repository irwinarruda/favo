import { describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { BunProcessRunner } from '@/modules/system/gateways/bun.process-runner';
import { MaximumLineBytes } from '@/shared/rpc/read-lines';

const runner = new BunProcessRunner(process.env, false);

async function waitFor(isDone: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await isDone()) return;
    await Bun.sleep(20);
  }
  throw new Error('It never happened.');
}

function sh(script: string) {
  return { command: 'sh', args: ['-c', script] };
}

describe.skipIf(process.platform === 'win32')('the process runner', () => {
  it('keeps a bounded tail of what a command prints', async () => {
    const bytes = MaximumLineBytes + 1024;
    const result = await runner.run(
      sh(`head -c ${bytes} /dev/zero | tr '\\0' x; head -c 200000 /dev/zero | tr '\\0' y >&2`)
    );
    expect(result.stdout).toHaveLength(MaximumLineBytes);
    expect(result.stderr).toHaveLength(64 * 1024);
    expect(result.code).toBe(0);
  });
  it('leaves a detached process running with what it was given', async () => {
    const file = `${tmpdir()}/favo-detach-${process.pid}-${Date.now()}`;
    const isDetached = runner.detach({
      ...sh('sleep 0.1; echo "$FAVO_DETACHED" > "$FILE"'),
      env: { FAVO_DETACHED: 'yes', FILE: file },
    });
    expect(isDetached).toBe(true);
    await waitFor(() => Bun.file(file).exists());
    await Bun.sleep(50);
    expect(await Bun.file(file).text()).toBe('yes\n');
    await Bun.file(file).delete();
  });
  it('says so when there is nothing to detach', () => {
    expect(runner.detach({ command: '/nonexistent/favo-app', args: [] })).toBe(false);
  });
  it('keeps a bounded tail of stderr on a long connection, with its last line', async () => {
    const child = runner.open(sh(`head -c 500000 /dev/zero | tr '\\0' y >&2; echo; echo last words >&2; exit 3`));
    const { code, stderr } = await child.exited;
    expect(code).toBe(3);
    expect(stderr).toHaveLength(64 * 1024);
    expect(stderr).toEndWith('last words\n');
  });
  it('fails a connection whose line never ends, and stops the process', async () => {
    const child = runner.open(sh(`head -c ${MaximumLineBytes + 1024} /dev/zero | tr '\\0' x; sleep 30`));
    const { failure } = await child.exited;
    expect(failure).toContain(`a line passed the ${MaximumLineBytes} byte limit`);
  });
  it('fails a connection whose input closed, without an error nobody can catch', async () => {
    const child = runner.open(sh('exec 0<&-; exec sleep 30'));
    await Bun.sleep(100);
    child.write('hello');
    const { failure } = await child.exited;
    expect(failure).toContain('EPIPE');
  });
  it('fails at once, even when something it started keeps the pipes open', async () => {
    const child = runner.open(sh(`sleep 30 & head -c ${MaximumLineBytes + 1024} /dev/zero | tr '\\0' x; wait`));
    const { failure } = await child.exited;
    expect(failure).toContain('byte limit');
  });
  it('keeps a long line whole across many reads of a real pipe', async () => {
    const child = runner.open(sh(`seq 1 500000 | tr '\\n' ' '; echo; echo after`));
    const lines: string[] = [];
    child.onLine((line) => lines.push(line));
    while (lines.length < 2) await Bun.sleep(5);
    const expected = Array.from({ length: 500_000 }, (_, index) => index + 1).join(' ');
    expect(lines[0] === expected).toBe(true);
    expect(lines[1]).toBe('after');
  });
  it('still reads lines and answers on a healthy connection', async () => {
    const child = runner.open(sh('read line; echo "you said $line"'));
    const lines: string[] = [];
    child.onLine((line) => lines.push(line));
    child.write('hi');
    const { code, failure } = await child.exited;
    expect({ code, failure, lines }).toEqual({ code: 0, failure: undefined, lines: ['you said hi'] });
  });
});
