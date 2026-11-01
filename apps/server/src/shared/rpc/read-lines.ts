import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';

export const MaximumLineBytes = 16 * 1024 * 1024;

const LineFeed = 10;

export async function readLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  maximumLineBytes = MaximumLineBytes
) {
  const reader = stream.getReader();
  let pieces: Uint8Array[] = [];
  let pieceBytes = 0;

  async function hold(piece: Uint8Array) {
    pieces.push(piece);
    pieceBytes += piece.length;
    if (pieceBytes <= maximumLineBytes) return;
    await reader.cancel();
    throw new DomainError(DomainErrorCode.machineUnreachable, `a line passed the ${maximumLineBytes} byte limit`);
  }

  function finishLine() {
    const line = Buffer.concat(pieces).toString('utf8').trim();
    pieces = [];
    pieceBytes = 0;
    if (line.length > 0) onLine(line);
  }

  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    let rest = read.value;
    for (let index = rest.indexOf(LineFeed); index >= 0; index = rest.indexOf(LineFeed)) {
      await hold(rest.subarray(0, index));
      finishLine();
      rest = rest.subarray(index + 1);
    }
    await hold(rest);
  }
  finishLine();
}

export async function readTail(stream: ReadableStream<Uint8Array>, maximumBytes: number) {
  const reader = stream.getReader();
  const pieces: Uint8Array[] = [];
  let pieceBytes = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    pieces.push(read.value);
    pieceBytes += read.value.length;
    while (pieceBytes - pieces[0]!.length >= maximumBytes) pieceBytes -= pieces.shift()!.length;
  }
  return Buffer.concat(pieces).subarray(-maximumBytes).toString('utf8');
}
