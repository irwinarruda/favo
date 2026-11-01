import { Protocol } from '@favo/contracts/rpc/envelope';
import { ping } from '@favo/contracts/rpc/system/ping';
import { FavoVersion } from '@favo/contracts/version';
import type { HostFacts } from '@/shared/config/host-facts';
import type { RpcRouter } from '@/shared/rpc/rpc-router';

export function registerSystemController(router: RpcRouter, host: HostFacts) {
  router.handle(ping, async () => ({ version: FavoVersion, protocol: Protocol, ...host }));
}
