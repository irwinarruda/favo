import { RpcRequest, type RpcTransport } from '@favo/contracts/rpc/envelope';
import { readLines } from '@/shared/rpc/read-lines';

export async function serveStdio(
  router: RpcTransport,
  input: ReadableStream<Uint8Array>,
  write: (line: string) => void,
  onInputClosed: () => void
) {
  const inFlight = new Set<Promise<void>>();
  await readLines(input, (line) => {
    const parsed = RpcRequest.safeParse(safeJson(line));
    if (!parsed.success) return;
    const reply = router.send(parsed.data).then((response) => write(JSON.stringify(response)));
    inFlight.add(reply);
    void reply.finally(() => inFlight.delete(reply));
  });
  onInputClosed();
  await Promise.all(inFlight);
}

function safeJson(line: string) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
