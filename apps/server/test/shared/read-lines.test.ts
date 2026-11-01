import { describe, expect, it } from 'bun:test';
import { DomainError } from '@favo/domain/shared/domain-error';
import { MaximumLineBytes, readLines, readTail } from '@/shared/rpc/read-lines';
import { serveStdio } from '@/shared/rpc/stdio-server';

function streamOf(...chunks: (string | Uint8Array)[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function linesOf(stream: ReadableStream<Uint8Array>, limit?: number) {
  const lines: string[] = [];
  await readLines(stream, (line) => lines.push(line), limit);
  return lines;
}

describe('reading lines', () => {
  it('rebuilds lines however the chunks fall, and keeps the last one', async () => {
    expect(await linesOf(streamOf('on', 'e\ntwo\n\n  three  \r\nfo', 'ur'))).toEqual(['one', 'two', 'three', 'four']);
  });
  it('keeps a character that a chunk boundary cut in half', async () => {
    const bee = new TextEncoder().encode('🐝\n');
    expect(await linesOf(streamOf(bee.subarray(0, 2), bee.subarray(2)))).toEqual(['🐝']);
  });
  it('accepts a line of exactly the limit', async () => {
    expect(await linesOf(streamOf('12345\n'), 5)).toEqual(['12345']);
  });
  it('fails a line that never ends once it passes the limit', async () => {
    const reading = linesOf(streamOf('123', '456', '789'), 5);
    await expect(reading).rejects.toBeInstanceOf(DomainError);
  });
  it('fails an overlong line that arrives whole, with its newline', async () => {
    await expect(linesOf(streamOf('123456\nnext\n'), 5)).rejects.toMatchObject({ code: 'machineUnreachable' });
  });
  it('stops at the failure, so it never hands over what came after', async () => {
    const lines: string[] = [];
    const reading = readLines(streamOf('ok\n123456\nnext\n'), (line) => lines.push(line), 5);
    await expect(reading).rejects.toBeInstanceOf(DomainError);
    expect(lines).toEqual(['ok']);
  });
  it('allows 16 MiB by default', () => {
    expect(MaximumLineBytes).toBe(16 * 1024 * 1024);
  });
});

describe('reading a tail', () => {
  it('keeps only the last bytes', async () => {
    expect(await readTail(streamOf('aaaa', 'bbbb', 'cc'), 5)).toBe('bbbcc');
  });
  it('keeps everything when it fits', async () => {
    expect(await readTail(streamOf('aa', 'bb'), 5)).toBe('aabb');
  });
});

describe('serveStdio', () => {
  it('says when the input closes, and still answers what was in flight', async () => {
    const events: string[] = [];
    const { promise, resolve } = Promise.withResolvers<void>();
    const router = {
      async send({ id }: { id: number }) {
        await promise;
        return { id, ok: true as const, result: {} };
      },
    };
    const line = `${JSON.stringify({ id: 1, method: 'seats.usage', params: {} })}\n`;
    const serving = serveStdio(
      router,
      streamOf(line),
      () => events.push('answered'),
      () => {
        events.push('closed');
        resolve();
      }
    );
    await serving;
    expect(events).toEqual(['closed', 'answered']);
  });
});

describe('serving on stdio', () => {
  it('ends with a domain error when the other side sends a line that never ends', async () => {
    const huge = new Uint8Array(MaximumLineBytes + 1).fill(120);
    const router = { send: async () => ({ id: 0, ok: true as const, result: {} }) };
    await expect(
      serveStdio(
        router,
        streamOf(huge),
        () => {},
        () => {}
      )
    ).rejects.toBeInstanceOf(DomainError);
  });
});
