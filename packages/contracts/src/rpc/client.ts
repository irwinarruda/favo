import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ownValue } from '@favo/domain/shared/own-value';
import type { z } from 'zod';
import type { RpcTransport } from './envelope';
import type { Method } from './method';

export type RpcCallOptions = { machineId?: string };

export type RpcClient = ReturnType<typeof createRpcClient>;

export function createRpcClient(transport: RpcTransport) {
  let nextId = 1;
  return {
    async call<Params extends z.ZodType, Result extends z.ZodType>(
      method: Method<Params, Result>,
      params: z.input<Params>,
      options: RpcCallOptions = {}
    ): Promise<z.output<Result>> {
      const response = await transport.send({
        id: nextId++,
        method: method.name,
        params: JSON.parse(JSON.stringify(params)),
        machineId: options.machineId,
      });
      if (response.ok) return method.result.parse(response.result);
      const code = ownValue(DomainErrorCode, response.error.code) ?? DomainErrorCode.internal;
      throw new DomainError(code, response.error.message);
    },
  };
}
