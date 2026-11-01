import type { RpcRequest, RpcResponse, RpcTransport } from '@favo/contracts/rpc/envelope';
import { type Method, MethodRouting } from '@favo/contracts/rpc/method';
import { LocalMachineId } from '@favo/domain/machines/machine';
import { DomainError, DomainErrorCode } from '@favo/domain/shared/domain-error';
import { ZodError, type z } from 'zod';

type Handler = (params: unknown) => Promise<unknown>;
type Forward = (request: RpcRequest) => Promise<RpcResponse>;

export class RpcRouter implements RpcTransport {
  private readonly routes = new Map<string, { method: Method; handler: Handler }>();
  private forward?: Forward;

  handle<Params extends z.ZodType, Result extends z.ZodType>(
    method: Method<Params, Result>,
    handler: (params: z.output<Params>) => Promise<z.input<Result>>
  ) {
    this.routes.set(method.name, { method, handler: handler as Handler });
  }

  forwardWith(forward: Forward) {
    this.forward = forward;
  }

  async send(request: RpcRequest): Promise<RpcResponse> {
    try {
      const route = this.routes.get(request.method);
      if (!route) throw new DomainError(DomainErrorCode.unknownMethod, `Unknown method "${request.method}".`);
      const isRemote = request.machineId !== undefined && request.machineId !== LocalMachineId;
      if (isRemote && route.method.routing === MethodRouting.machine && this.forward)
        return checkedReply(route.method, request, await this.forward(request));
      const result = await route.handler(route.method.params.parse(request.params));
      return { id: request.id, ok: true, result: route.method.result.parse(result) };
    } catch (error) {
      return { id: request.id, ok: false, error: rpcErrorOf(error) };
    }
  }
}

function checkedReply(method: Method, request: RpcRequest, reply: RpcResponse) {
  if (!reply.ok || method.result.safeParse(reply.result).success) return reply;
  throw new DomainError(DomainErrorCode.machineOutdated, `${request.machineId} sent a reply favo could not read.`);
}

function rpcErrorOf(error: unknown) {
  if (error instanceof DomainError) return { code: error.code, message: error.message };
  if (error instanceof ZodError) return { code: DomainErrorCode.invalidParams, message: error.message };
  return { code: DomainErrorCode.internal, message: error instanceof Error ? error.message : String(error) };
}
