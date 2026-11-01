import { z } from 'zod';

export const Protocol = 5;

export const RpcRequest = z.strictObject({
  id: z.number(),
  method: z.string(),
  params: z.unknown(),
  machineId: z.string().optional(),
});
export type RpcRequest = z.infer<typeof RpcRequest>;

export const RpcResponse = z.discriminatedUnion('ok', [
  z.strictObject({ id: z.number(), ok: z.literal(true), result: z.unknown() }),
  z.strictObject({
    id: z.number(),
    ok: z.literal(false),
    error: z.strictObject({ code: z.string(), message: z.string() }),
  }),
]);
export type RpcResponse = z.infer<typeof RpcResponse>;

export type RpcTransport = {
  send(request: RpcRequest): Promise<RpcResponse>;
};
