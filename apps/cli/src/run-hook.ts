import { createRpcClient } from '@favo/contracts/rpc/client';
import { recordThread } from '@favo/contracts/rpc/threads/record-thread';
import { reportThread } from '@favo/contracts/rpc/threads/report-thread';
import { findProvider } from '@favo/domain/providers/provider';
import { threadEventOf } from '@favo/domain/threads/thread';
import { createProductionServer } from '@favo/server/production';

export const HookCommand = 'hook';
const ReportFlag = '--report';
const ByteOrderMarks = /^\uFEFF+/;

export async function runHook(args: string[], env: Record<string, string | undefined>) {
  try {
    const [name, second, third] = args;
    const provider = findProvider(name ?? '')?.id;
    if (!provider || !env.FAVO_ACCOUNT) return 0;
    const server = createProductionServer(env);
    await server.prepare();
    const client = createRpcClient(server.router);
    if (second === ReportFlag && third) {
      await client.call(reportThread, { provider, id: third });
    } else {
      const event = threadEventOf(JSON.parse((await Bun.stdin.text()).replace(ByteOrderMarks, '')), process.cwd());
      if (event) await client.call(recordThread, { provider, ownerProcess: second, ...event });
    }
    server.close();
  } catch {}
  return 0;
}
